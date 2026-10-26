import type {ExportHtmlArtifact} from '../model/exportHtml';
import {waitForLayout} from './documentPrint';
import {pageCss} from '../render/pagePresentation';
import {variableStyleAttribute} from '../render/documentPresentation';
import {escapeHtml} from '../policy/htmlRules';
export interface HtmlExportOptions {title?:string;editablePayload?:string}
/** Content comes exclusively from HTML; the optional source attachment is never interpreted. */
export async function generateExportHtml(input:ExportHtmlArtifact,options:HtmlExportOptions={}):Promise<string> {
 const frozenOptions={...options};
 const contentRoot=document.createElement('div');contentRoot.innerHTML=input.html;for(const el of contentRoot.querySelectorAll('details'))el.setAttribute('open','');
 if(contentRoot.querySelector('img,svg image')){contentRoot.style.cssText='position:fixed;left:-20000px;top:0;width:960px;visibility:hidden';document.body.append(contentRoot);try{await waitForLayout(contentRoot)}finally{contentRoot.remove()}}
 const payload=frozenOptions.editablePayload?'<script id="markflow-source-payload" type="application/json">'+frozenOptions.editablePayload.replace(/</g,'\\u003c')+'</script>':'';
 const result='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; img-src data:; style-src &#39;unsafe-inline&#39;; font-src data:"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escapeHtml(frozenOptions.title||input.meta.title||'MarkFlow 文档')+'</title><style>'+input.presentation.css+pageCss(input.presentation.page.margins)+'\nbody{margin:0;background:#f4f5f7}.mf-document-shell{max-width:960px;margin:32px auto;padding:clamp(16px,4vw,56px)}@media print{body{background:white}.mf-document-shell{margin:0;padding:0;max-width:none}.no-print{display:none}}</style></head><body><main class="mf-document-shell"><article class="mf-doc" style="'+variableStyleAttribute(input.presentation.variables)+'">'+contentRoot.innerHTML+'</article></main>'+payload+'</body></html>';
 if(new TextEncoder().encode(result).byteLength>50*1024*1024)throw new Error('单文件HTML超过50MB限制');
 return result;
}
