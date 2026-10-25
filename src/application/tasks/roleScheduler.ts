import {previewSubmissionSchema} from './previewIdentity';
import {snapshotRequest,artifactSchema,type TaskExecutor,type TaskClock,type ExecutorMessage,type TaskArtifact} from './contracts';
import {RoleTaskQueue,requestOf,type WorkerRole,type RoleClaim,type RoleAdmission} from './roleQueue';
import {IdentityGate} from './identity';
import {ExecutorPool} from './executors';
import {ResourceLedger} from './resources';
import {TaskDeadlines} from './deadlines';
import {assessDualWorkerMemory,dualWorkerPolicy} from './dualWorkerPolicy';
export type RoleRunState='running'|'stopRequested'|'generated'|'failed'|'cancelled'|'timedOut';
interface Run {claim:RoleClaim;state:RoleRunState;reason:string|undefined;deadlines:TaskDeadlines|undefined}
interface Outcome {id:string;role:WorkerRole|undefined;state:RoleRunState|'superseded';reason:string|undefined}
const terminal=(state:RoleRunState)=>state!=='running'&&state!=='stopRequested';
/** Generation handoff only; generated is not cache completion, preview publication or export delivery. */
export interface RoleSchedulerHooks {generated(claim:RoleClaim,artifact:TaskArtifact):undefined}
export class RoleTaskScheduler{
 private readonly ledger=new ResourceLedger();private readonly queue:RoleTaskQueue;
 private readonly pools:Record<WorkerRole,ExecutorPool>;private readonly installed=new Map<WorkerRole,TaskExecutor>();
 private runtime:Record<WorkerRole,number>={foreground:0,background:0};
 private runs=new Map<string,Run>();private history:Outcome[]=[];private timer:(()=>void)|undefined;
 private pumping=false;private notifying=false;
 constructor(private readonly gate:IdentityGate,private readonly clock:TaskClock,private readonly hooks:RoleSchedulerHooks={generated:()=>undefined}){
  const floor=dualWorkerPolicy.memory.reservedRuntimeBytesPerWorker;
  this.queue=new RoleTaskQueue(gate,clock,()=>this.ledger.totalBytes+Math.max(0,this.runtime.foreground-floor)+Math.max(0,this.runtime.background-floor));
  const pool=(role:WorkerRole)=>new ExecutorPool(clock,this.ledger,{message:message=>this.message(role,message),fault:(id,reason)=>{this.end(id,'failed',reason);this.pools[role].stop(id)},stopTimeout:id=>this.end(id,'timedOut','Stop not confirmed'),available:()=>{for(const run of [...this.runs.values()])this.archive(run);this.pump()}});
  this.pools={foreground:pool('foreground'),background:pool('background')};
 }
 private mutation():void{if(this.notifying)throw new Error('Reentrant generation handoff')}
 private memory(extra=0){return assessDualWorkerMemory({foregroundRuntimeBytes:this.runtime.foreground,backgroundRuntimeBytes:this.runtime.background,ownedTaskBytes:this.queue.ownedBytes+this.ledger.totalBytes+extra,clonePeakBytes:0,otherOwnedBytes:0})}
 install(role:WorkerRole,executor:TaskExecutor,runtimeBytes=0):void{
  this.mutation();if(executor.lane!=='compute'||executor.capabilities.requiresDOM)throw new Error('Role workers require a compute executor');
  const other=role==='foreground'?'background':'foreground';if(this.installed.get(other)?.id===executor.id||this.installed.get(other)===executor)throw new Error('Role executors must be independent');
  const old=this.runtime[role];this.runtime[role]=runtimeBytes;
  try{
   if(!this.memory().accepted)throw new Error('Worker runtime budget exceeded');
   const wrapped:TaskExecutor={id:executor.id,generation:executor.generation,lane:executor.lane,cancellation:executor.cancellation,capabilities:{...executor.capabilities},supportedKinds:[...executor.supportedKinds],start:(request,execution,receive,resources)=>executor.start(request,execution,receive,{register:(id,kind,bytes,cleanup)=>{
    if(!this.memory(bytes).accepted)throw new Error('Combined task/resource budget exceeded');resources.register(id,kind,bytes,cleanup);
   }}),stop:execution=>executor.stop(execution)};
   this.pools[role].install(wrapped);this.installed.set(role,wrapped);
  }catch(error){this.runtime[role]=old;throw error}this.pump();
 }
 enqueuePreview(input:unknown):RoleAdmission|{status:'unsupported'}{
  this.mutation();const submission=previewSubmissionSchema.parse(input);this.expire();
  if(!this.pools[submission.role].supports('compute',submission.request))return {status:'unsupported'};
  const admitted=this.queue.enqueuePreview(submission);if(admitted.status==='accepted')for(const id of admitted.replaced)this.record({id,role:submission.role,state:'superseded',reason:'Latest pending intent'});
  this.pump();return admitted;
 }
 enqueueExport(input:unknown):RoleAdmission|{status:'unsupported'}{
  this.mutation();const request=snapshotRequest(input);this.expire();if(!this.pools.background.supports('compute',request))return {status:'unsupported'};
  const admitted=this.queue.enqueueExport(request);this.pump();return admitted;
 }
 private expire():void{for(const expired of this.queue.expire())this.record({id:expired.id,role:expired.role,state:'timedOut',reason:'Queue deadline'})}
 private arm():void{
  this.timer?.();this.timer=undefined;const at=this.queue.nextExpiry;
  if(Number.isFinite(at))this.timer=this.clock.schedule(Math.max(0,at-this.clock.now()),()=>{this.expire();this.pump()});
 }
 private pump():void{
  if(this.pumping||this.notifying)return;this.pumping=true;
  try{this.expire();for(const role of ['foreground','background'] as const){
   while(this.pools[role].ready('compute')){
    const claim=this.queue.claim(role);if(!claim)break;
    const run:Run={claim,state:'running',reason:undefined,deadlines:undefined};this.runs.set(claim.id,run);
    if(!this.pools[role].supports('compute',requestOf(claim.work))){this.end(claim.id,'failed','Executor no longer supports queued task');continue}
    try{
     const origin=claim.work.kind==='preview'&&role==='background'?this.clock.now():claim.acceptedAt;
     run.deadlines=new TaskDeadlines(this.clock,requestOf(claim.work).kind,reason=>{this.end(claim.id,'timedOut',reason);this.pools[role].stop(claim.id)},origin);
     if(run.deadlines.check())continue;run.deadlines.start();this.pools[role].start('compute',requestOf(claim.work));
    }catch(error){this.end(claim.id,'failed',String(error));this.pools[role].stop(claim.id)}
   }
  }}finally{this.pumping=false;this.arm()}
 }
 private message(role:WorkerRole,message:ExecutorMessage):void{
  const id=message.execution.task.taskId,run=this.runs.get(id);if(!run||run.claim.role!==role)return;
  if(terminal(run.state)){this.archive(run);return}if(run.deadlines?.check())return;
  if(message.type==='stop-ack'){if(run.state==='stopRequested')this.end(id,'cancelled','Stop confirmed');return}
  if(run.state==='stopRequested')return;
  if(message.type==='error'){this.end(id,'failed',message.message);return}
  if(message.type==='result'){
   try{
    const bytes=new TextEncoder().encode(JSON.stringify(message.artifact)).byteLength*3;
    if(!this.memory(bytes).accepted)throw new Error('Candidate clone budget exceeded');
    const work=run.claim.work;
    const claim:RoleClaim={...run.claim,work:work.kind==='preview'?{kind:'preview',submission:previewSubmissionSchema.parse(work.submission)}:{kind:'export',request:snapshotRequest(work.request)}};
    this.notifying=true;const result=this.hooks.generated(claim,artifactSchema.parse(message.artifact));if(result!==undefined)throw new Error('Generation handoff must be synchronous');
    this.end(id,'generated');
   }catch(error){this.end(id,'failed',String(error))}finally{this.notifying=false}return;
  }
  try{if(['artifactReady','delivering','completed'].includes(message.stage))throw new Error('Generation executor cannot announce cache/delivery completion');if(message.stage!=='accepted')run.deadlines?.enter(message.stage)}catch(error){this.end(id,'failed',String(error));this.pools[role].stop(id)}
 }
 cancel(id:string):'accepted'|'alreadyTerminal'{
  this.mutation();if(this.queue.cancelPending(id)){this.record({id,role:undefined,state:'cancelled',reason:'Cancelled pending intent'});this.pump();return 'accepted'}
  const run=this.runs.get(id);if(!run||terminal(run.state))return 'alreadyTerminal';run.state='stopRequested';run.deadlines?.requestCancel();this.pools[run.claim.role].stop(id);return 'accepted';
 }
 private end(id:string,state:Exclude<RoleRunState,'running'|'stopRequested'>,reason?:string):void{
  const run=this.runs.get(id);if(!run||terminal(run.state))return;run.state=state;run.reason=reason;run.deadlines?.dispose();this.archive(run);
 }
 private archive(run:Run):void{
  if(!terminal(run.state)||this.pools[run.claim.role].held(run.claim.id))return;
  this.queue.release(run.claim.role,run.claim.id);if(run.claim.work.kind==='export'&&run.state!=='generated')this.queue.finishExport(run.claim.id);this.runs.delete(run.claim.id);this.record({id:run.claim.id,role:run.claim.role,state:run.state,reason:run.reason});
 }
 private record(outcome:Outcome):void{if(this.history.some(item=>item.id===outcome.id))return;this.history.push({...outcome});if(this.history.length>16)this.history.shift()}
 /** Delivery ownership is separate: generation alone cannot release the accepted export slot. */
 releaseExportReservation(id:string):boolean{this.mutation();return this.queue.finishExport(id)}
 async retryCleanup(role:WorkerRole):Promise<void>{this.mutation();await this.pools[role].retryCleanup('compute')}
 status(id:string){const run=this.runs.get(id);if(run)return {id,state:run.state,reason:run.reason};const result=this.history.find(item=>item.id===id);return result?{...result}:undefined}
 snapshot(){return {queue:this.queue.snapshot(),executors:{foreground:this.pools.foreground.snapshot(),background:this.pools.background.snapshot()},resources:this.ledger.snapshot(),memory:this.memory(),history:this.history.map(item=>({...item}))}}
}
