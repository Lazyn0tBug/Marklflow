import {artifactSchema,type TaskArtifact} from '../tasks/contracts';
import {previewCacheKeySchema,samePreviewCacheKey,type PreviewCacheKey} from '../tasks/previewIdentity';
import {taskBudget,estimatedBytes} from '../tasks/budget';
import type {PreviewReference} from './contracts';
export interface CacheLimits {entries:number;entryBytes:number;totalBytes:number}
interface Entry {reference:PreviewReference;artifact:TaskArtifact;bytes:number;valid:boolean}
export type CachedArtifact=Readonly<{reference:PreviewReference;artifact:DeepReadonly<TaskArtifact>}>;
type DeepReadonly<T>=T extends object?{readonly [K in keyof T]:DeepReadonly<T[K]>}:T;
function freeze<T>(value:T):T{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value)}return value}
let sequence=0;
/** Owns serializable complete candidates only. No DOM, resources, persistence or task lifecycle. */
export class MemoryPreviewCache {
 private entries=new Map<string,Entry>();private active:string|undefined;private readonly limits:CacheLimits;
 constructor(limits:Partial<CacheLimits>={}){
  this.limits={entries:taskBudget.memory.cacheEntries,entryBytes:taskBudget.memory.singleCacheEntryBytes,totalBytes:taskBudget.memory.retainedCacheBytes,...limits};
  if(Object.values(this.limits).some(value=>!Number.isSafeInteger(value)||value<0))throw new Error('Invalid cache limits');
 }
 private touch(entry:Entry):void{this.entries.delete(entry.reference.id);this.entries.set(entry.reference.id,entry)}
 lookup(key:Readonly<PreviewCacheKey>):PreviewReference|undefined {
  const parsed=previewCacheKeySchema.parse(key),entry=[...this.entries.values()].find(e=>e.valid&&samePreviewCacheKey(e.reference.key,parsed));
  if(!entry)return;this.touch(entry);return entry.reference;
 }
 resolve(reference:PreviewReference):CachedArtifact|undefined {
  const entry=this.entries.get(reference.id);if(!entry?.valid||!samePreviewCacheKey(entry.reference.key,reference.key))return;
  this.touch(entry);return Object.freeze({reference:entry.reference,artifact:entry.artifact});
 }
 /** Caller supplies a complete candidate; semantic/render-policy validation belongs to U4b. */
 put(key:Readonly<PreviewCacheKey>,artifact:TaskArtifact):PreviewReference|undefined {
  const parsed=previewCacheKeySchema.parse(key),owned=artifactSchema.parse(artifact);
  const existing=this.lookup(parsed);if(existing)return existing;
  if(sequence===Number.MAX_SAFE_INTEGER)throw new Error('Cache reference space exhausted');
  const reference=freeze({id:'preview-cache-'+(++sequence),key:parsed}),bytes=estimatedBytes({reference,artifact:owned});
  if(!this.limits.entries||bytes>this.limits.entryBytes||bytes>this.limits.totalBytes)return;
  let count=this.entries.size+1,total=this.stats().estimatedBytes+bytes;const victims:string[]=[];
  for(const entry of this.entries.values()){
   if(count<=this.limits.entries&&total<=this.limits.totalBytes)break;
   if(entry.reference.id===this.active)continue;victims.push(entry.reference.id);count--;total-=entry.bytes;
  }
  if(count>this.limits.entries||total>this.limits.totalBytes)return;
  for(const id of victims)this.entries.delete(id);
  this.entries.set(reference.id,{reference,artifact:freeze(owned),bytes,valid:true});return reference;
 }
 /** One active preview pointer, not a lease registry. Invalid active bytes stay counted until release. */
 setActive(reference:PreviewReference|undefined):void {
  if(reference&&!this.resolve(reference))throw new Error('Cache reference expired');
  const previous=this.active;this.active=reference?.id;
  if(previous!==this.active&&previous&&!this.entries.get(previous)?.valid)this.entries.delete(previous);
 }
 invalidate(documentId?:string,previewKind?:PreviewCacheKey['previewKind']):void {
  for(const [id,entry]of this.entries)if((documentId===undefined||entry.reference.key.documentId===documentId)&&(previewKind===undefined||entry.reference.key.previewKind===previewKind)){
   if(id===this.active)entry.valid=false;else this.entries.delete(id);
  }
 }
 evict(reference:PreviewReference):boolean {
  const entry=this.entries.get(reference.id);if(!entry||reference.id===this.active||!samePreviewCacheKey(entry.reference.key,reference.key))return false;
  return this.entries.delete(reference.id);
 }
 stats(){return {entries:this.entries.size,validEntries:[...this.entries.values()].filter(e=>e.valid).length,estimatedBytes:[...this.entries.values()].reduce((sum,e)=>sum+e.bytes,0),activeReferenceId:this.active}}
}
