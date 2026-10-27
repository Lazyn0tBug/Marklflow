import {loadPagedAdapter,type PagedAdapter} from './pagedJsAdapter';
import { parse,walk,generate } from 'css-tree';
import {documentSchema} from '../model/documentSchema';
import type {DocumentRecord} from '../model/document';
import {renderDocument,assertArtifact,throwIfAborted} from './documentRenderer';
import {collectAssets} from '../export/documentAssets';
import {DOCUMENT_CSS,documentStyleAttribute} from './documentPresentation';
import {printCss,waitForLayout,withDeadline} from '../export/documentPrint';
export interface PaginatedDocument {html:string;css:string;total:number}
let queue:Promise<unknown>=Promise.resolve();
export function paginateDocument(input:DocumentRecord,signal?:AbortSignal):Promise<PaginatedDocument>{
 const doc=documentSchema.parse(structuredClone(input));
 let pendingCleanup:Promise<unknown>|undefined;
 const task=async()=>{
  throwIfAborted(signal);
  const artifact=await renderDocument(doc.markdown,doc.options.mathMode,signal,doc.meta?.filePath);assertArtifact(artifact);
  const collected=await collectAssets(artifact.html,doc.assets,false);throwIfAborted(signal);
  const stage=document.createElement('div');stage.className='mf-pagination';
  let nativeStyle:HTMLStyleElement|undefined;
  stage.style.cssText='position:fixed;left:-20000px;top:0;width:794px;visibility:hidden;pointer-events:none';
  const source=document.createElement('div'),target=document.createElement('div');
  source.innerHTML='<article class="mf-document-shell mf-doc" style="'+documentStyleAttribute(doc.theme)+'">'+collected.html+'</article>';
  for(const item of source.querySelectorAll('details'))item.setAttribute('open','');
  stage.append(source,target);document.body.append(stage);
  const existing=new Set(document.querySelectorAll('style'));
  let paged:PagedAdapter|undefined;
  let deferCleanup=false,stopped:unknown;
  let failure:{error:unknown}|undefined;
  const cleanup=(prior?:{error:unknown})=>{
   try{paged?.destroy()}catch(error){
    if(prior)throw new AggregateError([prior.error,error],'分页失败且清理失败：'+String(prior.error)+'; '+String(error));
    throw error;
   }finally{nativeStyle?.remove();stage.remove()}
  };
  try{
   const printTree=parse(DOCUMENT_CSS+printCss(doc));
   walk(printTree,{visit:'Atrule',enter(node,item,list){if(node.name.toLowerCase()==='container'&&item&&list)list.remove(item)}});
   walk(printTree,{visit:'Rule',enter(node,item,list){if(node.prelude.type==='SelectorList'&&item&&list){let hidesUI=false;walk(node.prelude,n=>{if(n.type==='ClassSelector'&&n.name==='no-print')hidesUI=true});if(hidesUI)list.remove(item)}}});
   const paginationCss=generate(printTree);
   await waitForLayout(source);throwIfAborted(signal);
   paged=await loadPagedAdapter();
   nativeStyle=document.createElement('style');nativeStyle.textContent=DOCUMENT_CSS+'\n.mf-pagination .mf-doc pre{white-space:pre-wrap;overflow:visible;overflow-wrap:anywhere}.mf-pagination .mf-doc .mf-table-scroll,.mf-pagination .mf-doc .mf-math,.mf-pagination .mf-doc .mf-diagram{overflow:visible}.mf-pagination .mf-doc{--mf-paper:#fff;--mf-ink:#1f2937}';
   const style=nativeStyle;
   paged.beforeParsed(()=>{document.head.append(style)});
   const guard=()=>{throwIfAborted(signal);if(stopped)throw stopped};
   paged.beforePageLayout(guard);paged.afterPageLayout(guard);
   let settled=false;const work=paged.preview(source.innerHTML,[{[location.href]:paginationCss}],target).finally(()=>{settled=true});
   let flow:{total:number};
   try{flow=await withDeadline(work,'分页超时',60000)}catch(error){
    stopped=error;
    // Paged.js has no terminal cancellation API. Keep its host alive and the queue locked
    // until hooks end the underlying work; destroying it early races ongoing layout.
    if(!settled){deferCleanup=true;pendingCleanup=work.then(()=>cleanup(),error=>{cleanup({error});throw error});void pendingCleanup.catch(()=>undefined)}
    throw error;
   }
   throwIfAborted(signal);
   const css=Array.from(document.querySelectorAll('style')).filter(s=>!existing.has(s)).map(s=>s.textContent||'').join('\n');
   const pages=target.querySelector('.pagedjs_pages');if(!pages||!flow.total)throw new Error('分页没有生成页面');
   // Keep all content, including page fragments with their data-line mappings.
   return {html:pages.outerHTML,css:DOCUMENT_CSS+css,total:flow.total};
  }catch(error){failure={error};throw error}finally{
   if(!deferCleanup)cleanup(failure);
  }
 };
 const result=queue.then(task,task);queue=result.then(()=>undefined,()=>pendingCleanup?.catch(()=>undefined));return result;
}
