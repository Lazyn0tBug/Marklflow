import type {WriteOutcome} from '../../../application/workspace/documentSyncer';

/**
 * Web 形态**没有写回** ✓（设计 §6.4 ✓、§6.5 ✓）。
 *
 * **浏览器只有导入原语** ✓ ⇒ ⇒ 读得到的那份是一次性的 ✓ ⇒ ⇒ 没有可写的目标 ✓
 * ⇒ ⇒ **整条同步逻辑在 Web 形态下不跑** ✓ ⇒ ⇒ 这三个端口**答不了就抛** ✓。
 *
 * **为什么它们存在而不是干脆没有** ✓ ⇒ ⇒ 端口的形状两端一样 ✓ ⇒ ⇒ **应用层不判平台** ✓
 * ⇒ ⇒ 差异落在端口的**实现**上 ✓ ⇒ ⇒ 不是落在调用点上 ✓（§6.5 ✓）。
 *
 * **它们走不到** ✓ ⇒ ⇒ Web 形态没有同步目标 ✓ ⇒ ⇒ 写回那一步记为**不适用** ✓
 * ⇒ ⇒ **在碰到它们之前就停了** ✓（§6.5 ✓）。
 */

/** Web 形态答不了"还是那一版吗" ✓ ⇒ ⇒ 抛 ✓（§6.5 ✓）。 */
export async function webSameVersion(_handle: string): Promise<boolean> {
  throw new Error('浏览器没有可写的文件，没有同步目标');
}

/** Web 形态没有写回 ✓ ⇒ ⇒ 抛 ✓（§6.5 ✓）。 */
export async function webWrite(
  _handle: string,
  _bytes: Uint8Array,
  _overwrite: boolean,
): Promise<WriteOutcome> {
  throw new Error('浏览器没有可写的文件，没有同步目标');
}

/** Web 形态答不了"磁盘上那份是什么" ✓ ⇒ ⇒ 抛 ✓（§6.5 ✓）。 */
export async function webRead(_handle: string): Promise<string> {
  throw new Error('浏览器没有可写的文件，没有同步目标');
}
