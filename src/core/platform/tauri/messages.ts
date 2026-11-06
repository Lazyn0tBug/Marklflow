import type {MessagePort,ProblemReport} from '../../../application/messages';

/**
 * 桌面构建的出口 ✓：经 `log_event` 进原生日志基座 ✓ ⇒ **只发类别** ✓
 * （基座 §5.2：只传类别，不传原文 ✓），**原文留在控制台** ✓。
 *
 * 应用层不碰 log_event ✓：走这个端口 ✓。
 */
export const tauriMessagePort:MessagePort={
  async report(report:ProblemReport):Promise<void>{
    const native=await import('@tauri-apps/api/core');
    if(!native.isTauri())return;
    await native.invoke('log_event',{payload:JSON.stringify({event:'page_error',error_category:report.category})});
  },
};
