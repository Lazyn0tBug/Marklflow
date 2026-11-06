import type {MessageCategory, MessagePort, ProblemReport} from './messages';

/**
 * 捕获与分类：未捕获的错误怎么变成**一份报告** ✓。
 *
 * **一份策略，三处捕获** ✓：React 的根选项（渲染期 ✓）、`window.onerror`（脚本 ✓）、
 * `unhandledrejection`（拒绝 ✓）⇒ ⇒ 三处都走这里 ⇒ ⇒ 去重与限流只有一处事实 ✓。
 *
 * **去重的键是来源，不是实例** ✓（设计 §2.3 ✓）：一个渲染循环会产生**很多**错误对象 ✓
 * ⇒ ⇒ 按实例去重就会刷屏 ✓ ⇒ ⇒ 键 =（类别，来源）✓ ⇒ ⇒ 同一个问题只报一次 ✓（P-3 ✓）。
 * ⇒ ⇒ 来源要**能认出"同一个问题"** ✓：渲染期用组件栈的头一帧 ✓、脚本用
 * `文件:行` ✓、拒绝用异常的类型与消息 ✓ ⇒ ⇒ 同一个抛出点每次都一样 ✓ ⇒ ⇒ 循环收敛 ✓
 * ⇒ ⇒ 而**不同的**抛出点仍然各报各的 ✓ ⇒ ⇒ 一次渲染崩两处不会只看见一处 ✓。
 *
 * **同一个错误对象只报一次** ✓：一个逃出 React 树的错误会**同时**触发 React 的根选项
 * 与 `window.onerror` ✓ ⇒ ⇒ 报两次 ⇒ ⇒ 已报过的对象（`WeakSet` ✓）跳过 ✓（设计 §3.2 ✓）。
 *
 * **通道自己失败不再报告自己** ✓：端口的失败被吞掉 ✓ ⇒ 应用不因此崩 ✓（P-4 ✓）
 * ⇒ ⇒ 也不递归 ✓。
 */

/** 端口的来源：延迟解析 ✓ ⇒ ⇒ 报告不必等端口就绪 ✓ ⇒ ⇒ 首屏不被端口拖住 ✓。 */
export type MessagePortProvider=()=>Promise<MessagePort>;

/** 捕获的可选项。 */
export interface CaptureOptions{
 /**
  * 应用侧每秒最多报多少条 ✓。
  *
  * **两层限流** ✓（设计 §2.3 ✓）：应用侧先限 ⇒ 基座再限（20/100 每秒 ✓）
  * ⇒ ⇒ 应用侧这道是为了**不浪费基座的额度** ✓ ⇒ ⇒ 突发的一堆问题只留下头几条 ✓。
  */
 maxPerSecond?:number;
}

/** 默认的应用侧限流 ✓：够一次真实故障全报出来 ✓，又不至于刷屏 ✓。 */
export const DEFAULT_MAX_PER_SECOND=5;

/** 原始异常 → 原始文本 ✓：只进控制台 ✓（基座 §5.2 ✓）。 */
export function describeError(error:unknown):string{
 if(error instanceof Error)return error.stack??`${error.name}: ${error.message}`;
 if(typeof error==='string')return error;
 try{return JSON.stringify(error)??String(error);}catch{return String(error);}
}

/**
 * 捕获器：把一次捕获变成一份报告 ✓。
 *
 * **它不碰任何浏览器接口** ✓ ⇒ ⇒ 那一层在平台侧 ✓ ⇒ ⇒ 这份策略可以单测 ✓。
 */
export class ErrorCapture{
 private readonly port:MessagePortProvider;
 private readonly maxPerSecond:number;
 /** 已经报过的问题 ✓：键 =（类别，来源）✓。 */
 private readonly seen=new Set<string>();
 /** 已经报过的错误对象 ✓：同一个对象只报一次 ✓。 */
 private readonly reported=new WeakSet<object>();
 private windowStart=0;
 private windowCount=0;
 private resolved?:Promise<MessagePort>;

 constructor(port:MessagePortProvider,options:CaptureOptions={}){
  this.port=port;
  this.maxPerSecond=options.maxPerSecond??DEFAULT_MAX_PER_SECOND;
 }

 /**
  * 报一次 ✓。
  *
  * **返回有没有真的报出去** ✓：调用方据此知道"这条被去重/限流挡掉了" ✓
  * ⇒ ⇒ 断言可以落在"报了几条"上 ✓ ⇒ ⇒ 而不是落在"调用了几次"上 ✓。
  */
 async report(category:MessageCategory,error:unknown,source:string):Promise<boolean>{
  const key=typeof error==='object'&&error!==null?error:undefined;
  // 同一个错误对象已经报过了 ⇒ 跳过 ✓（React 的根选项与 window 会各来一次 ✓）。
  if(key&&this.reported.has(key))return false;
  // 同一个问题 ⇒ 跳过 ✓（渲染循环不刷屏 ✓）。
  if(this.seen.has(`${category}:${source}`))return false;
  // 应用侧限流 ✓。
  if(!this.allow())return false;
  this.seen.add(`${category}:${source}`);
  if(key)this.reported.add(key);
  await this.deliver({category,detail:describeError(error),cause:error});
  return true;
 }

 /** 端口的失败被吞掉 ✓：应用不因此崩 ✓，也不递归报告自己 ✓（P-4 ✓）。 */
 private async deliver(report:ProblemReport):Promise<void>{
  try{
   const port=await this.resolve();
   await port.report(report);
  }catch{
   // 报告通道自己失败 ⇒ 就这样 ✓：再报一次就是递归 ✓（基座 §4 同一条 ✓）。
  }
 }

 /** 端口只解析一次 ✓。 */
 private resolve():Promise<MessagePort>{
  this.resolved??=this.port();
  return this.resolved;
 }

 /** 每秒固定窗口 ✓（与基座同一种窗口 ✓）。 */
 private allow():boolean{
  const now=Date.now();
  if(now-this.windowStart>=1000){this.windowStart=now;this.windowCount=0;}
  if(this.windowCount>=this.maxPerSecond)return false;
  this.windowCount+=1;
  return true;
 }
}
