import {parseMarkdownDocument} from '../../src/core/render/markdownHtml';
import {exportHtmlSchema} from '../../src/core/model/exportHtml';
import {createNewDocument} from '../../src/core/storage/storage';
import {DOCUMENT_CSS,documentStyle} from '../../src/core/render/documentPresentation';
import type {DocumentRecord} from '../../src/core/model/document';
export function htmlArtifact(html:string,doc:DocumentRecord=createNewDocument('Fixture')){
 return exportHtmlSchema.parse({schemaVersion:1,source:{documentId:doc.id,revision:doc.revision,mdHash:'0'.repeat(64),renderConfigVersion:'1'.repeat(64)},meta:doc.meta,html,presentation:{css:DOCUMENT_CSS,variables:documentStyle(doc.theme),page:{size:'A4',margins:doc.theme.margins}},mathMode:'svg',assets:[],diagnostics:[]});
}

export function diagnosticArtifact(markdown:string){const parsed=parseMarkdownDocument(markdown,{mathSemantics:true,preparedMath:()=>'<mjx-container><svg xmlns="http://www.w3.org/2000/svg"></svg><span class="mf-math-semantics" hidden><math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math></span></mjx-container>'});return htmlArtifact(parsed.html+parsed.diagnostics.filter(d=>d.contentKind==='author-mathml').map(d=>'<aside data-mf-author-mathml="true" data-line="'+d.nodeId.slice(5)+'"></aside>').join(''))}
