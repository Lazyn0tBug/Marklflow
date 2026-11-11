import {ErrorCapture} from '../../../application/capture';
import type {MessageCategory, WebEvent} from '../../../application/messages';
import {ourFrame} from '../callsite';
import {reportFailure} from '../failures';
import {resolveMessagePort} from '../messages';

/**
 * 捕获的接线：浏览器的三个捕获点 ⇒ 一份策略 ⇒ **失败的那个出口** ✓。
 *
 * **这一层只碰浏览器接口** ✓ ⇒ ⇒ 策略（去重、限流、分类的细则 ✓）在应用层 ✓
 * ⇒ ⇒ 那一层可以单测 ✓ ⇒ ⇒ 这一层只管"把信号接上" ✓。
 *
 * **一个捕获器实例，全局一份** ✓：错误捕获是**兜底** ⇒ ⇒ 任何模块遇到问题都能报 ✓
 * ⇒ ⇒ 不用把捕获器一路传下去 ✓ ⇒ ⇒ 少一处 threading ✓ ⇒ ⇒ 也少一处"忘了传" ✓。
 */

/** 捕获器：报告走**失败的那个出口** ✓ ⇒ ⇒ 通知、日志、控制台一次到位 ✓。 */
const capture = new ErrorCapture(async (report) => {
  await reportFailure(report);
});

/**
 * 工作台起来过吗 ✓。
 *
 * **为什么要有这个信号** ✓：错误边界分不出"起不来"还是"这一部分" ✓ ⇒ ⇒
 * 因为 React 在出错时**先挂载边界的降级内容、再调 `componentDidCatch`** ✓
 * ⇒ ⇒ 边界自己的"挂载过"标志在那一刻已经是真的了 ✓ ⇒ ⇒ 靠它判不出来 ✓。
 * ⇒ ⇒ 改由**应用自己说**："我起来了" ✓ ⇒ ⇒ 那一刻就是真的 ✓。
 */
let appReady = false;

/** 工作台起来了 ✓：应用第一次提交之后调它 ✓。 */
export function markAppReady(): void {
  appReady = true;
  // **页面告诉原生侧"我起来了"** ✓ ⇒ ⇒ 原生侧因此知道页面到这一步了 ✓ ⇒ ⇒
  // 与它自己的启动标记对得上 ✓ ⇒ ⇒ 页面没起来时 ⇒ ⇒ 那几段记录知道缺的是哪一段 ✓ ⇒ ⇒
  // 不用猜 ✓。
  void reportEvent({kind: 'page_ready'});
}

/**
 * **回传一条业务事件** ✓ ⇒ ⇒ 原生侧记进**同一份日志** ✓ ⇒ ⇒
 * 页面那次调用与原生侧那条记录**对得上** ✓ ⇒ ⇒ 出了问题能一路串起来 ✓。
 *
 * **通道失败被吞掉** ✓ ⇒ ⇒ 不因此把应用带崩 ✓ ⇒ ⇒ 也不递归报告自己 ✓（与失败出口同一条 ✓）。
 */
export async function reportEvent(event: WebEvent): Promise<void> {
  try {
    const port = await resolveMessagePort();
    await port.event(event);
  } catch {
    // 事件通道自己失败 ⇒ 就这样 ✓。
  }
}

/** 工作台起来过吗 ✓：没起来 ⇒ 崩在最外层 ⇒ 类别是"起不来" ✓。 */
export function isAppReady(): boolean {
  return appReady;
}

/**
 * 报一次 ✓：三处捕获（React ✓、脚本 ✓、拒绝 ✓）都走这里 ✓。
 *
 * **返回有没有真的报出去** ✓：去重与限流挡掉时是 false ✓。
 */
export function reportCapture(
  category: MessageCategory,
  error: unknown,
  source: string,
): Promise<boolean> {
  return capture.report(category, error, source);
}

