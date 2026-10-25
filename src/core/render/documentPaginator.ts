import {loadPagedAdapter} from './pagedJsAdapter';
import { parse,walk,generate } from 'css-tree';
import {documentSchema} from '../model/documentSchema';
import type {DocumentRecord} from '../model/document';
import {renderDocument,assertArtifact,throwIfAborted} from './documentRenderer';
import {collectAssets} from '../export/documentAssets';
import {DOCUMENT_CSS,documentStyleAttribute} from './documentPresentation';
import {printCss,waitForLayout} from '../export/documentPrint';
import {sharedDom,type DomScheduling} from '../platform/web/sharedDom';
export interface PaginatedDocument {html:string;css:string;total:number}
export function paginateDocument(input:DocumentRecord,signal?:AbortSignal,scheduling:Omit<DomScheduling,'signal'>={}):Promise<PaginatedDocument>{
 const doc=documentSchema.parse(structuredClone(input));
 const options={...scheduling,...(signal?{signal}:{})};
 const task=async()=>{
  throwIfAborted(signal);
  const artifact=await renderDocument(doc.markdown,doc.options.mathMode,signal,scheduling);assertArtifact(artifact);
  const collected=await collectAssets(artifact.html,doc.assets,false);throwIfAborted(signal);
  return sharedDom.step(options.priority??'foreground','pagination',signal??new AbortController().signal,async({resources,signal:stepSignal})=>{
   throwIfAborted(stepSignal);
   const stage=document.createElement('div');stage.className='mf-pagination';
   const nativeStyle=document.createElement('style');
   resources.register('pagination-stage','host',0,()=>{stage.remove()});
   resources.register('pagination-style','host',0,()=>{nativeStyle.remove()});
   stage.style.cssText='position:fixed;left:-20000px;top:0;width:794px;visibility:hidden;pointer-events:none';
   const source=document.createElement('div'),target=document.createElement('div');
   source.innerHTML='<article class="mf-document-shell mf-doc" style="'+documentStyleAttribute(doc.theme)+'">'+collected.html+'</article>';
   for(const item of source.querySelectorAll('details'))item.setAttribute('open','');
   stage.append(source,target);document.body.append(stage);
   const existing=new Set(document.querySelectorAll('style'));
   const printTree=parse(DOCUMENT_CSS+printCss(doc));
   walk(printTree,{visit:'Atrule',enter(node,item,list){if(node.name.toLowerCase()==='container'&&item&&list)list.remove(item)}});
   walk(printTree,{visit:'Rule',enter(node,item,list){if(node.prelude.type==='SelectorList'&&item&&list){let hidesUI=false;walk(node.prelude,n=>{if(n.type==='ClassSelector'&&n.name==='no-print')hidesUI=true});if(hidesUI)list.remove(item)}}});
   const paginationCss=generate(printTree);
   await waitForLayout(source);throwIfAborted(stepSignal);
   const paged=await loadPagedAdapter(undefined,resources);throwIfAborted(stepSignal);
   nativeStyle.textContent=DOCUMENT_CSS+'\n.mf-pagination .mf-doc pre{white-space:pre-wrap;overflow:visible;overflow-wrap:anywhere}.mf-pagination .mf-doc .mf-table-scroll,.mf-pagination .mf-doc .mf-math,.mf-pagination .mf-doc .mf-diagram{overflow:visible}.mf-pagination .mf-doc{--mf-paper:#fff;--mf-ink:#1f2937}';
   const style=nativeStyle;
   paged.beforeParsed(()=>{document.head.append(style)});
   const guard=()=>{throwIfAborted(stepSignal)};
   paged.beforePageLayout(guard);paged.afterPageLayout(guard);
   guard();
   const flow=await paged.preview(source.innerHTML,[{[location.href]:paginationCss}],target);
   guard();
   const css=Array.from(document.querySelectorAll('style')).filter(s=>!existing.has(s)).map(s=>s.textContent||'').join('\n');
   const pages=target.querySelector('.pagedjs_pages');if(!pages||pages.querySelectorAll('.pagedjs_page').length!==flow.total)throw new Error('分页页面数量与结果不一致');
   // Keep all content, including page fragments with their data-line mappings.
   return {html:pages.outerHTML,css:DOCUMENT_CSS+css,total:flow.total};
  });
 };
 return task();
}
