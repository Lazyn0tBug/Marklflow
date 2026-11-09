import contract from '../../../docs/contracts/file-read.json';

/**
 * 应用自己知道的上限 ✓（§8.5 ✓）。
 *
 * **一处事实** ✓ ⇒ ⇒ 文案里的数字从这里来 ✓ ⇒ ⇒ 不在文案里手写 ✓。
 * **原生侧的上限由它自己给出** ✓（随机器码带出 ✓）⇒ ⇒ 这里只放**应用自己**守的那些 ✓。
 * **纯模块** ✓ ⇒ ⇒ 纯的批次与平台层都能用 ✓（`src/core/model/` 是纯的根 ✓）。
 *
 * **数字本身在契约里** ✓（`docs/contracts/file-read.json` ✓）⇒ ⇒ 两端各有一份常量 ✓
 * ⇒ ⇒ 原生侧的那份由 `scripts/check-file-limits.ts` 盯住与契约相等 ✓ ⇒ ⇒ 改一处即两处 ✓。
 */

/**
 * 导入的字节上限 ✓：**两端刻意一致** ✓（设计 §5.1 ✓）
 * ⇒ ⇒ 同一批文件在哪儿打开都一样 ✓ ⇒ ⇒ 可导入的集合与来源无关 ✓。
 */
export const IMPORT_BYTE_LIMIT=contract.limits.importBytes;

/**
 * 原生写入的字节上限 ✓：应用侧提前拦一道 ✓ ⇒ ⇒ 免得把超大的东西送过 IPC ✓。
 *
 * **与原生侧的 `WRITE_LIMIT` 一致** ✓ ⇒ ⇒ 这里是一份**刻意对齐的镜像** ✓
 * ⇒ ⇒ 原生侧改动时两边一起改 ✓（脚本盯着 ✓）。
 */
export const NATIVE_WRITE_BYTE_LIMIT=contract.limits.nativeWriteBytes;

/** 字节数 ⇒ 人读的 ✓：整 MiB 就写整数 ✓ ⇒ ⇒ 不是就留一位小数 ✓。 */
export function formatBytes(bytes:number):string{
 const mib=bytes/(1024*1024);
 return `${Number.isInteger(mib)?mib:Math.round(mib*10)/10}MiB`;
}
