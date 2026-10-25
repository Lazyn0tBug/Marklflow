import {mathExpressions} from '../parse/markdown';
import {parseMarkdownDocument} from './markdownHtml';
import { prepareMath } from './mathRender';
import type {DomScheduling} from '../platform/web/sharedDom';
import {renderDotDiagram} from './diagramRender';
import { renderMermaidDiagram,mermaidError } from './mermaidRender';
import { sanitizeDocumentHtml,escapeHtml,rewriteFragments } from './htmlPolicy';
export interface RenderDiagnostic {nodeId:string;message:string;severity:'error'|'warning'}
export interface DocumentArtifact {html:string;diagnostics:RenderDiagnostic[]}
let sequence=0;
export function throwIfAborted(signal?:AbortSignal):void {if(signal?.aborted)throw new DOMException('已取消','AbortError')}
export function uniqueSvgIds(root:HTMLElement):void {
 for(const svg of root.querySelectorAll('svg')){
  const prefix='mf_svg_'+(++sequence)+'_';
  const ids=new Map<string,string>();
  for(const el of [svg,...svg.querySelectorAll('[id]')])if(el.id){ids.set(el.id,prefix+ids.size);el.id=ids.get(el.id)!}
  for(const el of [svg,...svg.querySelectorAll('*')])for(const attr of [...el.attributes]){
   const value=rewriteFragments(attr.value,ids,attr.name);
   if(value!==attr.value)el.setAttribute(attr.name,value);
  }
 }
}
export async function renderDocument(markdown:string,mode:'mathml'|'svg',signal?:AbortSignal,scheduling:Omit<DomScheduling,'signal'>={}):Promise<DocumentArtifact> {
 throwIfAborted(signal);
 const options={...scheduling,...(signal?{signal}:{})};
 const preparedMath=await prepareMath(mathExpressions(markdown,true),mode,options);
 throwIfAborted(signal);
 const parsed=parseMarkdownDocument(markdown,{mathMode:mode,preparedMath});
 const root=document.createElement('div');root.innerHTML=parsed.html;
 const diagnostics:RenderDiagnostic[]=[...parsed.diagnostics];
 for(const el of root.querySelectorAll<HTMLElement>('[data-mermaid-code],[data-dot-code]')){
  throwIfAborted(signal);
  const isMermaid=el.dataset.mermaidCode!==undefined;
  const source=decodeURIComponent((isMermaid?el.dataset.mermaidCode:el.dataset.dotCode)!);
  try{el.innerHTML=await (isMermaid?renderMermaidDiagram(source,false,options):renderDotDiagram(source,options))}catch(error){
   throwIfAborted(signal);
   diagnostics.push({nodeId:'line-'+el.dataset.line,message:String(error),severity:'error'});el.innerHTML=isMermaid?mermaidError(source,error):'<pre class="mf-diagnostic">'+escapeHtml('DOT 无法渲染：'+String(error)+'\n'+source)+'</pre>';
  }
  el.removeAttribute('data-mermaid-code');el.removeAttribute('data-dot-code');
 }
 throwIfAborted(signal);
 root.innerHTML=sanitizeDocumentHtml(root.innerHTML);uniqueSvgIds(root);
 for(const use of root.querySelectorAll('svg use')){const href=use.getAttribute('href')||use.getAttribute('xlink:href');const svg=use.closest('svg');if(!href?.startsWith('#')||!Array.from(svg?.querySelectorAll('[id]')||[]).some(el=>el.id===href.slice(1)))diagnostics.push({nodeId:use.closest('[data-line]')?.getAttribute('data-line')||'svg',message:'SVG字形引用缺失或不是自包含引用',severity:'error'})}
 for(const image of root.querySelectorAll('img:not([src])'))diagnostics.push({nodeId:image.getAttribute('data-line')||'image',message:'图片来源被拒绝或缺失',severity:'error'});
 for(const el of root.querySelectorAll('.markflow-dot-error,[data-mjx-error],merror'))diagnostics.push({nodeId:el.closest('[data-line]')?.getAttribute('data-line')||'unknown',message:el.textContent||'渲染失败',severity:'error'});
 if(diagnostics.length){const notice=document.createElement('aside');notice.className='mf-diagnostic';notice.setAttribute('role','note');notice.innerHTML='<strong>内容兼容性提示</strong><ul>'+diagnostics.map(d=>'<li>'+escapeHtml(d.nodeId+'：'+d.message)+'</li>').join('')+'</ul>';root.prepend(notice)}
 return {html:root.innerHTML,diagnostics};
}
export function assertArtifact(artifact:DocumentArtifact):void{
 if(artifact.diagnostics.some(d=>d.severity==='error'))throw new Error(artifact.diagnostics.map(d=>d.nodeId+': '+d.message).join('\n'));
}
