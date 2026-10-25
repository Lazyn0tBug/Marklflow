import {z} from 'zod';
import {taskBudget} from './budget';
import {documentSchema} from '../../core/model/documentSchema';
import {previewCacheKeySchema,markdownSha256} from './previewIdentity';
const id=z.string().min(1).max(256),version=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const taskKindSchema=z.enum(['preview.flow','preview.a4','export.md','export.mdBundle','export.html','export.docx','export.print']);
export const taskIdentitySchema=z.object({protocolVersion:z.literal(1),taskId:id,documentId:id}).strict();
export const authorizationSchema=z.object({revision:version,scopeIds:z.array(id).max(128)}).strict();
const previewRequestSchema=z.object({identity:taskIdentitySchema,kind:z.enum(['preview.flow','preview.a4']),document:documentSchema,cacheKey:previewCacheKeySchema}).strict();
const exportRequestSchema=z.object({identity:taskIdentitySchema,kind:z.enum(['export.md','export.mdBundle','export.html','export.docx','export.print']),document:documentSchema,authorization:authorizationSchema}).strict();
export const taskRequestSchema=z.union([previewRequestSchema,exportRequestSchema]).superRefine((request,context)=>{
 if(request.identity.documentId!==request.document.id)context.addIssue({code:'custom',message:'Snapshot identity mismatch'});
 if('cacheKey'in request&&(request.cacheKey.documentId!==request.document.id||request.cacheKey.previewKind!==request.kind||request.cacheKey.mdHash!==markdownSha256(request.document.markdown)))context.addIssue({code:'custom',message:'Preview cache key does not match source'});
});
export type TaskRequest=z.infer<typeof taskRequestSchema>;
export type TaskIdentity=z.infer<typeof taskIdentitySchema>;
export type TaskKind=z.infer<typeof taskKindSchema>;
export const stageSchema=z.enum(['accepted','snapshot','parse','resources','generation','validation','layout','packaging','artifactReady','delivering','completed']);
export type TaskStage=z.infer<typeof stageSchema>;
export const executionIdentitySchema=z.object({executorId:id,executorGeneration:version,attempt:z.number().int().min(1).max(2),task:taskIdentitySchema}).strict();
export type ExecutionIdentity=z.infer<typeof executionIdentitySchema>;
const point=z.object({line:z.number().int().positive(),column:z.number().int().positive(),offset:version}).strict();
export const artifactSchema=z.object({schemaVersion:z.literal(1),artifactId:id,mediaType:z.enum(['text/html','text/markdown','application/zip','application/json','application/vnd.openxmlformats-officedocument.wordprocessingml.document']),encoding:z.enum(['utf8','base64']),content:z.string().max(taskBudget.memory.activeArtifactBytes),sourceMap:z.array(z.object({nodeId:id,start:point,end:point}).strict().refine(range=>range.end.offset>=range.start.offset)).max(100000),resources:z.array(z.object({source:z.string().min(1).max(15*1024*1024),sha256:z.string().regex(/^[a-f0-9]{64}$/),bytes:version}).strict()).max(128),diagnostics:z.array(z.object({severity:z.enum(['warning','error']),message:z.string().max(8192)}).strict()).max(10000)}).strict().superRefine((artifact,context)=>{
 const binary=['application/zip','application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(artifact.mediaType);
 if(binary!==(artifact.encoding==='base64')||binary&&!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(artifact.content))context.addIssue({code:'custom',message:'Artifact encoding mismatch'});
});
export type TaskArtifact=z.infer<typeof artifactSchema>;
const messageBase={protocolVersion:z.literal(1),execution:executionIdentitySchema};
export const executorMessageSchema=z.discriminatedUnion('type',[
 z.object({...messageBase,type:z.literal('start'),stage:stageSchema}).strict(),
 z.object({...messageBase,type:z.literal('progress'),stage:stageSchema,progress:z.number().finite().min(0).max(1).optional()}).strict(),
 z.object({...messageBase,type:z.literal('result'),artifact:artifactSchema}).strict(),
 z.object({...messageBase,type:z.literal('error'),code:z.enum(['input','permission','engine','host']),message:z.string().max(8192)}).strict(),
 z.object({...messageBase,type:z.literal('stop-ack'),proof:z.enum(['cooperative','terminated'])}).strict(),
]);
export type ExecutorMessage=z.infer<typeof executorMessageSchema>;
export const deliveryReceiptSchema=z.object({artifactId:id,outcome:z.enum(['dispatched','handedOff','committed','failed','unknown']),message:z.string().max(8192).optional()}).strict();
export type DeliveryReceipt=z.infer<typeof deliveryReceiptSchema>;
export function isPreview(kind:TaskKind):boolean{return kind.startsWith('preview.')}
export function sameIdentity(a:TaskIdentity,b:TaskIdentity):boolean{return Object.keys(taskIdentitySchema.shape).every(key=>Reflect.get(a,key)===Reflect.get(b,key))}
export function sameExecution(a:ExecutionIdentity,b:ExecutionIdentity):boolean{return a.executorId===b.executorId&&a.executorGeneration===b.executorGeneration&&a.attempt===b.attempt&&sameIdentity(a.task,b.task)}
/** Zod parses nested objects into an owned snapshot; consumers never receive the caller's object. */
export function snapshotRequest(input:unknown):TaskRequest{return taskRequestSchema.parse(input)}
export interface TaskClock {now():number;schedule(delayMs:number,callback:()=>void):()=>void}
export interface TaskExecutor {
 readonly id:string;readonly generation:number;readonly lane:'compute'|'dom';
 readonly capabilities:{requiresDOM:boolean;isolation:'shared-realm'|'worker'|'process';rebuildable:boolean;concurrency:1};
 readonly cancellation:'cooperative'|'external';readonly supportedKinds:readonly TaskKind[];
 start(request:TaskRequest,execution:ExecutionIdentity,receive:(message:unknown)=>void,resources:ExecutionResources):void;
 stop(execution:ExecutionIdentity):void;
}

export interface ExecutionResources {register(id:string,kind:'bytes'|'buffer'|'host'|'url'|'listener'|'timer'|'port',bytes:number,cleanup:()=>void|Promise<void>):void}
