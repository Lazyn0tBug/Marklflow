import type {FileReference} from '../../../application/workspace/documentFileContext';
import type {DiskPorts} from '../../../application/workspace/diskPorts';
import type {TargetStatus} from '../../../application/workspace/targetStatus';
import type {SourceFormat} from '../../model/document';

/**
 * Web 形态**没有可写的文件** ✓（设计 §6.4 ✓、§6.5 ✓）。
 *
 * **浏览器只有导入原语** ✓ ⇒ ⇒ 读得到的那份是一次性的 ✓ ⇒ ⇒ 没有可写的目标 ✓
 * ⇒ ⇒ **整条同步逻辑在 Web 形态下不跑** ✓ ⇒ ⇒ 这些端口**答不了就抛** ✓。
 *
 * **为什么它们存在而不是干脆没有** ✓ ⇒ ⇒ 端口的形状两端一样 ✓ ⇒ ⇒ **应用层不判平台** ✓
 * ⇒ ⇒ 差异落在端口的**实现**上 ✓ ⇒ ⇒ 不是落在调用点上 ✓（§6.5 ✓）。
 *
 * **它们走不到** ✓ ⇒ ⇒ Web 形态没有同步目标 ✓ ⇒ ⇒ 写回那一步记为**不适用** ✓
 * ⇒ ⇒ **在碰到它们之前就停了** ✓（§6.5 ✓）。
 */

/**
 * Web 形态答不了"那个目标是什么状态" ✓ ⇒ ⇒ 抛 ✓（§6.5 ✓）。
 *
 * **浏览器没有本地文件** ✓ ⇒ ⇒ 没有目标可问 ✓ ⇒ ⇒ **整条写回逻辑不跑** ✓。
 */
export async function webDetect(_handle: string): Promise<TargetStatus> {
  throw new Error('浏览器没有可写的文件，没有同步目标');
}

/** Web 形态没有写回 ✓ ⇒ ⇒ 抛 ✓（§6.5 ✓）。 */
export async function webWrite(
  _handle: string,
  _bytes: Uint8Array,
  _intent: 'sync' | 'overwrite' | 'continue',
): Promise<TargetStatus> {
  throw new Error('浏览器没有可写的文件，没有同步目标');
}

/** Web 形态答不了"磁盘上那份是什么" ✓ ⇒ ⇒ 抛 ✓（§6.5 ✓）。 */
export async function webRead(_handle: string, _format: SourceFormat): Promise<string> {
  throw new Error('浏览器没有可写的文件，没有同步目标');
}

/**
 * Web 形态答不了"那个目标还在吗" ✓ ⇒ ⇒ 抛 ✓（§8.2 ✓）。
 *
 * **浏览器没有本地文件** ✓ ⇒ ⇒ 没有目标可问 ✓ ⇒ ⇒ **关联的有效性在 Web 端恒为"没有"** ✓
 * ⇒ ⇒ 那一整组控件灰掉 ✓（§8.2 ✓）。
 */
export async function webTargetPresent(_handle: string): Promise<boolean> {
  throw new Error('浏览器没有可写的文件，没有同步目标');
}

/**
 * Web 形态选不了可写的目标 ✓ ⇒ ⇒ 抛 ✓（§6.2 ✓、§8.2 ✓）。
 *
 * **Web 的另存为走导出下载** ✓ ⇒ ⇒ **那一条不在这个菜单里** ✓ ⇒ ⇒ 不建立绑定 ✓。
 */
export async function webSelectTarget(_suggestedName: string): Promise<FileReference | undefined> {
  throw new Error('浏览器没有可写的文件，没有同步目标');
}

/** Web 形态没有可写的目标 ⇒ ⇒ 写不进去 ✓ ⇒ ⇒ 抛 ✓（§6.2 ✓）。 */
export async function webWriteBytes(_handle: string, _bytes: Uint8Array): Promise<void> {
  throw new Error('浏览器没有可写的文件，没有同步目标');
}

/** Web 形态没有原生授权 ⇒ ⇒ 没有句柄可放 ✓ ⇒ ⇒ 抛 ✓（§5.1 ✓）。 */
export async function webReleaseHandle(_handle: string): Promise<void> {
  throw new Error('浏览器没有可写的文件，没有同步目标');
}

/**
 * Web 形态答不了"这两个文件在同一个目录里吗" ✓ ⇒ ⇒ 抛 ✓（§6.2 ✓）。
 *
 * **浏览器没有本地文件** ✓ ⇒ ⇒ 没有目录可比 ✓ ⇒ ⇒ 而"在不在同一个目录"只有拿着路径的那一侧答得了 ✓
 * ⇒ ⇒ Web 形态的另存为**走导出下载** ✓ ⇒ ⇒ 不建立绑定 ✓ ⇒ ⇒ 那一条不在这个菜单里 ✓（§8.2 ✓）。
 */
export async function webSameDirectory(_first: string, _second: string): Promise<boolean> {
  throw new Error('浏览器没有可写的文件，没有同步目标');
}

/**
 * **Web 形态给工作区那一层的端口** ✓（设计 §6.5 ✓）。
 *
 * **只有磁盘那一半** ✓ ⇒ ⇒ 落草稿、问用户、回填那三个**平台给不了** ✓ ⇒ ⇒ 宿主自己给 ✓。
 * **两端各一套** ✓ ⇒ ⇒ 差异落在**实现**上 ✓ ⇒ ⇒ 不是落在调用点上 ✓。
 */
export type WebDiskPorts = DiskPorts;

/** **Web 形态那一套** ✓：**答不了就抛** ✓ ⇒ ⇒ 整条同步逻辑不跑 ✓。 */
export const webDiskPorts: WebDiskPorts = {
  sync: {
    detect: webDetect,
    write: (handle, bytes, intent) => webWrite(handle, bytes, intent),
    read: webRead,
    // **答不了就抛** ✓ ⇒ ⇒ 应用层按"答不上"处理 ✓（§6.5 ✓）。
    targetPresent: webTargetPresent,
  },
  saveAs: {
    selectTarget: webSelectTarget,
    write: webWriteBytes,
    releaseHandle: webReleaseHandle,
    // **答不了就抛** ✓ ⇒ ⇒ 应用层按"答不上"处理 ✓（§6.5 ✓）。
    targetPresent: webTargetPresent,
  },
  // **浏览器没有目录可比** ✓ ⇒ ⇒ 答不了就抛 ✓（§6.2 ✓）。
  sameDirectory: webSameDirectory,
};
