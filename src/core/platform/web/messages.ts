import type {MessagePort,ProblemReport} from '../../../application/messages';

/**
 * 浏览器构建的出口 ✓：**原始文本进控制台** ✓（这里没有原生日志可去 ✓），
 * 类别一并带上 ✓，便于在控制台里按类别筛 ✓。
 *
 * 应用层不碰 console ✓：走这个端口 ✓。
 */
export const webMessagePort:MessagePort={
  async report(report:ProblemReport):Promise<void>{
    console.error('[message]',report.category,report.detail??'');
  },
};
