import {messageText,type MessageCategory} from '../../application/messages';
import {noticeStore,notifiesUser,type NoticeTone} from '../../application/notices';
import {resolveMessagePort} from './messages';

/**
 * 失败的那个出口 ✓：**一次失败 ⇒ 一次报告 ⇒ 三个去处** ✓。
 *
 * | 去处 | 拿到什么 | 谁负责 |
 * | --- | --- | --- |
 * | **用户可见的通知** | 类别 ＋ 诊断 id ＋ 一句可行动的话 | 通知面 ✓（`notices.ts` ✓） |
 * | **原生日志** | **只有类别** ✓（基座 §5.2 ✓） | 消息端口 ✓（`messages.ts` ✓） |
 * | **浏览器控制台** | 原始文本 ✓（可点的栈 ✓） | 消息端口 ✓（`messages.ts` ✓） |
 *
 * ⇒ ⇒ **一处报告，三处消费** ✓ ⇒ ⇒ 不会出现"用户看到了、日志里没有" ✓。
 *
 * **通知不是每种失败都有** ✓：表面状态与回执**不进通知面** ✓（`notifiesUser` ✓）
 * ⇒ ⇒ 错误边界的降级内容、存储恢复那条、预览那块、导入结果列表 ⇒ ⇒ 各自留在自己那儿 ✓
 * ⇒ ⇒ **同一件事不说两遍** ✓（设计 §2.1 ✓）。
 */

/** 一次失败的输入 ✓。 */
export interface FailureInput{
 /** 机器码 ✓（封闭词表里的 ✓）。 */
 category:MessageCategory;
 /** 原始文本 ✓：只进控制台 ✓，不进日志、不进用户面 ✓。 */
 detail?:string;
 /** 原始异常 ✓：控制台按它打 ✓。 */
 cause?:unknown;
 /** 给用户的那句话 ✓：不给就用这个类别自己的文案 ✓（一处事实 ✓）。 */
 message?:string;
 /** 语气 ✓：默认是失败 ✓；被挡住这类是提醒 ✓。 */
 tone?:NoticeTone;
}

/**
 * 报一次失败 ✓。
 *
 * **返回诊断 id** ✓：用户面与控制台都有它 ✓ ⇒ ⇒ 拿它对上那一条 ✓。
 */
export async function reportFailure(input:FailureInput):Promise<string>{
 const diagnosticId=noticeStore.nextDiagnosticId();
 await reportToPort(input.category,diagnosticId,input.detail,input.cause);
 if(notifiesUser(input.category)){
  noticeStore.push({
   tone:input.tone??'error',
   message:input.message??messageText(input.category),
   category:input.category,
   diagnosticId,
  });
 }
 return diagnosticId;
}

/**
 * 进日志与控制台 ✓。
 *
 * **通道自己失败不递归** ✓：失败就吞掉 ✓ ⇒ ⇒ 应用不因此崩 ✓（P-4 ✓）。
 */
async function reportToPort(category:MessageCategory,diagnosticId:string,detail?:string,cause?:unknown):Promise<void>{
 try{
  const port=await resolveMessagePort();
  await port.report({category,diagnosticId,...(detail===undefined?{}:{detail}),...(cause===undefined?{}:{cause})});
 }catch{
  // 报告通道自己失败 ⇒ 就这样 ✓：再报一次就是递归 ✓。
 }
}
