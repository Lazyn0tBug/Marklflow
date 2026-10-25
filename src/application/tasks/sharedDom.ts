import {CleanupList} from './cleanup';
import {taskBudget} from './budget';
import type {ExecutionResources,TaskClock} from './contracts';
export type DomPriority='export'|'foreground'|'background';
export type DomStepKind='resources'|'engine'|'pagination';
export interface DomStepContext {signal:AbortSignal;resources:ExecutionResources}
interface Entry {priority:DomPriority;signal:AbortSignal;execute:()=>Promise<void>;reject:(reason:Error)=>void;detach:()=>void}
const priorities:readonly DomPriority[]=['export','foreground','background'];
/** One shared DOM owner. Awaiting a step keeps ownership until it settles and cleans up. */
export class SharedDom {
 private waiting:Entry[]=[];private active:Entry|undefined;private scheduled=false;
 private failedCleanup:CleanupList|undefined;
 constructor(private readonly clock:TaskClock){}
 step<T>(priority:DomPriority,kind:DomStepKind,signal:AbortSignal,run:(context:DomStepContext)=>T|Promise<T>):Promise<T>{
  if(!priorities.includes(priority)||!['resources','engine','pagination'].includes(kind))return Promise.reject(new Error('Invalid DOM step'));
  if(signal.aborted)return Promise.reject(new Error('DOM step cancelled'));
  return new Promise<T>((resolve,reject)=>{
   const entry:Entry={priority,signal,reject,detach:()=>{},execute:async()=>{
    const resources=new CleanupList(),controller=new AbortController();let failure:Error|undefined;
    const cancel=()=>{failure??=new Error('DOM step cancelled');controller.abort()};
    signal.addEventListener('abort',cancel,{once:true});
    const duration=kind==='resources'?taskBudget.deadlinesMs.assetFetch:kind==='pagination'?taskBudget.deadlinesMs.paginationStage:taskBudget.deadlinesMs.engineStage;
    const start=this.clock.now();
    const stopTimer=this.clock.schedule(duration,()=>{failure??=new Error('DOM step timed out');controller.abort()});
    let value:T|undefined;
    try{value=await run({signal:controller.signal,resources})}catch(error){failure??=error instanceof Error?error:new Error(String(error))}
    finally{stopTimer();signal.removeEventListener('abort',cancel)}
    // A synchronous call can block timers: reject after return, never claim hard preemption.
    if(this.clock.now()-start>=duration)failure??=new Error('DOM step timed out');
    const errors=await resources.dispose();
    if(errors.length){this.failedCleanup=resources;failure=new Error('DOM cleanup failed: '+errors.join('; '))}
    if(signal.aborted)failure??=new Error('DOM step cancelled');
    if(failure)reject(failure);else resolve(value as T);
   }};
   const cancel=()=>{const index=this.waiting.indexOf(entry);if(index<0)return;this.waiting.splice(index,1);entry.detach();reject(new Error('DOM step cancelled'))};
   entry.detach=()=>signal.removeEventListener('abort',cancel);
   signal.addEventListener('abort',cancel,{once:true});this.waiting.push(entry);this.schedule();
  });
 }
 private schedule():void{if(this.scheduled)return;this.scheduled=true;queueMicrotask(()=>{this.scheduled=false;void this.next()})}
 private async next():Promise<void>{
  if(this.active||this.failedCleanup)return;
  const priority=priorities.find(value=>this.waiting.some(entry=>entry.priority===value));
  const index=this.waiting.findIndex(entry=>entry.priority===priority);if(index<0)return;
  const entry=this.waiting.splice(index,1)[0];if(!entry)return;
  entry.detach();this.active=entry;
  try{if(entry.signal.aborted)entry.reject(new Error('DOM step cancelled'));else await entry.execute()}
  finally{this.active=undefined;this.schedule()}
 }
 async retryCleanup():Promise<void>{
  const cleanup=this.failedCleanup;if(!cleanup)return;
  const errors=await cleanup.dispose();if(errors.length)throw new Error('DOM cleanup failed: '+errors.join('; '));
  if(this.failedCleanup===cleanup)this.failedCleanup=undefined;this.schedule();
 }
 snapshot(){return {active:this.active?.priority,waiting:this.waiting.map(entry=>entry.priority),blocked:!!this.failedCleanup}}
}
