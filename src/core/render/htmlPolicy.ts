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
 if(image&&/^data:image\/(png|jpeg|gif|webp|avif);base64,[a-z0-9+/=]+$/i.test(v))return true;
 if(image&&/^blob:https?:\/\//i.test(v))return true;
 if(/^(https?:|mailto:)/i.test(v))return image?/^https?:/i.test(v):true;
 return !/^[a-z][\w+.-]*:|^\/\//i.test(v);
}
const styles=new Set(['text-align','vertical-align','display','width','height','max-width','min-width','font-size','font-family','font-weight','font-style','line-height','color','background-color','margin','margin-top','margin-bottom','margin-left','margin-right','padding','overflow','overflow-x','white-space','fill','stroke','stroke-width','opacity']);
function cleanStyle(value:string):string {
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
 if(['fill','stroke','filter','clip-path','mask','marker-start','marker-mid','marker-end'].includes(name)&&data.attrValue.includes('url(')){try{walk(parse(data.attrValue,{context:'value'}),n=>{if(n.type==='Url'&&!n.value.startsWith('#'))data.keepAttr=false})}catch{data.keepAttr=false}}
 if(_node.nodeName.toLowerCase()==='use'&&['href','xlink:href'].includes(name)&&!data.attrValue.startsWith('#'))data.keepAttr=false;
 if(name==='style'){data.attrValue=cleanStyle(data.attrValue);if(!data.attrValue)data.keepAttr=false}
 if(['href','xlink:href','src'].includes(name)&&!safeUrl(data.attrValue,name==='src'||_node.nodeName.toLowerCase()==='image'))data.keepAttr=false;
});
export function sanitizeDocumentHtml(html:string,allowGeneratedData=true):string {
 return documentPurify.sanitize(html,{
  USE_PROFILES:{html:true,svg:true,svgFilters:true,mathMl:true},
  ADD_TAGS:['use','mjx-container'],
  FORBID_TAGS:['script','style','iframe','object','embed','form','input','textarea','select','button','link','meta','base','foreignObject','video','audio','canvas'],
  FORBID_ATTR:['srcset','srcdoc','autofocus','contenteditable','formaction','ping'],ALLOW_DATA_ATTR:allowGeneratedData,
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
