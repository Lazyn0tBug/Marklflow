import {z} from 'zod';
import hash from 'hash.js';
import {taskRequestSchema,snapshotRequest} from './contracts';
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
/** V2 preview envelope, retaining the full V1 run ticket until U2/U3 migrate scheduling. */
export const previewSubmissionSchema=z.object({schemaVersion:z.literal(2),role:previewRoleSchema,request:taskRequestSchema,cacheKey:previewCacheKeySchema}).strict().superRefine((submission,context)=>{
 const {request,cacheKey}=submission;
 if(request.kind!==cacheKey.previewKind||request.document.id!==cacheKey.documentId||markdownSha256(request.document.markdown)!==cacheKey.mdHash)context.addIssue({code:'custom',message:'Preview cache key does not match source'});
});
export type PreviewSubmission=z.infer<typeof previewSubmissionSchema>;
export function createPreviewSubmission(input:unknown,role:unknown,renderConfigVersion:unknown):PreviewSubmission{
 const request=snapshotRequest(input);
 return previewSubmissionSchema.parse({schemaVersion:2,role,request,cacheKey:{schemaVersion:1,documentId:request.document.id,previewKind:request.kind,mdHash:markdownSha256(request.document.markdown),renderConfigVersion}});
}
/** Cache comparison deliberately excludes run ticket, revision, activation and worker role. */
export function samePreviewCacheKey(left:unknown,right:unknown):boolean{
 const a=previewCacheKeySchema.parse(left),b=previewCacheKeySchema.parse(right);
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
