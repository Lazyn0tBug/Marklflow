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
