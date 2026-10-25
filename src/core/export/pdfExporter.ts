import type {DocumentRecord} from '../model/document';
import {prepareExportContent} from './exportContent';
import {paginatePreparedContent} from '../render/documentPaginator';
import {escapeHtml} from '../render/htmlPolicy';
/** A4 export is generated from frozen source, independent of workbench visibility or preview readiness. */
export async function generatePdfHtml(input:DocumentRecord,options:{mathMode:'mathml'|'svg';allowRemoteAssets:boolean}):Promise<string>{
 const prepared=await prepareExportContent(input,options);
 const pages=await paginatePreparedContent(prepared,undefined,{priority:'export'});
 return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; img-src data:; style-src &#39;unsafe-inline&#39;; font-src data:"><title>'+escapeHtml(prepared.document.meta.title)+'</title><style>'+pages.css+'\n@page{size:A4;margin:0}html,body{margin:0;padding:0;background:#fff}.pagedjs_pages{display:block!important}.pagedjs_page{margin:0!important;box-shadow:none!important;break-after:page}.pagedjs_page:last-child{break-after:auto}</style></head><body class="mf-pagination" data-export-pages="'+pages.total+'">'+pages.html+'</body></html>';
}
