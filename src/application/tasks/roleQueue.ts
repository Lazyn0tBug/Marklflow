import {previewSubmissionSchema,type PreviewSubmission,type PreviewCacheKey} from './previewIdentity';
import {snapshotRequest,isPreview,type TaskRequest,type TaskClock} from './contracts';
import {IdentityGate} from './identity';
import {dualWorkerPolicy,backgroundPendingCapacity,assessDualWorkerMemory} from './dualWorkerPolicy';
import {taskBudget,totalDeadline} from './budget';
export type WorkerRole=PreviewSubmission['role'];
export type RoleWork={kind:'preview';submission:PreviewSubmission}|{kind:'export';request:TaskRequest};
interface Entry {id:string;role:WorkerRole;work:RoleWork;bytes:number;acceptedAt:number;expiresAt:number}
export interface RoleClaim {id:string;role:WorkerRole;work:RoleWork;acceptedAt:number}
export interface NeedsRender {documentId:string;sessionGeneration:number;previewKind:PreviewCacheKey['previewKind'];reason:'capacity'|'expired'|'inactive'}
export type RoleAdmission={status:'accepted';taskId:string;replaced:string[]}|{status:'inactive'|'capacity'|'busy'};
export const requestOf=(work:RoleWork):TaskRequest=>work.kind==='preview'?work.submission.request:work.request;
const keyOf=(submission:PreviewSubmission)=>JSON.stringify([submission.request.identity.documentId,submission.request.identity.sessionGeneration,submission.cacheKey.previewKind]);
const copy=(work:RoleWork):RoleWork=>work.kind==='preview'?{kind:'preview',submission:previewSubmissionSchema.parse(work.submission)}:{kind:'export',request:snapshotRequest(work.request)};
/** Foreground/background are roles, never aliases for compute/DOM environments. */
export class RoleTaskQueue{
 private pending:Record<WorkerRole,Entry[]>={foreground:[],background:[]};
 private active=new Map<WorkerRole,Entry>();private exportId:string|undefined;private sequence=0;
 private dirty=new Map<string,NeedsRender>();
 constructor(private readonly gate:IdentityGate,private readonly clock:TaskClock,private readonly extraInFlightBytes:()=>number=()=>0){}
 private allowed(submission:PreviewSubmission):boolean{return this.gate.sessionMatches(submission.request)&&this.gate.authorized(submission.request)&&(submission.role==='foreground'?this.gate.activeMatches(submission.request):this.gate.activeDocumentId!==submission.request.identity.documentId)}
 private mark(submission:PreviewSubmission,reason:NeedsRender['reason']):void{
  if(!this.gate.sessionMatches(submission.request))return;
  const {documentId,sessionGeneration}=submission.request.identity;
  this.dirty.set(keyOf(submission),{documentId,sessionGeneration,previewKind:submission.cacheKey.previewKind,reason});
 }
 private prune():void{
  for(const role of ['foreground','background'] as const)this.pending[role]=this.pending[role].filter(entry=>entry.work.kind==='export'||this.gate.sessionMatches(entry.work.submission.request));
  for(const [key,marker]of this.dirty)if(!this.gate.hasSession(marker.documentId,marker.sessionGeneration))this.dirty.delete(key);
 }
 enqueuePreview(input:unknown):RoleAdmission{
  const submission=previewSubmissionSchema.parse(input);this.prune();
  if(!this.allowed(submission)){this.mark(submission,'inactive');return {status:'inactive'}}
  const list=this.pending[submission.role],key=keyOf(submission);
  const previous=list.find(entry=>entry.work.kind==='preview'&&keyOf(entry.work.submission)===key);
  const capacity=submission.role==='foreground'?dualWorkerPolicy.queue.foregroundPending:backgroundPendingCapacity(this.gate.sessionCount);
  if(!previous&&list.filter(entry=>entry.work.kind==='preview').length>=capacity){this.mark(submission,'capacity');return {status:'capacity'}}
  return this.admit({kind:'preview',submission},submission.role,previous);
 }
 enqueueExport(input:unknown):RoleAdmission{
  this.prune();const request=snapshotRequest(input);if(isPreview(request.kind))throw new Error('Export queue requires an export kind');
  if(this.exportId)return {status:'busy'};
  if(!this.gate.sessionMatches(request)||!this.gate.authorized(request))return {status:'inactive'};
  const admitted=this.admit({kind:'export',request},'background');if(admitted.status==='accepted')this.exportId=admitted.taskId;return admitted;
 }
 private admit(work:RoleWork,role:WorkerRole,previous?:Entry):RoleAdmission{
  const request=requestOf(work);
  if(new TextEncoder().encode(request.document.markdown).byteLength>taskBudget.input.markdownUtf8Bytes)throw new Error('Markdown UTF-8 budget exceeded');
  const bytes=new TextEncoder().encode(JSON.stringify(work)).byteLength*3;
  if(!assessDualWorkerMemory({foregroundRuntimeBytes:0,backgroundRuntimeBytes:0,ownedTaskBytes:this.ownedBytes+this.extraInFlightBytes()-(previous?.bytes??0)+bytes,clonePeakBytes:0,otherOwnedBytes:0}).accepted){if(work.kind==='preview')this.mark(work.submission,'capacity');return {status:'capacity'}}
  if(this.sequence===Number.MAX_SAFE_INTEGER)throw new Error('Task id space exhausted');
  const id='role-task-'+(++this.sequence);request.identity.taskId=id;
  const wait=work.kind==='export'?Math.min(taskBudget.deadlinesMs.exportQueue,totalDeadline(request.kind)):role==='foreground'?taskBudget.deadlinesMs.previewQueue:dualWorkerPolicy.queue.backgroundQueueWaitMs;
  const acceptedAt=previous?.acceptedAt??this.clock.now();
  const entry:Entry={id,role,work,bytes,acceptedAt,expiresAt:previous?.expiresAt??acceptedAt+wait};
  const list=this.pending[role];if(previous)list[list.indexOf(previous)]=entry;else list.push(entry);
  if(work.kind==='preview')this.dirty.delete(keyOf(work.submission));
  return {status:'accepted',taskId:id,replaced:previous?[previous.id]:[]};
 }
 /** Claim stays active until the execution coordinator proves stop and cleanup. */
 claim(role:WorkerRole):RoleClaim|undefined{
  if(this.active.has(role))return undefined;this.prune();const list=this.pending[role];
  for(;;){
   const exportIndex=role==='background'?list.findIndex(entry=>entry.work.kind==='export'):-1;
   const index=exportIndex>=0?exportIndex:0,entry=list[index];if(!entry)return;
   list.splice(index,1);
   if(entry.work.kind==='preview'&&!this.allowed(entry.work.submission)){this.mark(entry.work.submission,'inactive');continue}
   if(this.clock.now()>=entry.expiresAt){if(entry.work.kind==='preview')this.mark(entry.work.submission,'expired');if(this.exportId===entry.id)this.exportId=undefined;continue}
   this.active.set(role,entry);return {id:entry.id,role,work:copy(entry.work),acceptedAt:entry.acceptedAt};
  }
 }
 release(role:WorkerRole,id:string):boolean{
  if(this.active.get(role)?.id!==id)return false;this.active.delete(role);return true;
 }
 finishExport(id:string):boolean{
  if(this.exportId!==id||[...this.active.values(),...this.pending.background].some(entry=>entry.id===id))return false;
  this.exportId=undefined;return true;
 }
 expire():{id:string;role:WorkerRole;kind:RoleWork['kind']}[]{
  this.prune();const expired:{id:string;role:WorkerRole;kind:RoleWork['kind']}[]=[];
  for(const role of ['foreground','background'] as const)this.pending[role]=this.pending[role].filter(entry=>{
   if(this.clock.now()<entry.expiresAt)return true;
   if(entry.work.kind==='preview')this.mark(entry.work.submission,'expired');if(this.exportId===entry.id)this.exportId=undefined;
   expired.push({id:entry.id,role,kind:entry.work.kind});return false;
  });return expired;
 }
 cancelPending(id:string):boolean{
  for(const role of ['foreground','background'] as const){const index=this.pending[role].findIndex(entry=>entry.id===id);if(index>=0){this.pending[role].splice(index,1);if(this.exportId===id)this.exportId=undefined;return true}}return false;
 }
 get ownedBytes():number{return [...this.pending.foreground,...this.pending.background,...this.active.values()].reduce((sum,entry)=>sum+entry.bytes,0)}
 get nextExpiry():number{return Math.min(...this.pending.foreground.map(entry=>entry.expiresAt),...this.pending.background.map(entry=>entry.expiresAt))}
 snapshot(){this.prune();return {exportTaskId:this.exportId,pending:{foreground:this.pending.foreground.map(entry=>({id:entry.id,work:copy(entry.work)})),background:this.pending.background.map(entry=>({id:entry.id,work:copy(entry.work)}))},active:[...this.active.values()].map(entry=>({id:entry.id,role:entry.role})),needsRender:[...this.dirty.values()].map(marker=>({...marker})),ownedBytes:this.ownedBytes}}
}
