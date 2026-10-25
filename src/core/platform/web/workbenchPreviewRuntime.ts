import {MarkdownWorkerRuntime} from './markdownWorkerRuntime';
import {RenderConfigVersion} from '../../../application/tasks/previewIdentity';
import {MemoryPreviewCache} from '../../../application/previewCache/memoryPreviewCache';
import type {DocumentSessions} from '../../../application/sessions/documentSessions';
import type {DocumentRecord} from '../../model/document';
import {validateMarkdownWorkerArtifact} from '../../../application/workspace/markdownPreviewValidation';
import {renderedPreviewSchema,validateRenderedPreview,type RenderedPreview} from '../../../application/workspace/renderedPreview';
import {renderDocument,assertArtifact} from '../../render/documentRenderer';
import {paginateDocument} from '../../render/documentPaginator';
import {applyDocumentAssets} from '../../export/documentAssets';
import type {PreviewCacheKey} from '../../../application/tasks/previewIdentity';
export interface PreviewView {documentId:string;kind:PreviewCacheKey['previewKind'];state:'pending'|'ready'|'error';referenceId?:string;rendered?:RenderedPreview;error?:string}
/** Production composition: two compute roles, one DOM entry, one complete-artifact cache. */
export class WorkbenchPreviewRuntime {
 readonly cache=new MemoryPreviewCache();readonly worker:MarkdownWorkerRuntime;
 private configs=new Map<string,RenderConfigVersion>();private listeners=new Set<()=>void>();private taskId:string|undefined;private disposed=false;
 view:PreviewView={documentId:'',kind:'preview.flow',state:'pending'};
 constructor(sessions:DocumentSessions){
  const version=(doc:DocumentRecord)=>{const config={renderer:1,theme:doc.theme,options:doc.options,assets:doc.assets??[]};let value=this.configs.get(doc.id);if(!value){value=new RenderConfigVersion(config);this.configs.set(doc.id,value)}return value.update(config)};
  this.worker=new MarkdownWorkerRuntime(sessions,{now:()=>performance.now(),schedule:(ms,callback)=>{const timer=setTimeout(callback,ms);return()=>clearTimeout(timer)}},version,this.cache,{validateArtifact:validateRenderedPreview,changed:()=>this.refresh(),prepareDom:async(claim,artifact,signal)=>{
   validateMarkdownWorkerArtifact(claim.work.submission,artifact);
   const parse:unknown=JSON.parse(artifact.content),doc=claim.work.submission.document,kind=claim.work.submission.cacheKey.previewKind;
   const result=kind==='preview.a4'?await paginateDocument(doc,signal,{priority:claim.role}):await renderDocument(doc.markdown,doc.options.mathMode,signal,{priority:claim.role});
   if('diagnostics'in result)assertArtifact(result);
   const rendered=renderedPreviewSchema.parse({schemaVersion:1,kind,html:kind==='preview.flow'?applyDocumentAssets(result.html,doc.assets):result.html,css:'css'in result?result.css:'',total:'total'in result?result.total:0,parse});
   return {...artifact,content:JSON.stringify(rendered)};
  }});
 }
 subscribe(listener:()=>void):()=>void{this.listeners.add(listener);return()=>{this.listeners.delete(listener)}}
 private refresh():void{
  if(this.disposed)return;
  const reference=this.worker.coordinator.currentPreviewReference();
  if(reference&&reference.key.documentId===this.view.documentId&&reference.key.previewKind===this.view.kind){
   if(this.view.referenceId===reference.id&&this.view.state==='ready')return;
   const cached=this.cache.resolve(reference);if(!cached)return;
   this.view={documentId:this.view.documentId,kind:this.view.kind,state:'ready',referenceId:reference.id,rendered:renderedPreviewSchema.parse(JSON.parse(cached.artifact.content))};
  }else{const status=this.taskId?this.worker.coordinator.scheduler.status(this.taskId):undefined;if(status?.state!=='failed')return;this.view={documentId:this.view.documentId,kind:this.view.kind,state:'error',error:status.reason??'预览生成失败'}}
  for(const listener of this.listeners)listener();
 }
 activate(documentId:string,kind:PreviewCacheKey['previewKind']):void{
  const priorTaskId=this.taskId;this.view={documentId,kind,state:'pending'};this.taskId=undefined;
  const result=this.worker.activate(documentId,kind);if(result.unchanged)this.taskId=priorTaskId;if(result.foreground?.status==='accepted')this.taskId=result.foreground.taskId;
  if(result.foreground&&result.foreground.status!=='accepted'){this.view={documentId,kind,state:'error',error:'预览任务暂不可用：'+result.foreground.status}}
  this.refresh();for(const listener of this.listeners)listener();
 }
 clear():void{this.worker.coordinator.scheduler.cancelAll();this.worker.coordinator.releasePreviewReference();this.view={documentId:'',kind:'preview.flow',state:'pending'};this.taskId=undefined}
 forget(documentId:string):void{this.cache.invalidate(documentId);this.configs.delete(documentId)}
 dispose():void{this.disposed=true;this.listeners.clear();this.worker.dispose()}
}
