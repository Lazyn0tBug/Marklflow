import {isPreview,sameIdentity,type TaskIdentity,type TaskRequest} from './contracts';
import {taskBudget} from './budget';
export interface RestoreIdentity {restoreRequestId:number;task:TaskIdentity;kind:TaskRequest['kind']}
/** Session tokens only; editor state, tabs and cache implementations remain outside A2. */
export class IdentityGate{
 private sessions=new Map<string,number>();private sequence=0;private epoch=0;private active:string|undefined;
 private expected=new Map<TaskRequest['kind'],TaskIdentity>();private restore=0;private authorizationFloor=0;
 open(documentId:string):number{
  const current=this.sessions.get(documentId);if(current!==undefined)return current;
  if(this.sessions.size>=taskBudget.memory.sessions)throw new Error('Session capacity exceeded');
  const generation=++this.sequence;this.sessions.set(documentId,generation);return generation;
 }
 activate(documentId:string):{sessionGeneration:number;activationEpoch:number}{
  const generation=this.sessions.get(documentId);if(generation===undefined)throw new Error('Unknown document session');
  this.active=documentId;this.epoch++;this.expected.clear();this.restore++;
  return {sessionGeneration:generation,activationEpoch:this.epoch};
 }
 close(documentId:string):void{this.sessions.delete(documentId);if(this.active===documentId){this.active=undefined;this.epoch++;this.expected.clear();this.restore++}}
 sessionMatches(request:TaskRequest):boolean{return this.sessions.get(request.identity.documentId)===request.identity.sessionGeneration}
 activeMatches(request:TaskRequest):boolean{return this.sessionMatches(request)&&this.active===request.identity.documentId&&this.epoch===request.identity.activationEpoch}
 authorized(request:TaskRequest):boolean{return request.authorization.revision>=this.authorizationFloor}
 revokeBefore(revision:number):void{if(!Number.isSafeInteger(revision)||revision<this.authorizationFloor)throw new Error('Authorization revision must advance');this.authorizationFloor=revision;this.restore++}
 expect(request:TaskRequest):void{
  if(!isPreview(request.kind)||!this.activeMatches(request)||!this.authorized(request))throw new Error('Inactive or unauthorized preview');
  this.expected.set(request.kind,{...request.identity});this.restore++;
 }
 current(request:TaskRequest):boolean{const expected=this.expected.get(request.kind);return this.authorized(request)&&this.activeMatches(request)&&!!expected&&sameIdentity(expected,request.identity)}
 beginRestore(request:TaskRequest):RestoreIdentity{if(!this.current(request))throw new Error('Stale restore');return {restoreRequestId:++this.restore,task:{...request.identity},kind:request.kind}}
 restoreCurrent(token:RestoreIdentity):boolean{const expected=this.expected.get(token.kind);return token.restoreRequestId===this.restore&&this.active===token.task.documentId&&this.sessions.get(token.task.documentId)===token.task.sessionGeneration&&this.epoch===token.task.activationEpoch&&token.task.authorizationRevision>=this.authorizationFloor&&!!expected&&sameIdentity(token.task,expected)}
 get activeDocumentId(){return this.active}
}
