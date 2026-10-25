import {createPreviewSubmission,type PreviewSubmission,type PreviewCacheKey} from './previewIdentity';
import type {DocumentRecord} from '../../core/model/document';
import type {TaskRequest} from './contracts';
import {IdentityGate} from './identity';
import {backgroundPendingCapacity} from './dualWorkerPolicy';
import {taskBudget,estimatedBytes} from './budget';
export type WorkerRole=PreviewSubmission['role'];
export type RoleWork={kind:'preview';submission:PreviewSubmission};
export type PreviewReader=(documentId:string,previewKind:PreviewCacheKey['previewKind'])=>{document:DocumentRecord;renderConfigVersion:number}|undefined;
type Pending={id:string;role:WorkerRole;bytes:number}&({kind:'background-preview';documentId:string;previewKind:PreviewCacheKey['previewKind']}|{kind:'work';work:RoleWork});
interface Active {id:string;role:WorkerRole;bytes:number}
export interface RoleClaim {id:string;role:WorkerRole;work:RoleWork}
export interface ClaimFailure {id:string;role:WorkerRole;error:string}
export type RoleAdmission={status:'accepted';taskId:string;replaced:string[]}|{status:'inactive'|'capacity'};
export const requestOf=(work:RoleWork):TaskRequest=>({identity:{protocolVersion:1,taskId:work.submission.taskId,documentId:work.submission.document.id},kind:work.submission.cacheKey.previewKind,document:work.submission.document,cacheKey:work.submission.cacheKey});
const previewOf=(entry:Pending)=>entry.kind==='background-preview'?{documentId:entry.documentId,previewKind:entry.previewKind}:entry.work.submission.cacheKey;
let taskSequence=0;
const nextId=()=>{if(taskSequence===Number.MAX_SAFE_INTEGER)throw new Error('Task id space exhausted');return 'role-task-'+(++taskSequence)};
/** One latest foreground demand; background holds only document/mode references in FIFO order. */
export class RoleTaskQueue{
 private pending:Record<WorkerRole,Pending[]>={foreground:[],background:[]};
 private active=new Map<WorkerRole,Active>();
 constructor(private readonly gate:IdentityGate,private readonly readPreview:PreviewReader,private readonly canAllocate:(additionalBytes:number)=>boolean=()=>true){}
 private allowed(role:WorkerRole,documentId:string):boolean{return this.gate.hasSession(documentId)&&(role==='foreground'?this.gate.activeDocumentId===documentId:this.gate.activeDocumentId!==documentId)}
 private prune():void{
  for(const role of ['foreground','background'] as const)this.pending[role]=this.pending[role].filter(entry=>{const preview=previewOf(entry);return this.gate.current(preview.documentId,preview.previewKind,entry.id)});
 }
 enqueuePreview(input:PreviewSubmission):RoleAdmission{
  this.prune();const role=input.role,documentId=input.document.id,previewKind=input.cacheKey.previewKind;
  if(!this.allowed(role,documentId))return {status:'inactive'};
  const list=this.pending[role];
  const previous=role==='foreground'?list[0]:list.find(entry=>{const key=previewOf(entry);return key.documentId===documentId&&key.previewKind===previewKind});
  if(!previous&&role==='background'&&list.length>=backgroundPendingCapacity(this.gate.sessionCount))return {status:'capacity'};
  let entry:Pending;
  if(role==='background')entry={kind:'background-preview',id:'',role,bytes:0,documentId,previewKind};
  else{
   if(new TextEncoder().encode(input.document.markdown).byteLength>taskBudget.input.markdownUtf8Bytes)throw new Error('Markdown UTF-8 budget exceeded');
   entry={kind:'work',id:'',role,bytes:0,work:{kind:'preview',submission:structuredClone(input)}};
  }
  entry.bytes=estimatedBytes(entry);
  if(!this.canAllocate(entry.bytes-(previous?.bytes??0)))return {status:'capacity'};
  entry.id=nextId();if(entry.kind==='work')entry.work.submission.taskId=entry.id;
  this.gate.expect(documentId,previewKind,entry.id);
  if(previous)list[list.indexOf(previous)]=entry;else list.push(entry);
  return {status:'accepted',taskId:entry.id,replaced:previous?[previous.id]:[]};
 }
 /** The active slot remains held until execution and cleanup have stopped. */
 claim(role:WorkerRole):RoleClaim|ClaimFailure|undefined{
  if(this.active.has(role))return;this.prune();const list=this.pending[role];
  for(;;){
   const entry=list.shift();if(!entry)return;
   const preview=previewOf(entry);if(!this.allowed(role,preview.documentId))continue;
   try{
    let work:RoleWork;
    if(entry.kind==='background-preview'){
     const source=this.readPreview(entry.documentId,entry.previewKind);
     if(!source||source.document.id!==entry.documentId)throw new Error('Preview source unavailable or mismatched');
     work={kind:'preview',submission:createPreviewSubmission({taskId:entry.id,role,previewKind:entry.previewKind,document:source.document,renderConfigVersion:source.renderConfigVersion})};
    }else work=entry.work;
    const request=requestOf(work);
    if(new TextEncoder().encode(request.document.markdown).byteLength>taskBudget.input.markdownUtf8Bytes)throw new Error('Markdown UTF-8 budget exceeded');
    const bytes=estimatedBytes(work);if(!this.canAllocate(bytes))throw new Error('Task dispatch budget exceeded');
    this.active.set(role,{id:entry.id,role,bytes});return {id:entry.id,role,work};
   }catch(error){return {id:entry.id,role,error:String(error)}}
  }
 }
 release(role:WorkerRole,id:string):boolean{if(this.active.get(role)?.id!==id)return false;this.active.delete(role);return true}
 cancelPending(id:string):boolean{
  for(const role of ['foreground','background'] as const){const index=this.pending[role].findIndex(entry=>entry.id===id);if(index>=0){this.pending[role].splice(index,1);return true}}return false;
 }
 get ownedBytes():number{return [...this.pending.foreground,...this.pending.background,...this.active.values()].reduce((sum,entry)=>sum+entry.bytes,0)}
 snapshot(){this.prune();return {pending:structuredClone(this.pending),active:[...this.active.values()].map(({id,role})=>({id,role})),ownedBytes:this.ownedBytes}}
}
