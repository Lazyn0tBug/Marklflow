import {parseMarkdownDocument} from '../../src/core/render/markdownHtml';
import {exportHtmlSchema} from '../../src/core/model/exportHtml';
import {createNewDocument} from '../../src/core/storage/storage';
import {DOCUMENT_CSS,documentStyle} from '../../src/core/render/documentPresentation';
import type {DocumentRecord} from '../../src/core/model/document';
export function htmlArtifact(html:string,doc:DocumentRecord=createNewDocument('Fixture')){
 return exportHtmlSchema.parse({schemaVersion:1,source:{documentId:doc.id,revision:doc.revision,mdHash:'0'.repeat(64),renderConfigVersion:'1'.repeat(64)},meta:doc.meta,html,presentation:{css:DOCUMENT_CSS,variables:documentStyle(doc.theme),page:{size:'A4',margins:doc.theme.margins}},mathMode:'svg',assets:[],diagnostics:[]});
}

const formulaHost=(mathml:string)=>'<mjx-container><svg xmlns="http://www.w3.org/2000/svg"></svg><span class="mf-math-semantics" hidden>'+mathml+'</span></mjx-container>';
/** A summation has no equivalent native form, so it keeps the historical image-degradation baseline. */
const DOWNGRADED_MATHML='<math xmlns="http://www.w3.org/1998/Math/MathML"><munderover><mo>∑</mo><mrow><mi>i</mi><mo>=</mo><mn>1</mn></mrow><mi>n</mi></munderover></math>';
/** A plain identifier converts natively, so it must not produce any downgrade notice. */
const NATIVE_MATHML='<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow><mi>x</mi></mrow></math>';
export function diagnosticArtifact(markdown:string){const parsed=parseMarkdownDocument(markdown,{mathSemantics:true,preparedMath:()=>formulaHost(DOWNGRADED_MATHML)});return htmlArtifact(parsed.html+parsed.diagnostics.filter(d=>d.contentKind==='author-mathml').map(d=>'<aside data-mf-author-mathml="true" data-line="'+d.nodeId.slice(5)+'"></aside>').join(''))}
export function nativeFormulaArtifact(markdown:string){const parsed=parseMarkdownDocument(markdown,{mathSemantics:true,preparedMath:()=>formulaHost(NATIVE_MATHML)});return htmlArtifact(parsed.html)}
