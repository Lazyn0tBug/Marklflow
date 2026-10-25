import {snapshotRequest,isPreview,type TaskRequest} from './contracts';
import {IdentityGate} from './identity';
import {taskBudget} from './budget';
export interface QueuedTask {request:TaskRequest;lane:'compute'|'dom';acceptedAt:number;queueDeadline:number}
export type QueueAdmission={status:'accepted';replaced:string[]}|{status:'inactive'|'busy'};
/** At most two active-document preview intents and one export, independent of tab count. */
export class TaskQueue{
 private pending:QueuedTask[]=[];private exportId:string|undefined;
 constructor(private readonly identity:IdentityGate){}
 enqueue(task:QueuedTask):QueueAdmission{
  task={...task,request:snapshotRequest(task.request)};
  const request=task.request;
  if(!isPreview(request.kind)){
   if(this.exportId)return {status:'busy'};
   if(!this.identity.sessionMatches(request)||!this.identity.authorized(request))throw new Error('Invalid export source');
   this.exportId=request.identity.taskId;this.pending.push(task);return {status:'accepted',replaced:[]};
  }
  if(!this.identity.activeMatches(request)||!this.identity.authorized(request))return {status:'inactive'};
  const replaced=this.pending.filter(old=>isPreview(old.request.kind)&&old.request.kind===request.kind&&old.request.identity.documentId===request.identity.documentId&&old.request.identity.sessionGeneration===request.identity.sessionGeneration).map(old=>old.request.identity.taskId);
  this.pending=this.pending.filter(old=>!replaced.includes(old.request.identity.taskId));
  this.identity.expect(request);this.pending.push(task);return {status:'accepted',replaced};
 }
 take(lane:QueuedTask['lane']):QueuedTask|undefined{
  // An already accepted export has strict priority at the next free lane; at most the current stage precedes it.
  const candidates=this.pending.filter(task=>task.lane===lane);
  const next=candidates.find(task=>!isPreview(task.request.kind))??candidates[0];
  if(next)this.remove(next.request.identity.taskId);return next;
 }
 remove(id:string):void{this.pending=this.pending.filter(task=>task.request.identity.taskId!==id)}
 finish(id:string):void{this.remove(id);if(this.exportId===id)this.exportId=undefined}
 invalidatePreviews():string[]{const ids=this.pending.filter(task=>isPreview(task.request.kind)&&!this.identity.current(task.request)).map(task=>task.request.identity.taskId);ids.forEach(id=>this.remove(id));return ids}
 expired(now:number):string[]{return this.pending.filter(task=>now>=task.queueDeadline).map(task=>task.request.identity.taskId)}
 snapshot():readonly QueuedTask[]{return this.pending.map(task=>({...task,request:snapshotRequest(task.request)}))}
 get size(){return this.pending.length}
 get capacity(){return taskBudget.queue.pendingPerActiveDocumentAndPreviewKind*2+taskBudget.queue.activeExports}
}
