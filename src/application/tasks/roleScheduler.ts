import type {PreviewSubmission} from './previewIdentity';
import {type WorkerAdapter,type TaskClock,type ExecutorMessage,type TaskArtifact} from './contracts';
import {RoleTaskQueue,requestOf,type WorkerRole,type RoleClaim,type RoleAdmission,type PreviewReader} from './roleQueue';
import {IdentityGate} from './identity';
import {RoleExecutor} from './roleExecutor';
import {taskBudget,estimatedBytes} from './budget';
export type RoleRunState='running'|'stopRequested'|'generated'|'completed'|'failed'|'cancelled';
interface Run {claim:RoleClaim;state:RoleRunState;reason:string|undefined}
interface Outcome {id:string;role:WorkerRole|undefined;state:RoleRunState;reason:string|undefined}
const terminal=(state:RoleRunState)=>state!=='running'&&state!=='stopRequested';
/** Preview generation handoff only; generated is not cache completion or view publication. */
export interface RoleSchedulerHooks {generated(claim:RoleClaim,artifact:TaskArtifact):undefined|'completed'}
export class RoleTaskScheduler{
 private readonly queue:RoleTaskQueue;
 private readonly executors:Record<WorkerRole,RoleExecutor>;
 private runtime:Record<WorkerRole,number>={foreground:0,background:0};
 private runs=new Map<string,Run>();private history:Outcome[]=[];
 private pumping=false;private notifying=false;
 constructor(private readonly gate:IdentityGate,clock:TaskClock,readPreview:PreviewReader,private readonly hooks:RoleSchedulerHooks={generated:()=>undefined}){
  this.queue=new RoleTaskQueue(gate,readPreview,bytes=>this.memory(bytes).accepted);
  const executor=(role:WorkerRole)=>new RoleExecutor(role,clock,{message:message=>this.message(role,message),fault:(id,reason)=>this.end(id,'failed',reason),timeout:(id,reason)=>this.end(id,'failed','Timed out: '+reason),available:()=>{for(const run of [...this.runs.values()])this.archive(run);this.pump()}},bytes=>this.memory(bytes).accepted);
  this.executors={foreground:executor('foreground'),background:executor('background')};
 }
 private mutation():void{if(this.notifying)throw new Error('Reentrant generation handoff')}
 /** One admission calculation for queue inputs, local resources, runtime estimates and candidate output. */
 private memory(extra=0){
  if(!Number.isSafeInteger(extra))throw new Error('Invalid resource byte estimate');
  const estimatedBytes=this.queue.ownedBytes+this.executors.foreground.resourceBytes+this.executors.background.resourceBytes+this.runtime.foreground+this.runtime.background+extra;
  return {estimatedBytes,limitBytes:taskBudget.memory.inFlightBytes,accepted:estimatedBytes>=0&&estimatedBytes<=taskBudget.memory.inFlightBytes};
 }
 install(role:WorkerRole,executor:WorkerAdapter,runtimeBytes=0):void{
  this.mutation();
  const other=role==='foreground'?'background':'foreground';if(this.executors[other].matches(executor))throw new Error('Role executors must be independent');
  if(!Number.isSafeInteger(runtimeBytes)||runtimeBytes<0)throw new Error('Invalid runtime byte estimate');
  const old=this.runtime[role];this.runtime[role]=runtimeBytes;
  try{
   if(!this.memory().accepted)throw new Error('Worker runtime budget exceeded');
   this.executors[role].install(executor);
  }catch(error){this.runtime[role]=old;throw error}this.pump();
 }
 enqueuePreview(submission:PreviewSubmission):RoleAdmission|{status:'unsupported'}{
  this.mutation();
  if(!this.executors[submission.role].supports(requestOf({kind:'preview',submission})))return {status:'unsupported'};
  const admitted=this.queue.enqueuePreview(submission);if(admitted.status==='accepted')for(const id of admitted.replaced)this.record({id,role:submission.role,state:'cancelled',reason:'Latest pending intent'});
  this.pump();return admitted;
 }
 private pump():void{
  if(this.pumping||this.notifying)return;this.pumping=true;
  try{for(const role of ['foreground','background'] as const){
   while(this.executors[role].ready()){
    const claim=this.queue.claim(role);if(!claim)break;
    if('error'in claim){this.record({id:claim.id,role,state:'failed',reason:claim.error});continue}
    const run:Run={claim,state:'running',reason:undefined};this.runs.set(claim.id,run);
    if(!this.executors[role].supports(requestOf(claim.work))){this.end(claim.id,'failed','Executor no longer supports queued task');continue}
    try{
     this.executors[role].start(requestOf(claim.work));
    }catch(error){this.end(claim.id,'failed',String(error));this.executors[role].stop(claim.id)}
   }
  }}finally{this.pumping=false}
 }
 private message(role:WorkerRole,message:ExecutorMessage):void{
  const id=message.execution.task.taskId,run=this.runs.get(id);if(!run||run.claim.role!==role)return;
  if(terminal(run.state)){this.archive(run);return}
  if(message.type==='stop-ack'){if(run.state==='stopRequested')this.end(id,'cancelled','Stop confirmed');return}
  if(run.state==='stopRequested')return;
  if(message.type==='error'){this.end(id,'failed',message.message);return}
  if(message.type==='result'){
   try{
    const bytes=estimatedBytes(message.artifact);
    if(bytes>taskBudget.memory.activeArtifactBytes||!this.memory(bytes).accepted)throw new Error('Candidate output budget exceeded');
    const work=run.claim.work;
    if(work.kind==='preview'&&!this.gate.current(work.submission.document.id,work.submission.cacheKey.previewKind,id)){this.end(id,'cancelled','Preview replaced or closed');return}
    const claim:RoleClaim=structuredClone(run.claim);
    this.notifying=true;const result=this.hooks.generated(claim,message.artifact);if(result!==undefined&&result!=='completed')throw new Error('Generation handoff must be synchronous');
    this.end(id,result==='completed'?'completed':'generated');
   }catch(error){this.end(id,'failed',String(error))}finally{this.notifying=false}return;
  }

 }
 hasPreviewDemand(taskId:string):boolean{return this.queue.hasPending(taskId)||this.runs.get(taskId)?.state==='running'}
 matchesActiveDocuments(documentId:string,ids:readonly string[]):boolean{return this.gate.activeDocumentId===documentId&&ids.length===this.gate.sessionCount&&ids.every(id=>this.gate.hasSession(id))}
 /** One synchronous switch transaction: invalidate both documents before any next dispatch. */
 activateDocument(documentId:string,openDocumentIds:readonly string[]):void {
  this.mutation();const ids=new Set(openDocumentIds);
  if(!ids.has(documentId)||ids.size>taskBudget.memory.sessions||[...ids].some(id=>!id||id.length>256))throw new Error('Invalid open document projection');
  const closed=this.gate.documentIds.filter(id=>!ids.has(id));
  const affected=new Set([...closed,documentId,...(this.gate.activeDocumentId?[this.gate.activeDocumentId]:[])]);
  for(const id of affected){
   this.gate.invalidate(id);
   for(const taskId of this.queue.cancelDocument(id))this.record({id:taskId,role:undefined,state:'cancelled',reason:'Document activated or left'});
   for(const run of this.runs.values())if(run.claim.work.submission.document.id===id&&!terminal(run.state)){run.state='stopRequested';this.executors[run.claim.role].stop(run.claim.id)}
  }
  for(const id of closed)this.gate.close(id);for(const id of ids)this.gate.open(id);this.gate.activate(documentId);this.pump();
 }
 cancel(id:string):'accepted'|'alreadyTerminal'{
  this.mutation();if(this.queue.cancelPending(id)){this.record({id,role:undefined,state:'cancelled',reason:'Cancelled pending intent'});this.pump();return 'accepted'}
  const run=this.runs.get(id);if(!run||terminal(run.state))return 'alreadyTerminal';run.state='stopRequested';this.executors[run.claim.role].stop(id);return 'accepted';
 }
 private end(id:string,state:Exclude<RoleRunState,'running'|'stopRequested'>,reason?:string):void{
  const run=this.runs.get(id);if(!run||terminal(run.state))return;run.state=state;run.reason=reason;this.archive(run);
 }
 private archive(run:Run):void{
  if(!terminal(run.state)||this.executors[run.claim.role].held(run.claim.id))return;
  this.queue.release(run.claim.role,run.claim.id);this.runs.delete(run.claim.id);this.record({id:run.claim.id,role:run.claim.role,state:run.state,reason:run.reason});
 }
 private record(outcome:Outcome):void{if(this.history.some(item=>item.id===outcome.id))return;this.history.push({...outcome});if(this.history.length>16)this.history.shift()}
 async retryCleanup(role:WorkerRole):Promise<void>{this.mutation();await this.executors[role].retryCleanup()}
 status(id:string){const run=this.runs.get(id);if(run)return {id,state:run.state,reason:run.reason};const result=this.history.find(item=>item.id===id);return result?{...result}:undefined}
 snapshot(){return {queue:this.queue.snapshot(),executors:{foreground:this.executors.foreground.snapshot(),background:this.executors.background.snapshot()},resources:[...this.executors.foreground.resourcesSnapshot(),...this.executors.background.resourcesSnapshot()],memory:this.memory(),history:this.history.map(item=>({...item}))}}
}
