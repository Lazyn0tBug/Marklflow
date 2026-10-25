import {workerStartSchema,executorMessageSchema,executionIdentitySchema,sameExecution,type WorkerAdapter,type ExecutionIdentity,type TaskRequest,type ExecutionResources} from '../../../application/tasks/contracts';
let sequence=0;
/** One resident module Worker; hard stop is terminal for this adapter instance. Caller owns dispose. */
export class MarkdownWorkerAdapter implements WorkerAdapter {
 readonly id:string;readonly cancellation='external';readonly supportedKinds=['preview.flow','preview.a4'] as const;
 private readonly worker:Worker;private dead=false;private current:{execution:ExecutionIdentity;receive:(message:unknown)=>void}|undefined;
 constructor(readonly generation=1){
  if(!Number.isSafeInteger(generation)||generation<0||sequence===Number.MAX_SAFE_INTEGER)throw new Error('Invalid Markdown worker instance');
  this.id='markdown-worker-'+(++sequence);this.worker=new Worker(new URL('../../../workers/markdownWorker.ts',import.meta.url),{type:'module',name:'markflow-markdown'});
  this.worker.addEventListener('message',(event:MessageEvent<unknown>)=>{const run=this.current;if(!run)return;const raw=event.data,header=raw&&typeof raw==='object'&&'execution'in raw?executionIdentitySchema.safeParse(raw.execution):undefined;if(header?.success&&!sameExecution(header.data,run.execution))return;const parsed=executorMessageSchema.safeParse(raw);if(!parsed.success){this.fail('Invalid Markdown worker response');return}if(sameExecution(parsed.data.execution,run.execution))run.receive(parsed.data)});
  this.worker.addEventListener('error',event=>{event.preventDefault();this.fail(event.message||'Markdown worker failed')});
  this.worker.addEventListener('messageerror',()=>this.fail('Markdown worker message could not be decoded'));
 }
 private fail(message:string):void{const run=this.current;this.dead=true;this.worker.terminate();if(run)run.receive({protocolVersion:1,execution:run.execution,type:'error',code:'host',message:message.slice(0,8192)})}
 get stopped():boolean{return this.dead}
 start(request:TaskRequest,execution:ExecutionIdentity,receive:(message:unknown)=>void,resources:ExecutionResources):void {
  if(this.dead||this.current)throw new Error('Markdown worker unavailable');
  const command=workerStartSchema.parse({protocolVersion:1,type:'start',request,execution});
  if(execution.executorId!==this.id||execution.executorGeneration!==this.generation)throw new Error('Markdown worker instance or mode mismatch');
  const run={execution:command.execution,receive};this.current=run;
  try{resources.register('markdown-job','port',0,()=>{if(this.current===run)this.current=undefined});this.worker.postMessage(command)}catch(error){this.current=undefined;throw error}
 }
 stop(execution:ExecutionIdentity):void{const run=this.current;if(!run||!sameExecution(run.execution,execution))return;this.dead=true;this.worker.terminate();run.receive({protocolVersion:1,execution:run.execution,type:'stop-ack',proof:'terminated'})}
 dispose():void{if(!this.dead&&this.current)this.stop(this.current.execution);this.dead=true;this.worker.terminate();this.current=undefined}
}
