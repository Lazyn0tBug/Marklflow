import {taskBudget} from './budget';
/** Open-document admission and current preview task IDs; editor sessions arrive in U3. */
export class IdentityGate{
 private sessions=new Set<string>();private active:string|undefined;
 private expected=new Map<string,Map<string,string>>();
 open(documentId:string):void{
  if(!documentId||documentId.length>256)throw new Error('Invalid document id');
  if(this.sessions.has(documentId))return;
  if(this.sessions.size>=taskBudget.memory.sessions)throw new Error('Session capacity exceeded');
  this.sessions.add(documentId);
 }
 activate(documentId:string):void{if(!this.sessions.has(documentId))throw new Error('Unknown document session');this.active=documentId}
 close(documentId:string):void{this.sessions.delete(documentId);this.expected.delete(documentId);if(this.active===documentId)this.active=undefined}
 hasSession(documentId:string):boolean{return this.sessions.has(documentId)}
 expect(documentId:string,kind:string,taskId:string):void{
  if(!this.hasSession(documentId))throw new Error('Unknown document session');
  let kinds=this.expected.get(documentId);if(!kinds){kinds=new Map();this.expected.set(documentId,kinds)}kinds.set(kind,taskId);
 }
 current(documentId:string,kind:string,taskId:string):boolean{return this.hasSession(documentId)&&this.expected.get(documentId)?.get(kind)===taskId}
 get sessionCount():number{return this.sessions.size}
 get activeDocumentId(){return this.active}
}
