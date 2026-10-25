import {snapshotRequest,artifactSchema,deliveryReceiptSchema,isPreview,type TaskRequest,type TaskArtifact,type TaskClock,type TaskExecutor,type ExecutorMessage,type DeliveryReceipt} from './contracts';
import {taskBudget} from './budget';
import {TaskLifecycle,isTerminal,type TerminalState} from './lifecycle';
import {IdentityGate} from './identity';
import {TaskQueue} from './queue';
import {TaskDeadlines} from './deadlines';
import {ResourceLedger} from './resources';
import {ExecutorPool} from './executors';
interface Work {request:TaskRequest;life:TaskLifecycle;deadlines:TaskDeadlines;inputRelease:(()=>void)|undefined;candidate:TaskArtifact|undefined;ready:boolean;delivering:boolean;reason:string|undefined;deliveryOutcome:DeliveryReceipt['outcome']|undefined;cleaning:boolean;lane:TaskExecutor['lane'];validationPending:boolean}
export interface TaskHooks {
 /** Trusted adapter validates actual sanitization, content integrity and target format. */
 validate(request:TaskRequest,artifact:TaskArtifact):Promise<void>;
 /** A synchronous atomic replacement; async and reentrant publication are forbidden. */
 publish(request:TaskRequest,artifact:TaskArtifact):undefined;
}
export type Admission={status:'accepted';taskId:string;identity:TaskRequest['identity']}|{status:'busy'|'inactive'|'capacity'|'unsupported'};
const bytes=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value)).byteLength;
/** A2 composition, injected test/host ports only. No Worker, DOM, files or engine instances. */
export class TaskSupervisor{
 private readonly identity=new IdentityGate();private readonly queue=new TaskQueue(this.identity);
 readonly resources=new ResourceLedger();private readonly pool:ExecutorPool;
 private tasks=new Map<string,Work>();private history:{taskId:string;state:TerminalState;reason:string|undefined;deliveryOutcome:DeliveryReceipt['outcome']|undefined}[]=[];
 private sequence=0;private publishing=false;private pumping=false;private views=new Map<string,string>();
 constructor(private readonly clock:TaskClock,private readonly hooks:TaskHooks){
  this.pool=new ExecutorPool(clock,this.resources,{message:message=>this.message(message),fault:(id,reason)=>{this.finish(id,'failed',reason);this.pool.stop(id)},stopTimeout:id=>this.finish(id,'timedOut','Execution stop not confirmed'),available:()=>{for(const id of this.tasks.keys())this.cleanup(id);this.pump()}});
 }
 private mutation():void{if(this.publishing)throw new Error('Reentrant preview publication')}
 open(documentId:string):number{this.mutation();return this.identity.open(documentId)}
 activate(documentId:string){this.mutation();const token=this.identity.activate(documentId);this.invalidatePreviews();return token}
 close(documentId:string):void{this.mutation();this.identity.close(documentId);this.invalidatePreviews()}
 revokeBefore(revision:number):void{this.mutation();this.identity.revokeBefore(revision);for(const [id,work]of this.tasks)if(!work.delivering&&!this.identity.authorized(work.request)){this.finish(id,'failed','Authorization revoked');this.pool.stop(id)}}
 install(executor:TaskExecutor):void{this.mutation();this.pool.install(executor);this.pump()}
 submit(input:unknown,lane:TaskExecutor['lane']):Admission{
  this.mutation();const request=snapshotRequest(input);
  if(!this.pool.supports(lane,request))return {status:'unsupported'};
  if(!isPreview(request.kind)&&this.tasks.size>0&&[...this.tasks.values()].some(work=>!isPreview(work.request.kind)&&!isTerminal(work.life.state)))return {status:'busy'};
  if(!this.identity.authorized(request)||(!isPreview(request.kind)&&!this.identity.sessionMatches(request))||isPreview(request.kind)&&!this.identity.activeMatches(request))return {status:'inactive'};
  if(new TextEncoder().encode(request.document.markdown).byteLength>taskBudget.input.markdownUtf8Bytes)throw new Error('Markdown UTF-8 budget exceeded');
  if((request.document.assets??[]).reduce((sum,asset)=>sum+asset.bytes,0)>taskBudget.input.totalImageBytes)throw new Error('Asset budget exceeded');
  const inputBytes=bytes(request)*3;if(inputBytes+this.resources.totalBytes>taskBudget.memory.inFlightBytes)return {status:'capacity'};
  request.identity.taskId='task-'+(++this.sequence);
  const id=request.identity.taskId;
  this.resources.register({id:'input:'+id,kind:'snapshot',owner:{kind:'task',id},group:'inFlight',bytes:inputBytes,taskId:id,snapshotId:request.identity.snapshotId,documentId:request.identity.documentId,sessionGeneration:request.identity.sessionGeneration,executorGeneration:0},()=>{});
  const admission=this.queue.enqueue({request,lane,acceptedAt:this.clock.now(),queueDeadline:this.clock.now()+(isPreview(request.kind)?taskBudget.deadlinesMs.previewQueue:taskBudget.deadlinesMs.exportQueue)});
  if(admission.status!=='accepted'){void this.resources.releaseOwner({kind:'task',id});return admission}
  const life=new TaskLifecycle();
  const deadlines=new TaskDeadlines(this.clock,request.kind,reason=>{const work=this.tasks.get(id);if(work?.delivering){work.deliveryOutcome='unknown';this.finish(id,'failed','Delivery outcome unknown: '+reason)}else this.finish(id,'timedOut',reason);this.pool.stop(id)});
  this.tasks.set(id,{request,life,deadlines,inputRelease:undefined,candidate:undefined,ready:false,delivering:false,reason:undefined,deliveryOutcome:undefined,cleaning:false,lane,validationPending:false});
  admission.replaced.forEach(old=>this.finish(old,'superseded','Newer preview intent'));
  if(isPreview(request.kind))for(const [old,work]of this.tasks)if(old!==id&&work.request.kind===request.kind&&work.request.identity.documentId===request.identity.documentId&&!isTerminal(work.life.state)&&work.life.state!=='cancelRequested'){this.finish(old,'superseded','Newer snapshot');this.pool.stop(old)}
  this.pump();return {status:'accepted',taskId:id,identity:{...request.identity}};
 }
 private invalidatePreviews():void{
  this.queue.invalidatePreviews();for(const [id,work]of this.tasks)if(isPreview(work.request.kind)&&!this.identity.current(work.request)&&work.life.state!=='cancelRequested'){this.finish(id,'superseded','Inactive preview');this.pool.stop(id)}
  for(const kind of [...this.views.keys()])this.releaseView(kind);
 }
 private pump():void{
  if(this.pumping||this.publishing)return;this.pumping=true;
  try{for(const lane of ['compute','dom'] as const){if(!this.pool.ready(lane)||[...this.tasks.values()].some(work=>work.lane===lane&&work.validationPending))continue;
   const next=this.queue.take(lane);if(!next)continue;const id=next.request.identity.taskId,work=this.tasks.get(id);if(!work||work.deadlines.check()||isTerminal(work.life.state))continue;
   if(isPreview(work.request.kind)&&!this.identity.current(work.request)&&work.life.state!=='cancelRequested'){this.finish(id,'superseded','Stale queue');continue}
   work.life.move('running');work.deadlines.start();work.inputRelease=this.resources.acquire('input:'+id);this.pool.start(lane,work.request);
  }}finally{this.pumping=false}
 }
 cancel(id:string):'accepted'|'tooLate'|'alreadyTerminal'{
  const work=this.tasks.get(id);if(!work||isTerminal(work.life.state))return 'alreadyTerminal';
  if(work.life.state==='publishing'||work.delivering)return 'tooLate';this.mutation();
  if(work.life.state==='queued'||!this.pool.held(id)&&!work.validationPending){this.finish(id,'cancelled','Cancelled before execution/delivery');return 'accepted'}
  if(work.life.state!=='cancelRequested')work.life.move('cancelRequested');work.deadlines.requestCancel();this.pool.stop(id);return 'accepted';
 }
 private message(message:ExecutorMessage):void{
  const id=message.execution.task.taskId,work=this.tasks.get(id);if(!work)return;
  if(!this.pool.held(id)){work.inputRelease?.();work.inputRelease=undefined}
  if(isTerminal(work.life.state)){this.cleanup(id);return}
  if(work.deadlines.check())return;
  if(message.type==='stop-ack'){if(work.life.state==='cancelRequested')this.finish(id,'cancelled','Execution stop confirmed');return}
  if(work.life.state==='cancelRequested')return;
  if(message.type==='error'){this.finish(id,'failed',message.code+': '+message.message);return}
  if(message.type==='result'){void this.acceptArtifact(id,message.artifact);return}
  try{if(['artifactReady','delivering','completed'].includes(message.stage))throw new Error('Executor cannot announce delivery state');if(message.stage!=='accepted')work.deadlines.enter(message.stage)}catch(error){this.finish(id,'failed',String(error));this.pool.stop(id)}
 }
 private async acceptArtifact(id:string,input:unknown):Promise<void>{
  const work=this.tasks.get(id);if(!work||work.life.state!=='running')return;
  work.life.move('validating');work.validationPending=true;work.deadlines.validation();
  try{
   const artifact=artifactSchema.parse(input),identity=work.request.identity;
   if(artifact.diagnostics.some(item=>item.severity==='error')||artifact.engineFingerprint!==identity.engineFingerprint||artifact.layoutFingerprint!==identity.layoutFingerprint||artifact.policyFingerprint!==identity.policyFingerprint||artifact.resourceFingerprint!==identity.resourceFingerprint)throw new Error('Artifact diagnostics or fingerprint mismatch');
   if(artifact.sourceMap.some(node=>node.end.offset>work.request.document.markdown.length)||new Set(artifact.sourceMap.map(node=>node.nodeId)).size!==artifact.sourceMap.length)throw new Error('Invalid source mapping');
   const media:Record<TaskRequest['kind'],TaskArtifact['mediaType']>={'preview.flow':'text/html','preview.a4':'text/html','export.md':'text/markdown','export.mdBundle':'application/zip','export.html':'text/html','export.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','export.print':'text/html'};
   if(artifact.mediaType!==media[work.request.kind])throw new Error('Wrong artifact media type');
   if(artifact.resources.some(asset=>asset.bytes>taskBudget.input.singleImageBytes)||artifact.resources.reduce((sum,asset)=>sum+asset.bytes,0)>taskBudget.input.totalImageBytes)throw new Error('Artifact resources exceed budget');
   const allocation=bytes(artifact)*3;if(allocation>taskBudget.memory.activeArtifactBytes)throw new Error('Artifact byte budget exceeded');
   this.resources.register({id:'output:'+id,kind:'artifact',owner:{kind:'task',id},group:'activeArtifact',bytes:allocation,taskId:id,snapshotId:identity.snapshotId,documentId:identity.documentId,sessionGeneration:identity.sessionGeneration,executorGeneration:0},()=>{work.candidate=undefined});work.candidate=artifact;
   await this.hooks.validate(snapshotRequest(work.request),artifactSchema.parse(artifact));
   if(work.life.readState()==='cancelRequested'){this.finish(id,'cancelled','Validation stopped');return}
   if(isTerminal(work.life.state)||work.deadlines.check())return;
   if(!this.identity.authorized(work.request))throw new Error('Authorization revoked');
   if(isPreview(work.request.kind)){
    if(!this.identity.current(work.request)){this.finish(id,'superseded','Stale before publish');return}
    work.life.move('publishing');this.publishing=true;
    try{const result=this.hooks.publish(snapshotRequest(work.request),artifactSchema.parse(artifact));if(result!==undefined)throw new Error('Publication must be synchronous')}finally{this.publishing=false}
    this.releaseView(work.request.kind);
    this.resources.transfer('output:'+id,{kind:'task',id},{kind:'view',id:work.request.kind},'activeArtifact');this.views.set(work.request.kind,'output:'+id);
    this.finish(id,'succeeded');
   }else{work.ready=true;work.deadlines.enter('artifactReady')}
  }catch(error){this.finish(id,work.life.readState()==='cancelRequested'?'cancelled':'failed',String(error))}finally{work.validationPending=false;if(isTerminal(work.life.state))this.cleanup(id);this.pump()}
 }
 artifact(id:string):TaskArtifact|undefined{const work=this.tasks.get(id);return work?.ready&&!isTerminal(work.life.state)&&work.candidate?artifactSchema.parse(work.candidate):undefined}
 beginDelivery(id:string):boolean{
  this.mutation();const work=this.tasks.get(id);if(!work?.ready||work.delivering||isTerminal(work.life.state)||work.deadlines.check()||!this.identity.authorized(work.request))return false;
  work.delivering=true;work.deadlines.enter('delivering');return true;
 }
 completeDelivery(id:string,input:unknown):void{
  this.mutation();const work=this.tasks.get(id);if(!work?.delivering||isTerminal(work.life.state))return;
  const receipt=deliveryReceiptSchema.parse(input);if(receipt.artifactId!==work.candidate?.artifactId)throw new Error('Delivery artifact mismatch');
  const valid=work.request.kind==='export.print'?receipt.outcome==='handedOff':receipt.outcome==='dispatched'||receipt.outcome==='committed';
  work.deliveryOutcome=receipt.outcome;this.finish(id,valid?'succeeded':'failed',valid?undefined:receipt.message??'Delivery failed or unknown');
 }
 releaseView(kind:string):void{this.mutation();const id=this.views.get(kind);if(id){this.views.delete(kind);void this.resources.release(id,{kind:'view',id:kind})}}
 private finish(id:string,state:TerminalState,reason?:string):void{
  const work=this.tasks.get(id);if(!work||isTerminal(work.life.state))return;
  work.life.move(state);work.reason=reason;work.deadlines.dispose();this.queue.finish(id);this.cleanup(id);
 }
 private cleanup(id:string):void{
  const work=this.tasks.get(id);if(!work||!isTerminal(work.life.state)||this.pool.held(id)||work.validationPending||work.cleaning)return;
  work.inputRelease?.();work.inputRelease=undefined;work.cleaning=true;
  void this.resources.releaseOwner({kind:'task',id}).then(errors=>{
   work.cleaning=false;if(errors.length){work.reason=(work.reason??'')+'; cleanup: '+errors.join('; ');return}
   const state=work.life.state;if(!isTerminal(state))return;
   this.history.push({taskId:id,state,reason:work.reason,deliveryOutcome:work.deliveryOutcome});if(this.history.length>16)this.history.shift();this.tasks.delete(id);this.pump();
  });
 }
 status(id:string){const work=this.tasks.get(id);return work?{taskId:id,state:work.life.state,reason:work.reason,deliveryOutcome:work.deliveryOutcome}:this.history.find(item=>item.taskId===id)}
 async retryCleanup(lane:TaskExecutor['lane']):Promise<void>{this.mutation();await this.pool.retryCleanup(lane)}
 stats(){return {pending:this.queue.size,trackedTasks:this.tasks.size,history:this.history.length,validationLeases:[...this.tasks.values()].filter(work=>work.validationPending).length,executors:this.pool.snapshot(),resources:this.resources.snapshot(),ownedBytes:this.resources.totalBytes}}
}
