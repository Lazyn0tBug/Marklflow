import {exportHtmlSchema} from '../../src/core/model/exportHtml';
import {createNewDocument} from '../../src/core/storage/storage';
import {DOCUMENT_CSS,documentStyle} from '../../src/core/render/documentPresentation';
import type {DocumentRecord} from '../../src/core/model/document';
export function htmlArtifact(html:string,doc:DocumentRecord=createNewDocument('Fixture')){
 return exportHtmlSchema.parse({schemaVersion:1,source:{documentId:doc.id,revision:doc.revision,mdHash:'0'.repeat(64),renderConfigVersion:'1'.repeat(64)},meta:doc.meta,html,presentation:{css:DOCUMENT_CSS,variables:documentStyle(doc.theme),page:{size:'A4',margins:doc.theme.margins}},mathMode:'svg',assets:[],diagnostics:[]});
}
