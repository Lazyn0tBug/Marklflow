import {MarkdownWorkerAdapter} from './markdownWorkerAdapter';
import type {RoleSchedulerHooks} from '../../../application/tasks/roleScheduler';
import type {PreviewArtifactValidator} from '../../../application/workspace/previewActivation';
import {PreviewActivation} from '../../../application/workspace/previewActivation';
import {validateMarkdownWorkerArtifact} from '../../../application/workspace/markdownPreviewValidation';
import type {DocumentSessions} from '../../../application/sessions/documentSessions';
import type {MemoryPreviewCache} from '../../../application/previewCache/memoryPreviewCache';
import type {TaskClock} from '../../../application/tasks/contracts';
import type {WorkerRole} from '../../../application/tasks/roleQueue';
import type {PreviewCacheKey} from '../../../application/tasks/previewIdentity';
import type {DocumentRecord} from '../../model/document';
const roles=['foreground','background'] as const;
export interface RuntimeOptions {prepareDom?:RoleSchedulerHooks['prepareDom'];validateArtifact?:PreviewArtifactValidator;changed?:()=>void}
/** Fixed two-role Web composition, not a worker pool. */
export class MarkdownWorkerRuntime {
 readonly coordinator:PreviewActivation;
 private adapters:Partial<Record<WorkerRole,MarkdownWorkerAdapter>>={};private errors:Partial<Record<WorkerRole,string>>={};private disposed=false;
 constructor(sessions:DocumentSessions,clock:TaskClock,configVersion:(doc:DocumentRecord,kind:PreviewCacheKey['previewKind'])=>number,cache:MemoryPreviewCache,private readonly options:RuntimeOptions={}){
  this.coordinator=new PreviewActivation(sessions,clock,configVersion,cache,options.validateArtifact??validateMarkdownWorkerArtifact,role=>{this.replaceStopped(role);this.options.changed?.()},options.prepareDom);
  try{for(const role of roles){const adapter=new MarkdownWorkerAdapter();this.adapters[role]=adapter;this.coordinator.scheduler.install(role,adapter)}}catch(error){this.dispose();throw error}
 }
 private replaceStopped(role:WorkerRole):boolean {
  if(this.disposed)return false;const old=this.adapters[role],slot=this.coordinator.scheduler.snapshot().executors[role];
  if(!old||slot?.state!=='idle'||!old.stopped&&!slot.blocked)return false;
  let next:MarkdownWorkerAdapter|undefined;
  try{old.dispose();next=new MarkdownWorkerAdapter(old.generation+1);this.coordinator.scheduler.install(role,next);this.adapters[role]=next;delete this.errors[role];return true}
  catch(error){next?.dispose();this.errors[role]=String(error);return false}
 }
 /** Lifecycle preflight only; all switching policy stays in PreviewActivation.activate. */
 activate(documentId:string,kind:PreviewCacheKey['previewKind']='preview.flow'){
  if(this.disposed)throw new Error('Markdown runtime disposed');for(const role of roles)this.replaceStopped(role);return this.coordinator.activate(documentId,kind);
 }
 snapshot(){return {disposed:this.disposed,roles:roles.map(role=>({role,id:this.adapters[role]?.id,generation:this.adapters[role]?.generation,stopped:this.adapters[role]?.stopped,error:this.errors[role]})),scheduler:this.coordinator.scheduler.snapshot()}}
 dispose():void{if(this.disposed)return;this.disposed=true;this.coordinator.releasePreviewReference();this.coordinator.scheduler.cancelAll();for(const role of roles)this.adapters[role]?.dispose()}
}
