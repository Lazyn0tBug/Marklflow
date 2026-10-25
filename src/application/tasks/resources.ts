import {taskBudget} from './budget';
export type ResourceGroup='inFlight'|'activeArtifact'|'cache'|'session';
export interface ResourceOwner {kind:'task'|'executor'|'artifact'|'view'|'delivery'|'session'|'cache';id:string}
export interface ResourceSpec {
 id:string;kind:'snapshot'|'bytes'|'buffer'|'host'|'url'|'listener'|'timer'|'port'|'artifact';
 owner:ResourceOwner;group:ResourceGroup;bytes:number;
 taskId:string;snapshotId:string;documentId:string;sessionGeneration:number;executorGeneration:number;
}
interface Entry {spec:ResourceSpec;cleanup:()=>void|Promise<void>;references:number;releasing:Promise<void>|undefined;error:string|undefined}
const limits:Record<ResourceGroup,number>={inFlight:taskBudget.memory.inFlightBytes,activeArtifact:taskBudget.memory.activeArtifactBytes,cache:taskBudget.memory.retainedCacheBytes,session:taskBudget.memory.sessionBytes};
const sameOwner=(a:ResourceOwner,b:ResourceOwner)=>a.kind===b.kind&&a.id===b.id;
/** One registered allocation = one byte owner. Leases add references, never byte counts. */
export class ResourceLedger{
 private entries=new Map<string,Entry>();
 private check(bytes:number,group:ResourceGroup,exclude?:string):void{
  if(!Number.isSafeInteger(bytes)||bytes<0)throw new Error('Invalid resource byte estimate');
  let total=bytes,subtotal=bytes;
  for(const [id,entry]of this.entries)if(id!==exclude){total+=entry.spec.bytes;if(entry.spec.group===group)subtotal+=entry.spec.bytes}
  if(total>taskBudget.memory.totalOwnedBytes||subtotal>limits[group])throw new Error('Resource budget exceeded: '+group);
 }
 register(spec:ResourceSpec,cleanup:()=>void|Promise<void>):void{
  if(!spec.id||this.entries.has(spec.id))throw new Error('Resource already registered or missing id');
  this.check(spec.bytes,spec.group);
  this.entries.set(spec.id,{spec:{...spec,owner:{...spec.owner}},cleanup,references:0,releasing:undefined,error:undefined});
 }
 acquire(id:string):()=>void{
  const entry=this.findResource(id);if(entry.releasing)throw new Error('Resource is releasing');entry.references++;
  let released=false;return()=>{if(!released){released=true;entry.references--}};
 }
 transfer(id:string,from:ResourceOwner,to:ResourceOwner,group:ResourceGroup):void{
  const entry=this.findResource(id);if(entry.releasing||!sameOwner(entry.spec.owner,from))throw new Error('Resource ownership mismatch');
  this.check(entry.spec.bytes,group,id);entry.spec={...entry.spec,owner:{...to},group};
 }
 async release(id:string,owner:ResourceOwner):Promise<void>{
  const entry=this.entries.get(id);if(!entry)return;
  if(!sameOwner(entry.spec.owner,owner))throw new Error('Resource ownership mismatch');
  if(entry.releasing)return entry.releasing;
  if(entry.references)throw new Error('Resource still leased');
  const work=Promise.resolve().then(()=>entry.cleanup()).then(()=>{this.entries.delete(id)},error=>{entry.error=String(error);throw error}).finally(()=>{entry.releasing=undefined});
  entry.releasing=work;return work;
 }
 async releaseOwner(owner:ResourceOwner):Promise<string[]>{
  const ids=[...this.entries].filter(([,entry])=>sameOwner(entry.spec.owner,owner)).map(([id])=>id);
  const results=await Promise.allSettled(ids.map(id=>this.release(id,owner)));
  return results.flatMap((result,index)=>result.status==='rejected'?[ids[index]+': '+String(result.reason)]:[]);
 }
 private findResource(id:string):Entry{const entry=this.entries.get(id);if(!entry)throw new Error('Unknown resource: '+id);return entry}
 snapshot(){return [...this.entries.values()].map(entry=>({...entry.spec,owner:{...entry.spec.owner},references:entry.references,releasing:!!entry.releasing,error:entry.error}))}
 get totalBytes(){return [...this.entries.values()].reduce((sum,entry)=>sum+entry.spec.bytes,0)}
}
