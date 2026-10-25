import mermaid from 'mermaid';
import {sharedDom,type DomScheduling} from '../platform/web/sharedDom';
import { escapeHtml, sanitizeDocumentHtml } from './htmlPolicy';
let nextId=0;
function initMermaid(_isDark=false) {
 mermaid.initialize({startOnLoad:false,theme:'default',securityLevel:'strict',htmlLabels:false,flowchart:{htmlLabels:false},fontFamily:'system-ui'});
}
export function renderMermaidDiagram(code:string,_isDark=false,options:DomScheduling={}):Promise<string> {
 return sharedDom.step(options.priority??'foreground','engine',options.signal??new AbortController().signal,async({resources,signal})=>{
  resources.register('mermaid-config','host',0,()=>{initMermaid()});
  initMermaid();
  // Inline computed SVG presentation before removing generated style rules.
  const host=document.createElement('div');
  host.style.cssText='position:fixed;left:-20000px;top:0;width:900px;visibility:hidden';
  host.dataset.mermaidHost='true';resources.register('mermaid-host','host',0,()=>{host.remove()});document.body.append(host);
  const {svg}=await mermaid.render('mf_mermaid_'+(++nextId),code.trim(),host);
  if(signal.aborted)throw new Error('Mermaid 渲染已取消');
  host.innerHTML=svg;
  const root=host.firstElementChild;
  if(host.children.length!==1||root?.localName!=='svg'||root.namespaceURI!=='http://www.w3.org/2000/svg')throw new Error('Mermaid SVG 输出结构无效');
  if(host.querySelector('foreignObject'))throw new Error('Unsupported HTML labels in generated SVG');
  for(const el of host.querySelectorAll('svg *')) {
   if(el.tagName.toLowerCase()==='style')continue;
   const style=getComputedStyle(el);
   for(const property of ['fill','stroke','stroke-width','font-family','font-size','font-weight','text-anchor','dominant-baseline','opacity','stroke-dasharray']) {
    const v=style.getPropertyValue(property);
    if(v&&!v.includes('url('))el.setAttribute(property,v);
   }
  }
  return sanitizeDocumentHtml(host.innerHTML);
 });
}
export function mermaidError(code:string,error:unknown):string {
 return '<pre class="mf-diagnostic">'+escapeHtml('Mermaid 无法渲染：'+String(error)+'\n'+code)+'</pre>';
}
