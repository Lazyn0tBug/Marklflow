import {ErrorCapture} from '../../../application/capture';
import type {MessageCategory} from '../../../application/messages';
import {reportFailure} from '../failures';

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

/** 拒绝的来源标识 ✓：异常的类型与消息 ✓ ⇒ ⇒ 同一个拒绝收敛成一条 ✓。 */
export function rejectionSource(reason: unknown): string {
  if (reason instanceof Error) return `${reason.name}: ${reason.message}`.slice(0, 120);
  if (typeof reason === 'string') return reason.slice(0, 120);
  return 'rejection';
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
