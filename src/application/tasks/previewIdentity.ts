import {z} from 'zod';
import hash from 'hash.js';
import {documentSchema} from '../../core/model/documentSchema';
export const previewRoleSchema=z.enum(['foreground','background']);
export const previewKindSchema=z.enum(['preview.flow','preview.a4']);
const version=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const previewCacheKeySchema=z.object({schemaVersion:z.literal(1),documentId:z.string().min(1).max(256),previewKind:previewKindSchema,mdHash:z.string().regex(/^[a-f0-9]{64}$/),renderConfigVersion:version}).strict();
export type PreviewCacheKey=z.infer<typeof previewCacheKeySchema>;
/** SHA-256 of exact UTF-8 Markdown; CRLF, BOM and whitespace are never normalized. */
export function markdownSha256(markdown:string):string{
 const data=new TextEncoder().encode(markdown),digest=hash.sha256();
 for(let offset=0;offset<data.length;offset+=65536)digest.update(data.subarray(offset,offset+65536));
 return digest.digest('hex');
}
/** Boundary schema for external messages; internal code passes the validated type. */
export const previewSubmissionSchema=z.object({protocolVersion:z.literal(1),taskId:z.string().min(1).max(256),role:previewRoleSchema,document:documentSchema,cacheKey:previewCacheKeySchema}).strict().superRefine((submission,context)=>{
 if(submission.document.id!==submission.cacheKey.documentId||markdownSha256(submission.document.markdown)!==submission.cacheKey.mdHash)context.addIssue({code:'custom',message:'Preview cache key does not match source'});
});
export type PreviewSubmission=z.infer<typeof previewSubmissionSchema>;
const previewInputSchema=z.object({taskId:z.string().min(1).max(256),document:documentSchema,previewKind:previewKindSchema,role:previewRoleSchema,renderConfigVersion:version}).strict();
/** Own and validate a source snapshot once, then compute its exact UTF-8 hash once. */
export function createPreviewSubmission(input:unknown):PreviewSubmission{
 const value=previewInputSchema.parse(input);
 return {protocolVersion:1,taskId:value.taskId,role:value.role,document:value.document,cacheKey:{schemaVersion:1,documentId:value.document.id,previewKind:value.previewKind,mdHash:markdownSha256(value.document.markdown),renderConfigVersion:value.renderConfigVersion}};
}
/** Internal comparison: both keys have already crossed their validation boundary. */
export function samePreviewCacheKey(a:PreviewCacheKey,b:PreviewCacheKey):boolean{
 return a.documentId===b.documentId&&a.previewKind===b.previewKind&&a.mdHash===b.mdHash&&a.renderConfigVersion===b.renderConfigVersion;
}
const configSchema=z.record(z.string(),z.json());
type JsonValue=z.infer<ReturnType<typeof z.json>>;
function canonical(value:JsonValue):string{
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key]!)).join(',')+'}';
}
/** Owned by application/session, not a Worker. Recreating it requires preserving the version or clearing its cache. */
export class RenderConfigVersion{
 private current:number;private fingerprint:string;
 constructor(configuration:unknown,initialVersion=1){this.current=version.parse(initialVersion);this.fingerprint=canonical(configSchema.parse(configuration))}
 get value():number{return this.current}
 update(configuration:unknown):number{
  const next=canonical(configSchema.parse(configuration));if(next===this.fingerprint)return this.current;
  if(this.current===Number.MAX_SAFE_INTEGER)throw new Error('Render configuration version exhausted; invalidate cache before reset');
  this.fingerprint=next;return ++this.current;
 }
}
