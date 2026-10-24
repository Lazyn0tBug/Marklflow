import mermaid from 'mermaid';
import { escapeHtml, sanitizeDocumentHtml } from './htmlPolicy';
let queue:Promise<unknown>=Promise.resolve();
let nextId=0;
export function initMermaid(_isDark=false) {
 mermaid.initialize({startOnLoad:false,theme:'default',securityLevel:'strict',htmlLabels:false,flowchart:{htmlLabels:false},fontFamily:'system-ui'});
}
export function renderMermaidDiagram(code:string,_isDark=false):Promise<string> {
 const task=async()=>{
  initMermaid();
  // Inline computed SVG presentation before removing generated style rules.
  const host=document.createElement('div');
  host.style.cssText='position:fixed;left:-20000px;top:0;width:900px;visibility:hidden';
  host.dataset.mermaidHost='true';document.body.append(host);
  try {
   const {svg}=await mermaid.render('mf_mermaid_'+(++nextId),code.trim(),host);
   host.innerHTML=svg;
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
  } finally {host.remove()}
 };
 const result=queue.then(task,task);queue=result.catch(()=>undefined);return result;
}
export function mermaidError(code:string,error:unknown):string {
 return '<pre class="mf-diagnostic">'+escapeHtml('Mermaid 无法渲染：'+String(error)+'\n'+code)+'</pre>';
}
