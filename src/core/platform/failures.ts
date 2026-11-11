import {messageText, type MessageCategory} from '../../application/messages';
import {noticeStore, notifiesUser, type NoticeTone} from '../../application/notices';
import {ourFrame} from './callsite';
import {resolveMessagePort} from './messages';

/**
 * 失败的那个出口 ✓：**一次失败 ⇒ 一次报告 ⇒ 三个去处** ✓。
 *
 * | 去处 | 拿到什么 | 谁负责 |
 * | --- | --- | --- |
 * | **用户可见的通知** | 类别 ＋ 诊断 id ＋ 一句可行动的话 | 通知面 ✓（`notices.ts` ✓） |
 * | **原生日志** | 类别 ＋ 定位串 ✓（**不含原文** ✓，基座 §5.2 ✓） | 消息端口 ✓（`messages.ts` ✓） |
 * | **浏览器控制台** | 原始文本 ✓（可点的栈 ✓） | 消息端口 ✓（`messages.ts` ✓） |
 *
 * ⇒ ⇒ **一处报告，三处消费** ✓ ⇒ ⇒ 不会出现"用户看到了、日志里没有" ✓。
 *
 * **通知不是每种失败都有** ✓：表面状态与回执**不进通知面** ✓（`notifiesUser` ✓）
 * ⇒ ⇒ 错误边界的降级内容、存储恢复那条、预览那块、导入结果列表 ⇒ ⇒ 各自留在自己那儿 ✓
 * ⇒ ⇒ **同一件事不说两遍** ✓（设计 §2.1 ✓）。
 */

/** 一次失败的输入 ✓。 */
export interface FailureInput {
  /** 机器码 ✓（封闭词表里的 ✓）。 */
  category: MessageCategory;
  /** 原始文本 ✓：只进控制台 ✓，不进日志、不进用户面 ✓。 */
  detail?: string;
  /** 原始异常 ✓：控制台按它打 ✓。 */
  cause?: unknown;
  /**
   * **定位串** ✓：**那个问题出在哪儿** ✓ ⇒ ⇒ 日志能指出是哪儿 ✓ ⇒ ⇒
   * **不含用户数据** ✓（基座 §5.2 ✓）⇒ ⇒ 可以进日志 ✓。
   *
   * **它不能在这一层被丢掉** ✓：上一次它就是在这一层丢的 ✓ ⇒ ⇒
   * 捕获器算出来的定位串到不了日志 ⇒ ⇒ 日志只说"出了个拒绝" ✓ ⇒ ⇒
   * 每次都得开控制台找那一行 ✓ ⇒ ⇒ 白跑一趟 ✓。
   */
  source?: string;
  /** 给用户的那句话 ✓：不给就用这个类别自己的文案 ✓（一处事实 ✓）。 */
  message?: string;
  /** 语气 ✓：默认是失败 ✓；被挡住这类是提醒 ✓。 */
  tone?: NoticeTone;
}

/**
 * 报一次失败 ✓。
 *
 * **返回诊断 id** ✓：用户面与控制台都有它 ✓ ⇒ ⇒ 拿它对上那一条 ✓。
 */
export async function reportFailure(input: FailureInput): Promise<string> {
  const diagnosticId = noticeStore.nextDiagnosticId();
  // **调用点没给定位串 ⇒ ⇒ 这一层替它补上** ✓ ⇒ ⇒ 位置由发射点自己带 ✓ ⇒ ⇒
  // 不用给每个调用点手写 ✓ ⇒ ⇒ 也就不会"漏填一个就没有定位" ✓ ⇒ ⇒
  // 日志因此能指出**在我们代码的哪一处** ✓（基座 §5.2 ✓）。
  const source = input.source ?? ourFrame(new Error().stack, 1);
  void reportToPort(source === undefined ? input : {...input, source}, diagnosticId);
  if (notifiesUser(input.category)) {
    noticeStore.push({
      tone: input.tone ?? 'error',
      message: input.message ?? messageText(input.category),
      category: input.category,
      diagnosticId,
    });
  }
  return diagnosticId;
}

/**
 * 进日志与控制台 ✓。
 *
 * **整个输入一起传** ✓ ⇒ ⇒ 输入里新加的字段**自动跟着走** ✓ ⇒ ⇒
 * 不会再有"类型里加了、转发时忘了"这种事 ✓ ⇒ ⇒ 上一次丢的就是定位串 ✓。
 *
 * **通道自己失败不递归** ✓：失败就吞掉 ✓ ⇒ ⇒ 应用不因此崩 ✓（P-4 ✓）。
 */
async function reportToPort(input: FailureInput, diagnosticId: string): Promise<void> {
  try {
    const port = await resolveMessagePort();
    await port.report({
      category: input.category,
      diagnosticId,
      ...(input.detail === undefined ? {} : {detail: input.detail}),
      ...(input.cause === undefined ? {} : {cause: input.cause}),
      ...(input.source === undefined ? {} : {source: input.source}),
    });
  } catch {
    // 报告通道自己失败 ⇒ 就这样 ✓：再报一次就是递归 ✓。
  }
}