/**
 * 渲染期错误的来源标识 ✓：**组件栈的头一帧** ✓。
 *
 * 同一个抛出点每次都一样 ✓ ⇒ ⇒ 渲染循环收敛成一条 ✓（P-3 ✓）⇒ ⇒ 而不同的组件
 * 仍然是不同的问题 ✓ ⇒ ⇒ 一次崩两处不会只看见一处 ✓。
 */
export function reactSource(componentStack?: string | null): string {
  const frame = (componentStack ?? '')
    .split('\n')
    .map((part) => part.trim())
    .find((part) => part.length > 0);
  return frame ?? 'react';
}

/**
 * **拒绝的来源标识** ✓：**一个定位串** ✓ ⇒ ⇒ **异常的类型 + 抛出位置** ✓ ⇒ ⇒
 * **同一个抛出点每次都一样** ✓ ⇒ ⇒ 循环收敛成一条 ✓。
 *
 * **不带原始异常 message** ✓ ⇒ ⇒ **日志里不落用户数据** ✓（基座 §5.2 ✓）⇒ ⇒
 * **但日志能指出是哪儿** ✓ ⇒ ⇒ **下一次同样的事，看日志就够** ✓ ⇒ ⇒
 * **不必再开控制台找那一行** ✓ ⇒ ⇒ **原文仍在控制台** ✓（浏览器自己打 ✓）。
 */
export function rejectionSource(reason: unknown): string {
  if (reason instanceof Error) {
    const frame = ourFrame(reason.stack);
    // **不含空格** ✓ ⇒ ⇒ 日志里那一条**始终是一行** ✓ ⇒ ⇒ 不用靠"续写上一个字段"还原 ✓。
    // **没有可指的位置就明说"没有"** ✓ ⇒ ⇒ 不与"不是 Error"混成一句话 ✓ ⇒ ⇒
    // 一次就能分清是"栈不可用"还是"根本没有栈" ✓。
    return frame ? `${reason.name}@${frame}` : `${reason.name}@no-frame`;
  }
  // **不是 Error ⇒ 说明它是哪一种值** ✓ ⇒ ⇒ 原生命令失败拒绝的是**字符串** ✓
  // ⇒ ⇒ 与"栈不可用"分得开 ✓ ⇒ ⇒ 看日志就知道问题在哪一侧 ✓ ⇒ ⇒
  // **只说种类，不说内容** ✓ ⇒ ⇒ 不带用户数据 ✓。
  return `rejection:${kindOf(reason)}`;
}

/** 那个值是哪一种 ✓（只说种类 ✓ ⇒ ⇒ 内容一个字都不带 ✓）。 */
function kindOf(reason: unknown): string {
  if (reason === null) return 'null';
  if (reason === undefined) return 'undefined';
  return typeof reason;
}

/**
 * **我们现在在哪儿** ✓：**调用点那一帧** ✓ ⇒ ⇒ 自己接住的那个失败也能定位 ✓ ⇒ ⇒
 * **不用手写行号** ✓ ⇒ ⇒ 行号会随改动烂掉 ✓ ⇒ ⇒ 这一条不会 ✓。
 *
 * **跳过它自己那一帧** ✓ ⇒ ⇒ 落在**调用它的那一处**身上 ✓ ⇒ ⇒
 * 定位不会指着这个捕获器自己 ✓ ⇒ ⇒ 哪儿出问题与哪儿捕获是两回事 ✓。
 */
export function hereSource(): string {
  return ourFrame(new Error().stack, 1) ?? 'unknown';
}

/**
 * 装上浏览器的两个捕获点 ✓。
 *
 * **`error` 事件也包括资源加载失败** ✓ ⇒ ⇒ 那种没有异常对象也没有消息 ✓
 * ⇒ ⇒ 不是脚本错误 ⇒ ⇒ 跳过 ✓。
 */
export function installWindowCapture(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (event) => {
    if (!event.error && !event.message) return;
    void reportCapture(
      'unhandled',
      event.error ?? event.message,
      `${event.filename}:${event.lineno}`,
    );
  });
  window.addEventListener('unhandledrejection', (event) => {
    void reportCapture('rejection', event.reason, rejectionSource(event.reason));
  });
}
