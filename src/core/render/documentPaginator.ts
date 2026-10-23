import { parse,walk,generate } from 'css-tree';
import type {DocumentRecord} from '../model/document';
import {renderDocument,assertArtifact,throwIfAborted} from './documentRenderer';
import {collectAssets} from '../export/documentAssets';
import {DOCUMENT_CSS,documentStyleAttribute} from './documentPresentation';
import {printCss,waitForLayout,withDeadline} from '../export/documentPrint';
export interface PaginatedDocument {html:string;css:string;total:number}
let queue:Promise<unknown>=Promise.resolve();
export function paginateDocument(input:DocumentRecord,signal?:AbortSignal):Promise<PaginatedDocument>{
 const doc=structuredClone(input);
 const task=async()=>{
  throwIfAborted(signal);
  const artifact=await renderDocument(doc.markdown,doc.options.mathMode,signal);assertArtifact(artifact);
  const collected=await collectAssets(artifact.html,doc.assets,false);throwIfAborted(signal);
  const stage=document.createElement('div');
  stage.style.cssText='position:fixed;left:-20000px;top:0;width:794px;visibility:hidden;pointer-events:none';
  const source=document.createElement('div'),target=document.createElement('div');
  source.innerHTML='<article class="mf-document-shell mf-doc" style="'+documentStyleAttribute(doc.theme)+'">'+collected.html+'</article>';
  for(const item of source.querySelectorAll('details'))item.setAttribute('open','');
  stage.append(source,target);document.body.append(stage);
  const existing=new Set(document.querySelectorAll('style'));
  const printTree=parse(DOCUMENT_CSS+printCss(doc));
  walk(printTree,{visit:'Atrule',enter(node,item,list){if(node.name.toLowerCase()==='container'&&item&&list)list.remove(item)}});
  const paginationCss=generate(printTree);
  let paged:InstanceType<typeof import('pagedjs').Previewer>|undefined;
  try{
   await waitForLayout(source);throwIfAborted(signal);
   const {Previewer}=await import('pagedjs');paged=new Previewer();
   const flow=await withDeadline(paged.preview(source.innerHTML,[{[location.href]:paginationCss}],target),'分页超时',60000);
   throwIfAborted(signal);
   const css=Array.from(document.querySelectorAll('style')).filter(s=>!existing.has(s)).map(s=>s.textContent||'').join('\n');
   const pages=target.querySelector('.pagedjs_pages');if(!pages||!flow.total)throw new Error('分页没有生成页面');
   // Keep all content, including page fragments with their data-line mappings.
   return {html:pages.outerHTML,css:DOCUMENT_CSS+css,total:flow.total};
  }finally{
   try{paged?.chunker.destroy();paged?.polisher.destroy()}finally{stage.remove()}
  }
 };
 const result=queue.then(task,task);queue=result.catch(()=>undefined);return result;
}
