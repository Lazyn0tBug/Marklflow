/** Compile-only negative contracts: weakening a strict option must make tsc fail. */
import type {DocumentRecord} from '../../src/core/model/document';
import {documentSchema} from '../../src/core/model/documentSchema';

function indexedAccess(values:string[]):void {
 // @ts-expect-error: An unchecked index may be absent, even for a string array.
 const required:string=values[0];
 void required;
}
function optionalProperties():void {
 // @ts-expect-error: An optional field must be omitted instead of set to undefined.
 const invalid:{title?:string}={title:undefined};
 void invalid;
}
// @ts-expect-error: Unannotated parameters must never silently become implicit any.
function implicitParameter(value){return value}
// @ts-expect-error: Strict null checking rejects null as a required string.
const requiredString:string=null;
function schemaOutput(input:unknown):DocumentRecord{return documentSchema.parse(input)}
void indexedAccess;void optionalProperties;void implicitParameter;void requiredString;void schemaOutput;

import type {ExportHtmlArtifact} from '../../src/core/model/exportHtml';
import type {ExportPorts} from '../../src/application/exports/exportService';
function htmlOnlyFormats(doc:DocumentRecord,html:ExportHtmlArtifact,ports:ExportPorts):void{
 // @ts-expect-error: A source record is not a content format input.
 void ports.generateDocx(doc,{allowSourceFallback:false});
 // @ts-expect-error: Canonical content cannot be changed after acceptance.
 html.html='different';
 // @ts-expect-error: Editable Markdown does not exist in the format contract.
 void html.markdown;
}
void htmlOnlyFormats;

function nativePdfDelivery(doc:DocumentRecord,html:ExportHtmlArtifact,ports:ExportPorts):void{
 // @ts-expect-error: Native PDF delivery accepts complete HTML, never editable source.
 void ports.deliverPdf(doc);
 // @ts-expect-error: A native browser handoff does not return PDF bytes.
 const bytes:Promise<Blob>=ports.deliverPdf(html.html);
 void bytes;
}
void nativePdfDelivery;
