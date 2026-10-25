import type {ExecutionResources} from './contracts';
interface Entry {id:string;kind:Parameters<ExecutionResources['register']>[1];bytes:number;cleanup:()=>void|Promise<void>;error:string|undefined}
/** Owned by one running task. No groups, owners, transfers or shared leases. */
export class CleanupList implements ExecutionResources{
 private entries:Entry[]=[];private closed=false;private disposing:Promise<string[]>|undefined;
 register(id:string,kind:Entry['kind'],bytes:number,cleanup:()=>void|Promise<void>):void{
  if(this.closed)throw new Error('Cleanup list already closed');
  if(!id||this.entries.some(entry=>entry.id===id))throw new Error('Duplicate or missing cleanup id');
  if(!Number.isSafeInteger(bytes)||bytes<0)throw new Error('Invalid resource byte estimate');
  this.entries.push({id,kind,bytes,cleanup,error:undefined});
 }
 dispose():Promise<string[]>{
  if(this.disposing)return this.disposing;this.closed=true;
  const entries=this.entries;
  this.disposing=Promise.allSettled(entries.map(entry=>Promise.resolve().then(()=>entry.cleanup()))).then(results=>{
   this.entries=entries.filter((entry,index)=>{const result=results[index]!;if(result.status==='rejected'){entry.error=String(result.reason);return true}return false});
   return this.entries.map(entry=>entry.id+': '+entry.error);
  }).finally(()=>{this.disposing=undefined});return this.disposing;
 }
 get totalBytes():number{return this.entries.reduce((sum,entry)=>sum+entry.bytes,0)}
 snapshot(){return this.entries.map(({id,kind,bytes,error})=>({id,kind,bytes,error}))}
}
