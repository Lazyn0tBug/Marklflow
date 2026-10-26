import {executorMessageSchema,sameExecution,type WorkerAdapter,type TaskClock,type TaskRequest,type ExecutionIdentity,type ExecutorMessage} from './contracts';
import type {WorkerRole} from './roleQueue';
import {CleanupList} from './cleanup';
import {TaskDeadlines,type DeadlineReason} from './deadlines';
interface Running {identity:ExecutionIdentity;cleanup:CleanupList;deadlines:TaskDeadlines|undefined;stopping:boolean;settled:boolean;invalidated:boolean;}
interface Installed {adapter:WorkerAdapter;run:Running|undefined;blocked:boolean;errors:string[]}
export interface RoleExecutorEvents {message(message:ExecutorMessage):void;fault(taskId:string,reason:string):void;timeout(taskId:string,reason:DeadlineReason):void;available():void}
/** One fixed role and one installed adapter. This is not a lane/worker pool. */
export class RoleExecutor{
 private installed:Installed|undefined;
 constructor(readonly role:WorkerRole,private readonly clock:TaskClock,private readonly events:RoleExecutorEvents,private readonly canAllocate:(additionalBytes:number)=>boolean=()=>true){}
 install(adapter:WorkerAdapter):void{
  if(!adapter.id||!Number.isSafeInteger(adapter.generation)||adapter.generation<0)throw new Error('Invalid worker instance');
  const old=this.installed;
  if(old&&(old.run||adapter===old.adapter||adapter.generation<=old.adapter.generation))throw new Error('Worker replacement requires released execution and a newer instance');
  this.installed={adapter,run:undefined,blocked:false,errors:[]};
 }
 matches(adapter:WorkerAdapter):boolean{return !!this.installed&&(this.installed.adapter===adapter||this.installed.adapter.id===adapter.id)}
 ready():boolean{return !!this.installed&&!this.installed.run&&!this.installed.blocked}
 supports(request:TaskRequest):boolean{return !!this.installed?.adapter.supportedKinds.includes(request.kind)}
 start(request:TaskRequest):void{
  const slot=this.installed;if(!slot||!this.ready()||!this.supports(request))throw new Error('Role worker unavailable');
  const identity:ExecutionIdentity={executorId:slot.adapter.id,executorGeneration:slot.adapter.generation,task:{...request.identity}};
  const run:Running={identity,cleanup:new CleanupList(),deadlines:undefined,stopping:false,settled:false,invalidated:false};
  slot.run=run;
  try{run.deadlines=new TaskDeadlines(this.clock,request.kind,reason=>{run.invalidated=true;slot.blocked=true;this.events.timeout(run.identity.task.taskId,reason);this.stop(run.identity.task.taskId)});run.deadlines.start();slot.adapter.start(structuredClone(request),structuredClone(identity),raw=>this.receive(slot,run,raw),{register:(id,kind,bytes,cleanup)=>{
   if(this.installed!==slot||slot.run!==run||run.settled||run.stopping)throw new Error('Stale resource registration');
   if(!this.canAllocate(bytes))throw new Error('Task resource budget exceeded');
   run.cleanup.register(id,kind,bytes,cleanup);
  }})}catch(error){this.fail(slot,run,String(error))}
 }
 private fail(slot:Installed,run:Running,reason:string):void{run.invalidated=true;slot.blocked=true;this.events.fault(run.identity.task.taskId,reason);this.stop(run.identity.task.taskId)}
 private receive(slot:Installed,run:Running,raw:unknown):void{
  // Callback identity is checked before parsing: old instances/runs cannot affect the current one.
  if(this.installed!==slot||slot.run!==run||run.settled)return;
  const header=raw&&typeof raw==='object'&&'execution'in raw?raw.execution:undefined;
  if(header&&typeof header==='object'){
   if('executorId'in header&&typeof header.executorId==='string'&&header.executorId!==run.identity.executorId)return;
   if('executorGeneration'in header&&typeof header.executorGeneration==='number'&&header.executorGeneration!==run.identity.executorGeneration)return;
   if('task'in header&&header.task&&typeof header.task==='object'&&'taskId'in header.task&&typeof header.task.taskId==='string'&&header.task.taskId!==run.identity.task.taskId)return;
  }
  const parsed=executorMessageSchema.safeParse(raw);
  if(!parsed.success){this.fail(slot,run,'Invalid worker message');return}
  const message=parsed.data;if(!sameExecution(message.execution,run.identity))return;
  const expired=run.deadlines?.check();
  // Deadline expiry may synchronously stop the adapter and reenter receive with its stop proof.
  if(this.installed!==slot||slot.run!==run||run.settled)return;
  if(expired&&(message.type==='start'||message.type==='progress'))return;
  if(message.type==='stop-ack'&&(!run.stopping||message.proof==='terminated'&&slot.adapter.cancellation!=='external')){this.fail(slot,run,'Invalid stop receipt');return}
  if(message.type==='error'&&message.code==='host'){run.invalidated=true;slot.blocked=true}
  if(message.type==='result'||message.type==='error'||message.type==='stop-ack'){
   run.settled=true;run.deadlines?.dispose();void this.finish(slot,run,message);return;
  }
  if(!run.stopping){try{run.deadlines?.enter(message.stage);this.events.message(message)}catch(error){this.fail(slot,run,String(error))}}
 }
 private async finish(slot:Installed,run:Running,message:ExecutorMessage):Promise<void>{
  const errors=await run.cleanup.dispose();slot.errors=errors;
  if(errors.length){run.invalidated=true;slot.blocked=true;this.events.fault(run.identity.task.taskId,'Worker cleanup failed: '+errors.join('; '));return}
  slot.run=undefined;slot.blocked=run.invalidated||message.type==='stop-ack'&&message.proof==='terminated';
  if(run.stopping)this.events.message({protocolVersion:1,execution:run.identity,type:'stop-ack',proof:message.type==='stop-ack'?message.proof:'cooperative'});
  else this.events.message(message);
  this.events.available();
 }
 stop(taskId:string):void{
  const slot=this.installed,run=slot?.run;if(!slot||!run||run.identity.task.taskId!==taskId||run.stopping)return;
  run.stopping=true;if(run.settled)return;
  run.deadlines?.requestCancel();
  try{slot.adapter.stop(structuredClone(run.identity))}catch(error){run.invalidated=true;slot.blocked=true;slot.errors=[String(error)];this.events.fault(taskId,'Worker stop failed: '+String(error))}
 }
 async retryCleanup():Promise<void>{const slot=this.installed,run=slot?.run;if(!slot||!run?.settled||!slot.blocked)throw new Error('No stopped worker cleanup to retry');await this.finish(slot,run,{protocolVersion:1,execution:run.identity,type:'stop-ack',proof:'cooperative'})}
 get resourceBytes():number{return this.installed?.run?.cleanup.totalBytes??0}
 resourcesSnapshot(){const run=this.installed?.run;return run?run.cleanup.snapshot().map(entry=>({...entry,role:this.role,taskId:run.identity.task.taskId})):[]}
 held(taskId:string):boolean{return this.installed?.run?.identity.task.taskId===taskId}
 snapshot(){const slot=this.installed;return slot?{role:this.role,id:slot.adapter.id,generation:slot.adapter.generation,state:slot.run?'running' as const:'idle' as const,blocked:slot.blocked,taskId:slot.run?.identity.task.taskId,errors:[...slot.errors]}:undefined}
}
