import type { DocumentRecord } from '../model/document';
import { parseMarkdownToHtml } from '../parser/markdownParser';
import { encodeSourcePayload } from '../storage/storage';
import { DOCUMENT_CSS, documentStyleAttribute } from '../render/documentPresentation';
import { escapeHtml } from '../render/htmlPolicy';
export interface HtmlExportOptions {includeEditablePayload?:boolean;mathMode?:'mathml'|'svg';title?:string}
export function generateExportHtml(doc:DocumentRecord,options:HtmlExportOptions={}):string {
 const content=parseMarkdownToHtml(doc.markdown,{mathMode:options.mathMode||doc.options.mathMode});
 const payload=options.includeEditablePayload?'<script id="markflow-source-payload" type="application/json">'+encodeSourcePayload(doc)+'</script>':'';
 return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escapeHtml(options.title||doc.meta.title||'MarkFlow 文档')+'</title><style>'+DOCUMENT_CSS+'\nbody{margin:0;background:#f4f5f7}.mf-document-shell{max-width:960px;margin:32px auto;padding:clamp(16px,4vw,56px)}@media print{@page{size:A4;margin:20mm}body{background:white}.mf-document-shell{margin:0;padding:0;max-width:none}.no-print{display:none}}</style></head><body><main class="mf-document-shell"><article class="mf-doc" style="'+documentStyleAttribute(doc.theme)+'">'+content+'</article></main>'+payload+'</body></html>';
}
