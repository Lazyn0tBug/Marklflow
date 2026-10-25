export type TaskState='queued'|'running'|'validating'|'publishing'|'cancelRequested'|'succeeded'|'failed'|'cancelled'|'superseded'|'timedOut';
export type TerminalState=Extract<TaskState,'succeeded'|'failed'|'cancelled'|'superseded'|'timedOut'>;
const terminal=new Set<TaskState>(['succeeded','failed','cancelled','superseded','timedOut']);
const next:Record<Exclude<TaskState,TerminalState>,readonly TaskState[]>={
 queued:['running','cancelled','superseded','timedOut','failed'],
 running:['validating','cancelRequested','superseded','timedOut','failed'],
 validating:['publishing','succeeded','cancelRequested','superseded','timedOut','failed'],
 publishing:['succeeded','failed'],
 cancelRequested:['cancelled','timedOut','failed'],
};
export function isTerminal(state:TaskState):state is TerminalState{return terminal.has(state)}
export class TaskLifecycle{
 private value:TaskState='queued';
 private transitions:TaskState[]=['queued'];
 get state():TaskState{return this.value}
 readState():TaskState{return this.value}
 get history():readonly TaskState[]{return [...this.transitions]}
 move(state:TaskState):boolean{
  if(isTerminal(this.value))return false;
  if(!next[this.value].includes(state))throw new Error('Invalid task transition: '+this.value+' -> '+state);
  this.value=state;this.transitions.push(state);return true;
 }
}
