import {DocumentSessions} from '../sessions/documentSessions';
import {IdentityGate} from '../tasks/identity';
import {RoleTaskScheduler} from '../tasks/roleScheduler';
import {createPreviewSubmission,samePreviewCacheKey,type PreviewCacheKey} from '../tasks/previewIdentity';
import {type TaskClock,type TaskArtifact} from '../tasks/contracts';
import type {RoleClaim} from '../tasks/roleQueue';
import {MemoryPreviewCache} from '../previewCache/memoryPreviewCache';
import type {PreviewReference} from '../previewCache/contracts';
import type {RoleAdmission,WorkerRole} from '../tasks/roleQueue';
import type {DocumentRecord} from '../../core/model/document';
type PreviewKind=PreviewCacheKey['previewKind'];
type Admission=RoleAdmission|{status:'unsupported'};
export type PreviewArtifactValidator=(submission:ReturnType<typeof createPreviewSubmission>,artifact:TaskArtifact)=>undefined;
export interface ActivationResult {documentId:string;previewKind:PreviewKind;cacheReference:string|undefined;foreground:Admission|undefined;background:Admission|undefined;unchanged:boolean}
/** Single cache owner for preview completion and display references; no UI or engine implementation. */
export class PreviewActivation {
 readonly scheduler:RoleTaskScheduler;
 private readonly gate=new IdentityGate();private displayed:PreviewReference|undefined;
 private selected:PreviewCacheKey|undefined;private foregroundTaskId:string|undefined;
 constructor(private readonly sessions:DocumentSessions,clock:TaskClock,private readonly configVersion:(doc:DocumentRecord,kind:PreviewKind)=>number,private readonly cache:MemoryPreviewCache,private readonly validateArtifact:PreviewArtifactValidator,released?:(role:WorkerRole)=>void){
  this.scheduler=new RoleTaskScheduler(this.gate,clock,(id,kind)=>{if(!this.sessions.documentIds.includes(id))return;const doc=this.sessions.read(id).document;return {document:doc,renderConfigVersion:this.configVersion(doc,kind)}},{generated:(claim,artifact)=>this.commit(claim,artifact),...(released?{released}:{})});
 }
 private submission(id:string,kind:PreviewKind,role:'foreground'|'background'){
  const doc=this.sessions.read(id).document;
  return createPreviewSubmission({taskId:'activation-intent',document:doc,previewKind:kind,role,renderConfigVersion:this.configVersion(doc,kind)});
 }
 private commit(claim:RoleClaim,candidate:TaskArtifact):'completed' {
  const submission=claim.work.submission,key=submission.cacheKey;
  if(claim.id!==submission.taskId||!this.gate.current(key.documentId,key.previewKind,claim.id)||!this.sessions.documentIds.includes(key.documentId))throw new Error('Preview task expired');
  const artifact=candidate; // Already schema-validated at the executor message boundary.
  if(artifact.diagnostics.some(d=>d.severity==='error'))throw new Error('Preview contains errors');
  if(submission.document.markdown.trim()&&!artifact.content.trim())throw new Error('Incomplete preview');
  const nodes=new Set<string>();for(const range of artifact.sourceMap){if(nodes.has(range.nodeId)||range.end.offset>submission.document.markdown.length)throw new Error('Invalid preview source mapping');nodes.add(range.nodeId)}
  if(artifact.mediaType==='application/json')JSON.parse(artifact.content);
  const checked:unknown=this.validateArtifact(structuredClone(submission),structuredClone(artifact));if(checked!==undefined){if(checked instanceof Promise)void checked.catch(()=>{});throw new Error('Preview validation must be synchronous');}
  const current=this.submission(key.documentId,key.previewKind,submission.role);
  if(!this.gate.current(key.documentId,key.previewKind,claim.id)||!samePreviewCacheKey(key,current.cacheKey))throw new Error('Preview source or configuration changed');
  const foreground=submission.role==='foreground'&&this.sessions.activeDocumentId===key.documentId&&this.selected!==undefined&&samePreviewCacheKey(this.selected,key);
  if(foreground)this.currentPreviewReference();
  const reference=this.cache.put(key,artifact);if(!reference)throw new Error('Preview cache capacity exceeded');
  this.sessions.setPreviewReference(key.documentId,key.previewKind,reference);
  if(foreground){this.cache.setActive(reference);this.displayed=reference}
  return 'completed';
 }
 releasePreviewReference():void{this.cache.setActive(undefined);this.displayed=undefined}
 /** The only display read: rechecks active document, current source/config and cache existence. */
 currentPreviewReference():PreviewReference|undefined {
  const reference=this.displayed;
  if(reference&&this.sessions.activeDocumentId===reference.key.documentId&&this.sessions.documentIds.includes(reference.key.documentId)&&this.selected&&samePreviewCacheKey(this.selected,reference.key)&&samePreviewCacheKey(this.submission(reference.key.documentId,reference.key.previewKind,'foreground').cacheKey,reference.key)&&this.cache.resolve(reference))return reference;
  this.releasePreviewReference();return undefined;
 }
 activate(documentId:string,previewKind:PreviewKind='preview.flow'):ActivationResult {
  // Prepare snapshots and queries first: invalid input or lookup errors leave current work untouched.
  const incoming=this.submission(documentId,previewKind,'foreground'),reference=this.cache.lookup(incoming.cacheKey);
  if(this.scheduler.matchesActiveDocuments(documentId,this.sessions.documentIds)&&this.selected&&samePreviewCacheKey(this.selected,incoming.cacheKey)&&reference===undefined&&this.foregroundTaskId&&this.scheduler.hasPreviewDemand(this.foregroundTaskId)){
   this.sessions.activate(documentId);return {documentId,previewKind,cacheReference:undefined,foreground:undefined,background:undefined,unchanged:true};
  }
  const outgoing=this.selected&&this.selected.documentId!==documentId&&this.sessions.documentIds.includes(this.selected.documentId)?this.submission(this.selected.documentId,this.selected.previewKind,'background'):undefined;
  const outgoingComplete=outgoing?this.cache.lookup(outgoing.cacheKey)!==undefined:false;
  this.scheduler.activateDocument(documentId,this.sessions.documentIds);this.sessions.activate(documentId);
  this.selected=incoming.cacheKey;this.releasePreviewReference();
  if(reference){this.cache.setActive(reference);this.displayed=reference;this.sessions.setPreviewReference(documentId,previewKind,reference)}
  const background=outgoing&&!outgoingComplete?this.scheduler.enqueuePreview(outgoing):undefined;
  const foreground=reference===undefined?this.scheduler.enqueuePreview(incoming):undefined;
  this.foregroundTaskId=foreground?.status==='accepted'?foreground.taskId:undefined;
  return {documentId,previewKind,cacheReference:reference?.id,foreground,background,unchanged:false};
 }
}
