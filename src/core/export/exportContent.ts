import type {DocumentRecord,DocumentAsset} from '../model/document';
import {documentSchema} from '../model/documentSchema';
import {exportHtmlSchema,type ExportHtmlArtifact} from '../model/exportHtml';
import {renderDocument,assertArtifact} from '../render/documentRenderer';
import {DOCUMENT_CSS,documentStyle} from '../render/documentPresentation';
import {sha256Hex} from '../platform/crypto';
import {collectAssets,assertSelfContainedCss} from './documentAssets';
export interface PreparedExportContent {document:DocumentRecord & {assets:DocumentAsset[]};html:string;artifact:ExportHtmlArtifact}
/** One source snapshot and one resource collection; legacy fields remain only until EX-H2. */
export async function prepareExportContent(input:DocumentRecord,options:{mathMode?:'mathml'|'svg';allowRemoteAssets?:boolean}={}):Promise<PreparedExportContent>{
 const doc=documentSchema.parse(input),mode=options.mathMode??doc.options.mathMode,remote=options.allowRemoteAssets??false;
 assertSelfContainedCss(DOCUMENT_CSS);
 const rendered=await renderDocument(doc.markdown,mode,undefined,{priority:'export',retainMathML:true});assertArtifact(rendered);
 const collected=await collectAssets(rendered.html,doc.assets,remote);
 const encode=(text:string)=>new TextEncoder().encode(text);
 if(encode(collected.html).byteLength+encode(DOCUMENT_CSS).byteLength>50*1024*1024)throw new Error('HTML导出内容超过50MB限制');
 const mdHash=await sha256Hex(encode(doc.markdown));
 // Advance this renderer contract when engine/policy behavior changes; never hash transient SVG IDs.
 const renderConfigVersion=await sha256Hex(encode(JSON.stringify({contract:'export-html-v2',theme:doc.theme,options:{...doc.options,mathMode:mode},css:DOCUMENT_CSS,assets:collected.assets.map(asset=>[asset.source,asset.sha256])})));
 const artifact=exportHtmlSchema.parse({schemaVersion:1,source:{documentId:doc.id,revision:doc.revision,mdHash,renderConfigVersion},meta:doc.meta,html:collected.html,presentation:{css:DOCUMENT_CSS,variables:documentStyle(doc.theme),page:{size:'A4',margins:doc.theme.margins}},mathMode:mode,assets:collected.assets,diagnostics:rendered.diagnostics});
 return {document:{...doc,options:{...doc.options,mathMode:mode},assets:collected.assets},html:artifact.html,artifact};
}
