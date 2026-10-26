import type {ExportHtmlArtifact} from '../model/exportHtml';
import {paginatePreparedContent} from '../render/htmlPaginator';
import {escapeHtml} from '../render/htmlPolicy';
/** A4 export is generated from frozen source, independent of workbench visibility or preview readiness. */
export async function generatePdfHtml(input:ExportHtmlArtifact,options:{title?:string}={}):Promise<string>{
 // Job title is a browser hint, not control over a system PDF driver's save dialog.
 const title=options.title?.trim()||input.meta.title.trim()||'MarkFlow-Document';
 const pages=await paginatePreparedContent(input,undefined,{priority:'export'});
 return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; img-src data:; style-src &#39;unsafe-inline&#39;; font-src data:"><title>'+escapeHtml(title)+'</title><style>'+pages.css+'\n@page{size:A4;margin:0}html,body{margin:0;padding:0;background:#fff}.pagedjs_pages{display:block!important}.pagedjs_page{margin:0!important;box-shadow:none!important;break-after:page}.pagedjs_page:last-child{break-after:auto}</style></head><body class="mf-pagination" data-export-pages="'+pages.total+'">'+pages.html+'</body></html>';
}
