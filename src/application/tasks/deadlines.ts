import type {TaskClock,TaskKind,TaskStage} from './contracts';
import {taskBudget,totalDeadline} from './budget';
export type DeadlineReason='total'|'stage'|'cancelGrace';
const order:readonly TaskStage[]=['accepted','snapshot','parse','resources','generation','validation','layout','packaging'];
/** One live timer per running role, including its stop grace; never a queue/platform timer. */
export class TaskDeadlines{
 private timer:(()=>void)|undefined;private disposed=false;
 private readonly total:number;private stageDeadline=Infinity;private cancelDeadline=Infinity;
 private currentStage:TaskStage='accepted';private lastNow:number;
 constructor(private readonly clock:TaskClock,kind:TaskKind,private readonly expire:(reason:DeadlineReason)=>void){
  this.lastNow=clock.now();if(!Number.isFinite(this.lastNow))throw new Error('Invalid monotonic clock');
  this.total=this.lastNow+totalDeadline(kind);this.arm();
 }
 private now():number{const now=this.clock.now();if(!Number.isFinite(now)||now<this.lastNow)throw new Error('Clock moved backwards');this.lastNow=now;return now}
 private next():{at:number;reason:DeadlineReason}{
  if(Number.isFinite(this.cancelDeadline))return {at:this.cancelDeadline,reason:'cancelGrace'};
  return this.stageDeadline<this.total?{at:this.stageDeadline,reason:'stage'}:{at:this.total,reason:'total'};
 }
 private arm():void{this.timer?.();this.timer=undefined;if(this.disposed)return;const next=this.next();this.timer=this.clock.schedule(Math.max(0,next.at-this.now()),()=>this.check())}
 check():boolean{if(this.disposed)return false;const next=this.next();if(this.now()>=next.at){this.dispose();this.expire(next.reason);return true}return false}
 start():void{this.enter('snapshot')}
 enter(stage:TaskStage):void{
  if(this.disposed||this.check())return;
  const current=order.indexOf(this.currentStage),target=order.indexOf(stage);
  if(target<0||target<current)throw new Error('Invalid or backwards execution stage');
  if(target===current||Number.isFinite(this.cancelDeadline))return;
  this.currentStage=stage;this.stageDeadline=this.now()+(stage==='resources'?taskBudget.deadlinesMs.assetFetch:stage==='layout'?taskBudget.deadlinesMs.paginationStage:taskBudget.deadlinesMs.engineStage);this.arm();
 }
 requestCancel():void{if(this.disposed||Number.isFinite(this.cancelDeadline))return;this.cancelDeadline=this.now()+taskBudget.deadlinesMs.cancelGrace;this.arm()}
 dispose():void{this.disposed=true;this.timer?.();this.timer=undefined}
}
