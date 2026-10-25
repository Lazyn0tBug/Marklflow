import {z} from 'zod';
import {taskBudget} from './budget';
import {documentSchema} from '../../core/model/documentSchema';
import {previewCacheKeySchema,markdownSha256} from './previewIdentity';
const id=z.string().min(1).max(256),version=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const taskKindSchema=z.enum(['preview.flow','preview.a4']);
export const taskIdentitySchema=z.object({protocolVersion:z.literal(1),taskId:id,documentId:id}).strict();
export const taskRequestSchema=z.object({identity:taskIdentitySchema,kind:taskKindSchema,document:documentSchema,cacheKey:previewCacheKeySchema}).strict().superRefine((request,context)=>{
 if(request.identity.documentId!==request.document.id)context.addIssue({code:'custom',message:'Snapshot identity mismatch'});
 if(request.cacheKey.documentId!==request.document.id||request.cacheKey.previewKind!==request.kind||request.cacheKey.mdHash!==markdownSha256(request.document.markdown))context.addIssue({code:'custom',message:'Preview cache key does not match source'});
});
export type TaskRequest=z.infer<typeof taskRequestSchema>;
export type TaskIdentity=z.infer<typeof taskIdentitySchema>;
export type TaskKind=z.infer<typeof taskKindSchema>;
export const stageSchema=z.enum(['accepted','snapshot','parse','resources','generation','validation','layout','packaging']);
export type TaskStage=z.infer<typeof stageSchema>;
export const executionIdentitySchema=z.object({executorId:id,executorGeneration:version,task:taskIdentitySchema}).strict();
export type ExecutionIdentity=z.infer<typeof executionIdentitySchema>;
const point=z.object({line:z.number().int().positive(),column:z.number().int().positive(),offset:version}).strict();
export const artifactSchema=z.object({schemaVersion:z.literal(1),artifactId:id,mediaType:z.enum(['text/html','application/json']),encoding:z.literal('utf8'),content:z.string().max(taskBudget.memory.activeArtifactBytes),sourceMap:z.array(z.object({nodeId:id,start:point,end:point}).strict().refine(range=>range.end.offset>=range.start.offset)).max(100000),resources:z.array(z.object({source:z.string().min(1).max(15*1024*1024),sha256:z.string().regex(/^[a-f0-9]{64}$/),bytes:version}).strict()).max(128),diagnostics:z.array(z.object({severity:z.enum(['warning','error']),message:z.string().max(8192)}).strict()).max(10000)}).strict();
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
export function sameIdentity(a:TaskIdentity,b:TaskIdentity):boolean{return Object.keys(taskIdentitySchema.shape).every(key=>Reflect.get(a,key)===Reflect.get(b,key))}
export function sameExecution(a:ExecutionIdentity,b:ExecutionIdentity):boolean{return a.executorId===b.executorId&&a.executorGeneration===b.executorGeneration&&sameIdentity(a.task,b.task)}
/** Zod parses nested objects into an owned snapshot; consumers never receive the caller's object. */
export function snapshotRequest(input:unknown):TaskRequest{return taskRequestSchema.parse(input)}
export interface TaskClock {now():number;schedule(delayMs:number,callback:()=>void):()=>void}
/** One concrete compute-worker adapter, installed into one fixed foreground/background role. */
export interface WorkerAdapter {
 readonly id:string;readonly generation:number;
 readonly cancellation:'cooperative'|'external';readonly supportedKinds:readonly TaskKind[];
 start(request:TaskRequest,execution:ExecutionIdentity,receive:(message:unknown)=>void,resources:ExecutionResources):void;
 stop(execution:ExecutionIdentity):void;
}

export interface ExecutionResources {register(id:string,kind:'bytes'|'buffer'|'host'|'url'|'listener'|'timer'|'port',bytes:number,cleanup:()=>void|Promise<void>):void}
