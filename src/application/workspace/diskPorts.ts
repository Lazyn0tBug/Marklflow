import type {SaveTargetDiskPorts} from './documentSaveTo';
import type {SyncDiskPorts} from './documentSyncer';

/**
 * **平台给的那一半** ✓（设计 §6.5 ✓）。
 *
 * **只有磁盘** ✓ ⇒ ⇒ 落草稿、问用户、回填那三个**平台给不了** ✓ ⇒ ⇒ 宿主自己给 ✓。
 * **两端各一套** ✓ ⇒ ⇒ 差异落在**实现**上 ✓ ⇒ ⇒ 不是落在调用点上 ✓ ⇒ ⇒ **应用层不判平台** ✓。
 */
export interface DiskPorts {
  /** 同步那几个 ✓。 */
  sync: SyncDiskPorts;
  /** **写到新目标那一个包** ✓ ⇒ ⇒ **另存为与写到新目标共用它** ✓（§6.2 ✓、§8.2 ✓）。 */
  saveAs: SaveTargetDiskPorts;
  /**
   * **这两个文件在不在同一个目录** ✓（§6.2 ✓、M5-10 ✓）。
   *
   * **只有拿着路径的那一侧答得了** ✓ ⇒ ⇒ 路径不出原生侧 ✓ ⇒ ⇒ 应用侧拿不到路径 ✓（§3.4 ✓）。
   * **答不了就抛** ✓ ⇒ ⇒ 应用层按"答不上"处理 ✓ ⇒ ⇒ 不拿一个猜出来的结论吓人 ✓。
   */
  sameDirectory(first: string, second: string): Promise<boolean>;
}
