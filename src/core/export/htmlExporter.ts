import { waitForLayout } from './documentPrint';
import { printCss } from './documentPrint';
import { collectAssets,assertSelfContainedCss } from './documentAssets';
import { documentSchema } from '../model/documentSchema';
import type { DocumentRecord } from '../model/document';
import { renderDocument,assertArtifact } from '../render/documentRenderer';
import { encodeSourcePayload } from '../storage/storage';
import { DOCUMENT_CSS, documentStyleAttribute } from '../render/documentPresentation';
import { escapeHtml } from '../render/htmlPolicy';
export interface HtmlExportOptions {includeEditablePayload?:boolean;mathMode?:'mathml'|'svg';title?:string;allowRemoteAssets?:boolean}
export async function generateExportHtml(input:DocumentRecord,options:HtmlExportOptions={}):Promise<string> {
 const frozenOptions={...options};
 const doc:DocumentRecord=documentSchema.parse(structuredClone(input));assertSelfContainedCss(DOCUMENT_CSS);
 const artifact=await renderDocument(doc.markdown,frozenOptions.mathMode||doc.options.mathMode,undefined,doc.meta?.filePath);assertArtifact(artifact);const collected=await collectAssets(artifact.html,doc.assets,frozenOptions.allowRemoteAssets);doc.assets=collected.assets;const content=collected.html;
 const contentRoot=document.createElement('div');contentRoot.innerHTML=content;for(const el of contentRoot.querySelectorAll('details'))el.setAttribute('open','');
 if(contentRoot.querySelector('img,svg image')){contentRoot.style.cssText='position:fixed;left:-20000px;top:0;width:960px;visibility:hidden';document.body.append(contentRoot);try{await waitForLayout(contentRoot)}finally{contentRoot.remove()}}
 const payload=frozenOptions.includeEditablePayload?'<script id="markflow-source-payload" type="application/json">'+encodeSourcePayload(doc)+'</script>':'';
 const result='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; img-src data:; style-src &#39;unsafe-inline&#39;; font-src data:"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escapeHtml(frozenOptions.title||doc.meta.title||'MarkFlow 文档')+'</title><style>'+DOCUMENT_CSS+printCss(doc)+'\nbody{margin:0;background:#f4f5f7}.mf-document-shell{max-width:960px;margin:32px auto;padding:clamp(16px,4vw,56px)}@media print{body{background:white}.mf-document-shell{margin:0;padding:0;max-width:none}.no-print{display:none}}</style></head><body><main class="mf-document-shell"><article class="mf-doc" style="'+documentStyleAttribute(doc.theme)+'">'+contentRoot.innerHTML+'</article></main>'+payload+'</body></html>';
 if(new TextEncoder().encode(result).byteLength>50*1024*1024)throw new Error('单文件HTML超过50MB限制');
 return result;
}
