import {DocumentSessions} from '../sessions/documentSessions';
import {IdentityGate} from '../tasks/identity';
import {RoleTaskScheduler,type RoleSchedulerHooks} from '../tasks/roleScheduler';
import {createPreviewSubmission,samePreviewCacheKey,type PreviewCacheKey} from '../tasks/previewIdentity';
import type {TaskClock} from '../tasks/contracts';
import type {RoleAdmission} from '../tasks/roleQueue';
import type {DocumentRecord} from '../../core/model/document';
type PreviewKind=PreviewCacheKey['previewKind'];
type Admission=RoleAdmission|{status:'unsupported'};
export type PreviewLookup=(key:Readonly<PreviewCacheKey>)=>string|undefined;
export interface ActivationResult {documentId:string;previewKind:PreviewKind;cacheReference:string|undefined;foreground:Admission|undefined;background:Admission|undefined;unchanged:boolean}
/** Coordinates existing sessions and queues; lookup returns a complete cache reference, never a partial result. */
export class PreviewActivation {
 readonly scheduler:RoleTaskScheduler;
 private selected:PreviewCacheKey|undefined;private foregroundTaskId:string|undefined;
 constructor(private readonly sessions:DocumentSessions,clock:TaskClock,private readonly configVersion:(doc:DocumentRecord,kind:PreviewKind)=>number,private readonly lookup:PreviewLookup,hooks:RoleSchedulerHooks={generated:()=>undefined}){
  const gate=new IdentityGate();
  this.scheduler=new RoleTaskScheduler(gate,clock,(id,kind)=>{if(!this.sessions.documentIds.includes(id))return;const doc=this.sessions.read(id).document;return {document:doc,renderConfigVersion:this.configVersion(doc,kind)}},hooks);
 }
 private submission(id:string,kind:PreviewKind,role:'foreground'|'background'){
  const doc=this.sessions.read(id).document;
  return createPreviewSubmission({taskId:'activation-intent',document:doc,previewKind:kind,role,renderConfigVersion:this.configVersion(doc,kind)});
 }
 activate(documentId:string,previewKind:PreviewKind='preview.flow'):ActivationResult {
  // Prepare snapshots and queries first: invalid input or lookup errors leave current work untouched.
  const incoming=this.submission(documentId,previewKind,'foreground'),reference=this.lookup({...incoming.cacheKey});
  if(this.scheduler.matchesActiveDocuments(documentId,this.sessions.documentIds)&&this.selected&&samePreviewCacheKey(this.selected,incoming.cacheKey)&&reference===undefined&&this.foregroundTaskId&&this.scheduler.hasPreviewDemand(this.foregroundTaskId)){
   this.sessions.activate(documentId);return {documentId,previewKind,cacheReference:undefined,foreground:undefined,background:undefined,unchanged:true};
  }
  const outgoing=this.selected&&this.selected.documentId!==documentId&&this.sessions.documentIds.includes(this.selected.documentId)?this.submission(this.selected.documentId,this.selected.previewKind,'background'):undefined;
  const outgoingComplete=outgoing?this.lookup({...outgoing.cacheKey})!==undefined:false;
  this.scheduler.activateDocument(documentId,this.sessions.documentIds);this.sessions.activate(documentId);
  const background=outgoing&&!outgoingComplete?this.scheduler.enqueuePreview(outgoing):undefined;
  const foreground=reference===undefined?this.scheduler.enqueuePreview(incoming):undefined;
  this.selected=incoming.cacheKey;this.foregroundTaskId=foreground?.status==='accepted'?foreground.taskId:undefined;
  return {documentId,previewKind,cacheReference:reference,foreground,background,unchanged:false};
 }
}
