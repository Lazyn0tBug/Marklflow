import type {MessagePort, ProblemReport} from '../../../application/messages';

/**
 * 桌面构建的出口 ✓：经 `log_event` 进原生日志基座 ✓ ⇒ **发类别与定位串** ✓
 * （基座 §5.2：**不传原文 message** ✓，**传一个有界的定位串** ✓），**原文留在控制台** ✓。
 *
 * **定位串有界** ✓ ⇒ ⇒ 日志里那一条不会变长 ✓ ⇒ ⇒ **我们自己构建产物里的位置** ✓ ⇒ ⇒
 * **不含用户数据** ✓ ⇒ ⇒ **看日志就能定位** ✓ ⇒ ⇒ **不必再开控制台找那一行** ✓。
 *
 * 应用层不碰 log_event ✓：走这个端口 ✓。
 */
export const tauriMessagePort: MessagePort = {
  async report(report: ProblemReport): Promise<void> {
    const native = await import('@tauri-apps/api/core');
    if (!native.isTauri()) return;
    await native.invoke('log_event', {
      payload: JSON.stringify({
        event: 'page_error',
        error_category: report.category,
        source: report.source?.slice(0, 200),
      }),
    });
  },
};
