import type {FileReference} from '../../../application/workspace/documentFileContext';
import type {DiskPorts} from '../../../application/workspace/diskPorts';
import {sourceFormatOf} from '../../policy/sourceFormat';
import {extractPayloadFromHtml} from '../../storage/storage';
import {
  isNativeSameDirectory,
  isNativeSynced,
  isNativeTargetPresent,
  readNativeTextByKey,
  releaseNativeFile,
  selectNativeSave,
  writeNativeBytes,
  writeNativeSync,
} from './files';

/**
 * **桌面端给工作区那一层的端口** ✓（设计 §6.5 ✓）。
 *
 * **只有磁盘那一半** ✓ ⇒ ⇒ 落草稿、问用户、回填那三个**平台给不了** ✓ ⇒ ⇒ 宿主自己给 ✓。
 * **两端各一套** ✓ ⇒ ⇒ 差异落在**实现**上 ✓ ⇒ ⇒ 不是落在调用点上 ✓。
 */
export type NativeDiskPorts = DiskPorts;

/**
 * **桌面端那一套** ✓：句柄就是原生侧的 key ✓ ⇒ ⇒ 路径不出原生侧 ✓。
 *
 * **写回走受守卫的同步入口** ✓ ⇒ ⇒ 复核在命令内部 ✓ ⇒ ⇒ 前端不能选择不复核 ✓（§6.1 ✓）。
 * **另存为走通用字节写入** ✓ ⇒ ⇒ 目标是新选的 ✓ ⇒ ⇒ 那里没有基线 ✓ ⇒ ⇒ 无从复核 ✓（§6.2 ✓）。
 */
export const nativeDiskPorts: NativeDiskPorts = {
  sync: {
    sameVersion: (handle) => isNativeSynced(handle),
    /**
     * **那个目标还在吗** ✓ ⇒ ⇒ **只有原生侧答得了** ✓ ⇒ ⇒ 应用侧只存那个答案 ✓
     * ⇒ ⇒ **关联的有效性归它答** ✓ ⇒ ⇒ **不是写失败的结果** ✓（§8.2 ✓）。
     */
    targetPresent: (handle) => isNativeTargetPresent(handle),
    // **"这次是覆盖"在前端说** ✓ ⇒ ⇒ **基准由原生侧选** ✓ ⇒ ⇒ 前端拿不到摘要值 ✓（§6.1 ✓）。
    // **"这次允许目标不存在"也在前端说** ✓ ⇒ ⇒ 那是**用户说了继续** ✓ ⇒ ⇒ 其余复核照旧 ✓。
    write: (handle, bytes, intent) => writeNativeSync(handle, bytes, intent),
    /**
     * **读回来的是源快照** ✓ ⇒ ⇒ **可编辑 HTML 解出载荷的正文** ✓
     * ⇒ ⇒ 草稿里是正文不是 HTML ✓ ⇒ ⇒ 反向同步不会把 HTML 塞进编辑器 ✓（§6.1 ✓）。
     */
    read: async (handle, format) => {
      const text = await readNativeTextByKey(handle);
      if (format !== 'editable-html') return text;
      const source = extractPayloadFromHtml(text);
      if (source === null) throw new Error('这个文件里没有可编辑 HTML 的源载荷');
      return source.markdown;
    },
  },
  saveAs: {
    selectTarget: async (suggestedName): Promise<FileReference | undefined> => {
      const target = await selectNativeSave(suggestedName);
      if (target === undefined) return undefined;
      return {
        reference: target.reference,
        handle: target.key,
        displayName: target.name,
        // **载荷类型一处决定** ✓ ⇒ ⇒ 打开与另存为同一个文件拿到同一个格式 ✓（§3.3 ✓）。
        sourceFormat: sourceFormatOf(target.name),
      };
    },
    write: (handle, bytes) => writeNativeBytes(handle, bytes),
    releaseHandle: (handle) => releaseNativeFile(handle),
    // **那个目标还在吗** ✓ ⇒ ⇒ **同一个原生命令** ✓ ⇒ ⇒ 写完问一次 ✓（§6.1 ✓）。
    targetPresent: (handle) => isNativeTargetPresent(handle),
  },
  // **同目录由原生侧答** ✓ ⇒ ⇒ 路径不出原生侧 ✓（§6.2 ✓、M5-10 ✓）。
  sameDirectory: (first, second) => isNativeSameDirectory(first, second),
};
