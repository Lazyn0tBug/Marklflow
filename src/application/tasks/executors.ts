import {executorMessageSchema,executionIdentitySchema,sameExecution,snapshotRequest,type TaskExecutor,type TaskClock,type TaskRequest,type ExecutionIdentity,type ExecutorMessage} from './contracts';
import {ResourceLedger} from './resources';
import {taskBudget} from './budget';
export type ExecutorState='idle'|'busy'|'quarantined'|'restarting'|'disposed';
interface Lease {identity:ExecutionIdentity;owner:{kind:'executor';id:string};stopping:boolean;settled:boolean;invalidated:boolean;stopTimer:(()=>void)|undefined}
interface Slot {executor:TaskExecutor;state:ExecutorState;lease:Lease|undefined;errors:string[]}
export interface ExecutorEvents {message(message:ExecutorMessage):void;fault(taskId:string,reason:string):void;stopTimeout(taskId:string):void;available():void}
/** Two fixed lanes. A quarantined lease blocks replacement until stop and cleanup are proven. */
export class ExecutorPool{
 private slots=new Map<TaskExecutor['lane'],Slot>();
 constructor(private readonly clock:TaskClock,readonly resources:ResourceLedger,private readonly events:ExecutorEvents){}
 install(executor:TaskExecutor):void{
  const old=this.slots.get(executor.lane);
  if(old&&(old.lease||old.state==='quarantined'||executor.generation<=old.executor.generation))throw new Error('Executor replacement requires released lease and newer generation');
  if([...this.slots.values()].some(slot=>slot.executor.id===executor.id&&slot!==old))throw new Error('Executor id already used');
  this.slots.set(executor.lane,{executor,state:'idle',lease:undefined,errors:[]});
 }
 ready(lane:TaskExecutor['lane']):boolean{return this.slots.get(lane)?.state==='idle'}
 supports(lane:TaskExecutor['lane'],request:TaskRequest):boolean{return !!this.slots.get(lane)?.executor.supportedKinds.includes(request.kind)}
 start(lane:TaskExecutor['lane'],request:TaskRequest):void{
  const slot=this.slots.get(lane);if(!slot||slot.state!=='idle'||!this.supports(lane,request))throw new Error('Executor unavailable');
  const identity:ExecutionIdentity={executorId:slot.executor.id,executorGeneration:slot.executor.generation,attempt:1,task:{...request.identity}};
  const lease:Lease={identity,owner:{kind:'executor',id:slot.executor.id+':'+slot.executor.generation+':'+request.identity.taskId},stopping:false,settled:false,invalidated:false,stopTimer:undefined};
  slot.state='busy';slot.lease=lease;
  try{slot.executor.start(snapshotRequest(request),executionIdentitySchema.parse(identity),raw=>this.receive(slot,lease,raw),{register:(id,kind,bytes,cleanup)=>{
   if(slot.lease!==lease||lease.settled||lease.stopping)throw new Error('Stale resource registration');
   this.resources.register({id,kind,bytes,owner:lease.owner,group:'inFlight',taskId:request.identity.taskId,snapshotId:request.identity.snapshotId,documentId:request.identity.documentId,sessionGeneration:request.identity.sessionGeneration,executorGeneration:slot.executor.generation},cleanup);
  }})}catch(error){lease.invalidated=true;slot.state='quarantined';this.events.fault(request.identity.taskId,String(error));this.stop(request.identity.taskId)}
 }
 private receive(slot:Slot,lease:Lease,raw:unknown):void{
  if(slot.lease!==lease||lease.settled)return;
  // Old messages cannot poison the current lease, even if the payload is otherwise malformed.
  const envelope=raw&&typeof raw==='object'&&'execution'in raw?executionIdentitySchema.safeParse(raw.execution):undefined;
  if(envelope?.success&&!sameExecution(envelope.data,lease.identity))return;
  const parsed=executorMessageSchema.safeParse(raw);
  if(!parsed.success){lease.invalidated=true;slot.state='quarantined';this.events.fault(lease.identity.task.taskId,'Invalid executor message');this.stop(lease.identity.task.taskId);return}
  const message=parsed.data;if(!sameExecution(message.execution,lease.identity))return;
  if(message.type==='stop-ack'&&(!lease.stopping||message.proof==='terminated'&&slot.executor.cancellation!=='external')){this.events.fault(lease.identity.task.taskId,'Invalid stop receipt');this.stop(lease.identity.task.taskId);return}
  if(message.type==='result'||message.type==='error'||message.type==='stop-ack'){
   lease.settled=true;lease.stopTimer?.();lease.stopTimer=undefined;
   void this.finish(slot,lease,message);return;
  }
  if(!lease.stopping)this.events.message(message);
 }
 private async finish(slot:Slot,lease:Lease,message:ExecutorMessage):Promise<void>{
  const errors=await this.resources.releaseOwner(lease.owner);slot.errors=errors;
  if(errors.length){lease.invalidated=true;slot.state='quarantined';this.events.fault(lease.identity.task.taskId,'Executor cleanup failed: '+errors.join('; '));return}
  slot.lease=undefined;slot.state=lease.invalidated||message.type==='stop-ack'&&message.proof==='terminated'?'disposed':'idle';
  if(lease.stopping)this.events.message({protocolVersion:1,execution:lease.identity,type:'stop-ack',proof:message.type==='stop-ack'?message.proof:'cooperative'});
  else this.events.message(message);
  this.events.available();
 }
 stop(taskId:string):void{
  const slot=[...this.slots.values()].find(item=>item.lease?.identity.task.taskId===taskId);const lease=slot?.lease;if(!slot||!lease||lease.stopping)return;
  lease.stopping=true;if(lease.settled)return;
  lease.stopTimer=this.clock.schedule(taskBudget.deadlinesMs.cancelGrace,()=>{if(slot.lease!==lease||lease.settled)return;lease.invalidated=true;slot.state='quarantined';this.events.stopTimeout(taskId)});
  try{slot.executor.stop({...lease.identity,task:{...lease.identity.task}})}catch(error){lease.invalidated=true;slot.state='quarantined';slot.errors=[String(error)]}
 }
 async retryCleanup(lane:TaskExecutor['lane']):Promise<void>{const slot=this.slots.get(lane);if(!slot?.lease?.settled||slot.state!=='quarantined')throw new Error('No stopped quarantine to clean');await this.finish(slot,slot.lease,{protocolVersion:1,execution:slot.lease.identity,type:'stop-ack',proof:'cooperative'})}
 held(taskId:string):boolean{return [...this.slots.values()].some(slot=>slot.lease?.identity.task.taskId===taskId)}
 snapshot(){return [...this.slots].map(([lane,slot])=>({lane,id:slot.executor.id,generation:slot.executor.generation,state:slot.state,taskId:slot.lease?.identity.task.taskId,errors:[...slot.errors]}))}
}
