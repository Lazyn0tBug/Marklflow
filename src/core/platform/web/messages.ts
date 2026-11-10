import type {MessagePort, ProblemReport, WebEvent} from '../../../application/messages';

/**
 * 浏览器构建的出口 ✓：**原始文本进控制台** ✓（这里没有原生日志可去 ✓），
 * 类别与诊断 id 一并带上 ✓，便于在控制台里按类别筛 ✓ ⇒ ⇒ 也对得上用户面那条 ✓。
 *
 * **原始异常按它自己打** ✓（`cause` ✓）⇒ ⇒ 控制台给的是**可点的栈** ✓ ⇒ ⇒ 没有就退回文本 ✓。
 *
 * 应用层不碰 console ✓：走这个端口 ✓。
 */
export const webMessagePort: MessagePort = {
  /**
   * **业务事件也进控制台** ✓ ⇒ ⇒ 浏览器构建里**看得见页面做了什么** ✓ ⇒ ⇒
   * 与原生构建的日志对得上同一套事件名 ✓ ⇒ ⇒ 两边读法一致 ✓。
   */
  async event(event: WebEvent): Promise<void> {
    console.info(
      '[event]',
      event.kind,
      event.callId ?? '',
      event.command ?? '',
      event.result ?? '',
    );
  },
  async report(report: ProblemReport): Promise<void> {
    console.error(
      '[message]',
      report.category,
      report.diagnosticId ?? '',
      report.cause ?? report.detail ?? '',
      // **定位串也在这儿** ✓ ⇒ ⇒ 与日志里那一条对得上 ✓ ⇒ ⇒ 找出处不用两处对 ✓。
      report.source ?? '',
    );
  },
};
