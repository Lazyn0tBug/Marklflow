import DOMPurify from 'dompurify';
import {parse,walk,generate} from 'css-tree';
import {safeUrl,cleanStyle} from '../policy/htmlRules';
export {escapeHtml,safeUrl,cleanStyle,documentColor,rewriteFragments} from '../policy/htmlRules';
export {themeSchema} from '../model/themeSchema';
// Compatibility exports remain browser-side; pure modules import policy/model directly.
let documentPurify:ReturnType<typeof DOMPurify>|undefined;
function getDocumentPurify():ReturnType<typeof DOMPurify>{
 if(documentPurify)return documentPurify;
 if(typeof window==='undefined')throw new Error('HTML净化需要浏览器DOM宿主');
 const instance=DOMPurify(window);
instance.addHook('uponSanitizeAttribute',(_node,data)=>{
 const name=data.attrName.toLowerCase();
 if(name==='class'){data.attrValue=data.attrValue.split(/\s+/).filter(v=>/^(mf-|markflow-|language-)/.test(v)).join(' ');if(!data.attrValue)data.keepAttr=false}
 if(['fill','stroke','filter','clip-path','mask','marker-start','marker-mid','marker-end'].includes(name)){
  try{walk(parse(data.attrValue,{context:'value'}),n=>{if(n.type==='Url'&&!n.value.startsWith('#')||n.type==='Raw'||n.type==='Function'&&/^(var|env|attr)$/i.test(n.name))data.keepAttr=false})}catch{data.keepAttr=false}
 }
 if(_node.nodeName.toLowerCase()==='use'&&['href','xlink:href'].includes(name)&&!data.attrValue.startsWith('#'))data.keepAttr=false;
 if(name==='style'){data.attrValue=cleanStyle(data.attrValue);if(!data.attrValue)data.keepAttr=false}
 if(['href','xlink:href','src'].includes(name)&&!safeUrl(data.attrValue,name==='src'||_node.nodeName.toLowerCase()==='image'))data.keepAttr=false;
});
 documentPurify=instance;return instance;
}
export function sanitizeDocumentHtml(html:string,allowGeneratedData=true):string {
 return getDocumentPurify().sanitize(html,{
  USE_PROFILES:{html:true,svg:true,svgFilters:true,mathMl:true},
  ADD_TAGS:['use','mjx-container'],
  FORBID_TAGS:['script','style','iframe','object','embed','form','input','textarea','select','button','link','meta','base','foreignObject','video','audio','canvas','animate','animateMotion','animateTransform','set'],
  FORBID_ATTR:['srcset','srcdoc','autofocus','contenteditable','formaction','ping'],ALLOW_DATA_ATTR:allowGeneratedData,
 });
}
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
