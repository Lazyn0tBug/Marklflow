import type {DocumentRecord} from '../../core/model/document';
import type {SyncStatus} from './documentFileContext';
import type {WriteBackResult} from './documentSyncer';

/**
 * **关闭标签页** ✓（设计 M5-8 ✓、§4.3 ✓）。
 *
 * **它是"一次写"** ✓ ⇒ ⇒ 提示只问**写**那件 ✓ ⇒ ⇒ **放弃 = 不写回直接关** ✓
 * ⇒ ⇒ 草稿在它自己的存放处 ⇒ ⇒ 关掉不丢 ✓ ⇒ ⇒ **标签页不会再被困住** ✓（§16 ✓）。
 *
 * **规则住在应用层** ✓ ⇒ ⇒ 不必起浏览器就能盯住 ✓ ⇒ ⇒ 接线那一侧只管把端口接上 ✓。
 */

/** 要不要问 ✓ ⇒ ⇒ **只有写那件** ✓ ⇒ ⇒ 草稿那一维**不问** ✓（§16 ✓）。 */
export type CloseTabReason = 'none' | 'unsynced';

/**
 * 关掉的结果 ✓：**只有一种** ✓ ⇒ ⇒ **关不掉的那种状态没有了** ✓ ⇒ ⇒
 * **标签页不会再被困住** ✓（§16 ✓）。
 */
export type CloseTabOutcome = {kind: 'closed'};

/**
 * **要不要问** ✓ ⇒ ⇒ 界面只照着渲染 ✓ ⇒ ⇒ 界面不自己判 ✓（§8.6 ✓）。
 *
 * **文件那边没写回 ⇒ ⇒ 问** ✓ ⇒ ⇒ **草稿没存住不在这儿问** ✓ ⇒ ⇒
 * 那一条**自己报它自己** ✓（§9 ✓）⇒ ⇒ 草稿在它自己的存放处 ⇒ ⇒ 关掉不丢 ✓。
 */
export function closeTabReason(status: SyncStatus): CloseTabReason {
  return status === 'unsynced' || status === 'failed' ? 'unsynced' : 'none';
}

/**
 * **关之前那几步** ✓（宿主给端口 ✓）。
 *
 * **先落草稿** ✓ ⇒ ⇒ 关掉不丢 ✓ ⇒ ⇒ **落不住也不拦** ✓ ⇒ ⇒
 * **标签页不会被困住** ✓ ⇒ ⇒ 内容还在工作区 ✓（§9 ✓）。
 *
 * **再问一句** ✓ ⇒ ⇒ 问的是**写回文件**那件 ✓ ⇒ ⇒ **说是 ⇒ ⇒ 写回** ✓ ⇒ ⇒
 * **写不进去也关** ✓ ⇒ ⇒ 草稿还在它自己的存放处 ✓ ⇒ ⇒ 两边都不动 ✓。
 * **说否 ⇒ ⇒ 放弃 = 不写回直接关** ✓ ⇒ ⇒ **不提示第二次** ✓。
 */
export interface CloseTabPorts {
  /** 问一句 ✓：**说清关掉会怎样** ✓ ⇒ ⇒ 用户知道自己在答应什么 ✓。 */
  confirm(reason: Exclude<CloseTabReason, 'none'>): Promise<boolean>;
  /** 落草稿 ✓：**落不住就返回 false** ✓ ⇒ ⇒ **但不拦着关** ✓。 */
  persist(doc: DocumentRecord): Promise<boolean>;
  /** 写回文件 ✓：**没有同步目标就是 undefined** ✓ ⇒ ⇒ 落盘就够 ✓。 */
  writeBack(doc: DocumentRecord): Promise<WriteBackResult | undefined>;
}

/**
 * **关掉之前** ✓ ⇒ ⇒ **只有一种结果** ✓ ⇒ ⇒ **关得掉** ✓。
 *
 * **刚打开未改动的文件不问** ✓ ⇒ ⇒ **没有要写的就不问** ✓（M5-8 ✓）。
 */
export async function closeTabBeforeClose(
  doc: DocumentRecord,
  status: SyncStatus,
  ports: CloseTabPorts,
): Promise<CloseTabOutcome> {
  // **先把草稿落住** ✓ ⇒ ⇒ 关掉不丢 ✓ ⇒ ⇒ **落不住也不拦** ✓ ⇒ ⇒
  // **内容还在工作区** ✓ ⇒ ⇒ **标签页不会被困住** ✓（§9 ✓、§16 ✓）。
  await ports.persist(doc);
  const reason = closeTabReason(status);
  if (reason === 'none') return {kind: 'closed'};
  const proceed = await ports.confirm(reason);
  // **放弃 = 不写回直接关** ✓ ⇒ ⇒ 两边都不动 ✓ ⇒ ⇒ **不提示第二次** ✓。
  if (!proceed) return {kind: 'closed'};
  // **写不进去也关** ✓ ⇒ ⇒ 草稿还在它自己的存放处 ✓ ⇒ ⇒ **标签页不会被困住** ✓。
  await ports.writeBack(doc);
  return {kind: 'closed'};
}
