import DOMPurify from 'dompurify';
import { parse, walk, generate, lexer } from 'css-tree';
import { z } from 'zod';
// Keep document hooks isolated from Mermaid's own DOMPurify instance.
const documentPurify=DOMPurify(window);
export function escapeHtml(v:string):string {
 return v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
}
export function safeUrl(value:string,image=false):boolean {
 const v=value.trim();
 if(/[\u0000-\u0020\u007f]/.test(v))return false;
 if(v.startsWith('#'))return true;
 if(image&&/^data:image\/(png|jpeg|gif|webp|avif|svg\+xml);base64,[a-z0-9+/=]+$/i.test(v))return true;
 if(image&&/^blob:https?:\/\//i.test(v))return true;
 if(image&&/^(asset:\/\/localhost\/|https?:\/\/asset\.localhost\/)/i.test(v))return true;
 if(/^(https?:|mailto:)/i.test(v))return image?/^https?:/i.test(v):true;
 return !/^[a-z][\w+.-]*:|^\/\//i.test(v);
}
const styles=new Set(['text-align','vertical-align','display','width','height','max-width','min-width','font-size','font-family','font-weight','font-style','line-height','color','background-color','margin','margin-top','margin-bottom','margin-left','margin-right','padding','overflow','overflow-x','white-space','fill','stroke','stroke-width','opacity']);
export function cleanStyle(value:string):string {
 try {
  const tree=parse(value,{context:'declarationList'}),out:string[]=[];
  if(tree.type!=='DeclarationList')return ''; 
  tree.children.forEach(n=>{
   if(n.type!=='Declaration'||!styles.has(n.property.toLowerCase())||n.important)return;
   let valid=true;walk(n.value,x=>{if(x.type==='Url'||x.type==='Raw'||(x.type==='Function'&&/^(var|env|expression|attr)$/i.test(x.name)))valid=false});
   if(valid&&lexer.matchProperty(n.property,n.value).matched)out.push(generate(n));
  });return out.join(';');
 }catch{return ''}
}
documentPurify.addHook('uponSanitizeAttribute',(_node,data)=>{
 const name=data.attrName.toLowerCase();
 if(name==='class'){data.attrValue=data.attrValue.split(/\s+/).filter(v=>/^(mf-|markflow-|language-)/.test(v)).join(' ');if(!data.attrValue)data.keepAttr=false}
 if(['fill','stroke','filter','clip-path','mask','marker-start','marker-mid','marker-end'].includes(name)){
  try{walk(parse(data.attrValue,{context:'value'}),n=>{if(n.type==='Url'&&!n.value.startsWith('#')||n.type==='Raw'||n.type==='Function'&&/^(var|env|attr)$/i.test(n.name))data.keepAttr=false})}catch{data.keepAttr=false}
 }
 if(_node.nodeName.toLowerCase()==='use'&&['href','xlink:href'].includes(name)&&!data.attrValue.startsWith('#'))data.keepAttr=false;
 if(name==='style'){data.attrValue=cleanStyle(data.attrValue);if(!data.attrValue)data.keepAttr=false}
 if(['href','xlink:href','src'].includes(name)&&!safeUrl(data.attrValue,name==='src'||_node.nodeName.toLowerCase()==='image'))data.keepAttr=false;
});
export function sanitizeDocumentHtml(html:string,allowGeneratedData=true):string {
 return documentPurify.sanitize(html,{
  USE_PROFILES:{html:true,svg:true,svgFilters:true,mathMl:true},
  ADD_TAGS:['use','mjx-container'],
  FORBID_TAGS:['script','style','iframe','object','embed','form','input','textarea','select','button','link','meta','base','foreignObject','video','audio','canvas','animate','animateMotion','animateTransform','set'],
  FORBID_ATTR:['srcset','srcdoc','autofocus','contenteditable','formaction','ping'],ALLOW_DATA_ATTR:allowGeneratedData,
  ALLOWED_URI_REGEXP:/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|asset):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
 });
}
export function documentColor(value:string):string {
 if(!/^#[\da-f]{3,8}$/i.test(value)&&!/^rgba?\(/i.test(value))throw new Error('文档颜色必须使用 HEX/RGB');
 const tree=parse(value,{context:'value'});
 if(!lexer.matchProperty('color',tree).matched)throw new Error('文档颜色无效');
 let invalid=false;walk(tree,n=>{if(n.type==='Url'||n.type==='Raw'||(n.type==='Function'&&!/^rgba?$/i.test(n.name)))invalid=true});
 if(invalid)throw new Error('文档颜色无效');return generate(tree);
}
export const themeSchema=z.object({
 fontFamily:z.enum(['sans','serif','mono']),fontSize:z.number().min(9).max(40),lineHeight:z.number().min(1).max(3),
 primaryColor:z.string().refine(v=>{try{documentColor(v);return true}catch{return false}}),
 paperTheme:z.enum(['clean-white','warm-paper','dark-slate']),paperSize:z.literal('A4'),
 margins:z.object({top:z.number().min(0).max(60),bottom:z.number().min(0).max(60),left:z.number().min(0).max(60),right:z.number().min(0).max(60)}),
});

export interface ContentDiagnostic {nodeId:string;message:string;severity:'error'|'warning'}
/** Inspect only author HTML; generated plugin markup uses the same sanitizer without author diagnostics. */
export function inspectAuthorHtml(value:string,line:number):ContentDiagnostic[]{
 const root=document.createElement('template');root.innerHTML=value;
 const diagnostics:ContentDiagnostic[]=[];
 const add=(message:string,severity:'error'|'warning'='warning')=>diagnostics.push({nodeId:'line-'+line,message,severity});
 for(const el of root.content.querySelectorAll('*')){
  const tag=el.localName;
  if(['style','link','iframe','object','embed','canvas','video','audio','input','textarea','select','button','form','foreignObject','animate','animateMotion','animateTransform','set'].includes(tag)||tag.includes('-'))add('当前静态模式不支持 '+tag+'，请提供静态语义替代','error');
  if(tag==='script')add('已移除作者 script；静态文档不执行脚本');
  for(const attr of Array.from(el.attributes)){
   if(attr.name==='class'&&attr.value.split(/\s+/).some(v=>v&&!/^(mf-|markflow-|language-)/.test(v)))add('未注册的作者 CSS 类已移除，原文保留');
   if(['srcset','srcdoc','contenteditable','autofocus','formaction','ping'].includes(attr.name))add('当前模式已移除属性 '+attr.name);
   if(/^on/i.test(attr.name))add('已移除事件属性 '+attr.name);
   if(['src','href','xlink:href'].includes(attr.name)&&!safeUrl(attr.value,attr.name==='src'||tag==='image'))add('已拒绝资源/链接 '+attr.name);
   if(attr.name==='style'){
    try{if(generate(parse(attr.value,{context:'declarationList'})).replace(/;$/,'')!==cleanStyle(attr.value))add('部分 CSS 声明不在静态模式允许范围，已移除')}catch{add('无效 CSS 声明已移除')}
   }
  }
 }
 return diagnostics;
}

/** Rewrite fragment references with CSS parsing, including quoted URL() and escaped identifiers. */
export function rewriteFragments(value:string,ids:Map<string,string>,attribute:string):string{
 if(['href','xlink:href','xLinkHref'].includes(attribute)&&value.startsWith('#'))return '#'+(ids.get(value.slice(1))||value.slice(1));
 if(['aria-labelledby','aria-describedby'].includes(attribute))return value.split(/\s+/).map(id=>ids.get(id)||id).join(' ');
 if(!['fill','stroke','filter','clip-path','clipPath','mask','marker-start','marker-mid','marker-end','markerStart','markerMid','markerEnd','style'].includes(attribute))return value;
 try{const tree=parse(value,{context:attribute==='style'?'declarationList':'value'});let changed=false;walk(tree,n=>{if(n.type==='Url'&&n.value.startsWith('#')&&ids.has(n.value.slice(1))){n.value='#'+ids.get(n.value.slice(1));changed=true}});return changed?generate(tree):value}catch{return value}
}
