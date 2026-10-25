import type {TaskClock,TaskKind,TaskStage} from './contracts';
import {taskBudget,totalDeadline} from './budget';
export type DeadlineReason='total'|'stage'|'cancelGrace'|'platformWait';
const order:readonly TaskStage[]=['accepted','snapshot','parse','resources','generation','validation','layout','packaging','artifactReady','delivering','completed'];
/** Fixed monotonic deadlines; progress and repeated stage announcements never extend them. */
export class TaskDeadlines{
 private stopTimer:(()=>void)|undefined;private disposed=false;
 private total:number;private stageDeadline=Infinity;private cancelDeadline=Infinity;
 private platformDeadline=Infinity;private currentStage:TaskStage='accepted';private lastNow:number;
 constructor(private readonly clock:TaskClock,kind:TaskKind,private readonly expire:(reason:DeadlineReason)=>void,acceptedAt=clock.now()){
  this.lastNow=clock.now();if(!Number.isFinite(this.lastNow))throw new Error('Invalid monotonic clock');
  if(!Number.isFinite(acceptedAt)||acceptedAt>this.lastNow)throw new Error('Invalid task acceptance time');
  this.total=acceptedAt+totalDeadline(kind);this.arm();
 }
 private now():number{const now=this.clock.now();if(!Number.isFinite(now)||now<this.lastNow)throw new Error('Clock moved backwards');this.lastNow=now;return now}
 private next():{at:number;reason:DeadlineReason}{
  return [{at:this.total,reason:'total' as const},{at:this.stageDeadline,reason:'stage' as const},{at:this.cancelDeadline,reason:'cancelGrace' as const},{at:this.platformDeadline,reason:'platformWait' as const}].sort((a,b)=>a.at-b.at)[0]!;
 }
 private arm():void{this.stopTimer?.();if(this.disposed)return;const next=this.next();if(Number.isFinite(next.at))this.stopTimer=this.clock.schedule(Math.max(0,next.at-this.now()),()=>{this.check()})}
 check():boolean{if(this.disposed)return false;const next=this.next();if(this.now()>=next.at){this.dispose();this.expire(next.reason);return true}return false}
 start():void{if(this.disposed)return;this.enter('snapshot')}
 enter(stage:TaskStage):void{
  if(this.disposed||this.check())return;
  const current=order.indexOf(this.currentStage),target=order.indexOf(stage);if(target<current)throw new Error('Task stage moved backwards');if(target===current)return;
  this.currentStage=stage;
  if(stage==='artifactReady'||stage==='delivering'){
   if(!Number.isFinite(this.platformDeadline))this.platformDeadline=this.now()+taskBudget.deadlinesMs.platformDialogWait;
   this.total=Infinity;this.stageDeadline=Infinity;
  }else this.stageDeadline=this.now()+(stage==='resources'?taskBudget.deadlinesMs.assetFetch:stage==='layout'?taskBudget.deadlinesMs.paginationStage:taskBudget.deadlinesMs.engineStage);
  this.arm();
 }
 validation():void{if(this.disposed||this.check())return;this.stageDeadline=Math.min(this.stageDeadline,this.now()+taskBudget.deadlinesMs.engineStage);this.arm()}
 requestCancel():void{if(this.disposed)return;if(!Number.isFinite(this.cancelDeadline))this.cancelDeadline=this.now()+taskBudget.deadlinesMs.cancelGrace;this.arm()}
 dispose():void{this.disposed=true;this.stopTimer?.();this.stopTimer=undefined}
}
