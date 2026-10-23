import { mathExpressions,parseMarkdownToHtml } from '../parser/markdownParser';
import { prepareMath } from './mathRender';
import { renderMermaidDiagram,mermaidError } from './mermaidRender';
import { sanitizeDocumentHtml } from './htmlPolicy';
export interface RenderDiagnostic {nodeId:string;message:string;severity:'error'|'warning'}
export interface DocumentArtifact {html:string;diagnostics:RenderDiagnostic[]}
let serial:Promise<unknown>=Promise.resolve(),sequence=0;
export function throwIfAborted(signal?:AbortSignal):void {if(signal?.aborted)throw new DOMException('已取消','AbortError')}
export function uniqueSvgIds(root:HTMLElement):void {
 const prefix='mf_svg_'+(++sequence)+'_';
 for(const svg of root.querySelectorAll('svg')){
  const ids=new Map<string,string>();
  for(const el of [svg,...svg.querySelectorAll('[id]')])if(el.id){ids.set(el.id,prefix+ids.size);el.id=ids.get(el.id)!}
  for(const el of [svg,...svg.querySelectorAll('*')])for(const attr of [...el.attributes]){
   let value=attr.value;
   for(const [old,id]of ids){if(value==='#'+old)value='#'+id;value=value.split('url(#'+old+')').join('url(#'+id+')')}
   if(value!==attr.value)el.setAttribute(attr.name,value);
  }
 }
}
export function renderDocument(markdown:string,mode:'mathml'|'svg',signal?:AbortSignal):Promise<DocumentArtifact> {
 const task=async()=>{
  throwIfAborted(signal);await prepareMath(mathExpressions(markdown),mode);throwIfAborted(signal);
  const root=document.createElement('div');root.innerHTML=parseMarkdownToHtml(markdown,{mathMode:mode});
  const diagnostics:RenderDiagnostic[]=[];
  for(const el of root.querySelectorAll<HTMLElement>('[data-mermaid-code]')){
   throwIfAborted(signal);
   const source=decodeURIComponent(el.dataset.mermaidCode!);
   try{el.innerHTML=await renderMermaidDiagram(source)}catch(error){
    diagnostics.push({nodeId:'line-'+el.dataset.line,message:String(error),severity:'error'});el.innerHTML=mermaidError(source,error);
   }
   el.removeAttribute('data-mermaid-code');
  }
  throwIfAborted(signal);
  root.innerHTML=sanitizeDocumentHtml(root.innerHTML);uniqueSvgIds(root);
  for(const el of root.querySelectorAll('.markflow-dot-error,[data-mjx-error],merror'))diagnostics.push({nodeId:el.closest('[data-line]')?.getAttribute('data-line')||'unknown',message:el.textContent||'渲染失败',severity:'error'});
  return {html:root.innerHTML,diagnostics};
 };
 const result=serial.then(task,task);serial=result.catch(()=>undefined);return result;
}
export function assertArtifact(artifact:DocumentArtifact):void{
 if(artifact.diagnostics.some(d=>d.severity==='error'))throw new Error(artifact.diagnostics.map(d=>d.nodeId+': '+d.message).join('\n'));
}
