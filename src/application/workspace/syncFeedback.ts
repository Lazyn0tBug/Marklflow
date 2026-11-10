import type {SyncOutcome} from './documentSyncer';

/**
 * 一次写回的反馈 ✓：**说哪一句** ✓（设计 §6.5 ✓、§8.5 ✓）。
 *
 * **规则在这儿** ✓ ⇒ ⇒ 不必起浏览器就能盯住 ✓ ⇒ ⇒ 与 `documentSyncer.ts` 同一范式 ✓。
 *
 * **只说"是哪一句"** ✓ ⇒ ⇒ **字与语气在文案表里** ✓ ⇒ ⇒ 界面不自己拼句子 ✓（§8.5 ✓）。
 */
export type SyncFeedbackKind =
  /** 已写回文件 ✓（普通写回与用户选覆盖共用 ✓）。 */
  | 'written'
  /** 草稿取回了文件的版本 ✓：**自动的那次** ✓ ⇒ ⇒ **没有本地改动可丢** ✓ ⇒ ⇒ 不说那句 ✓。 */
  | 'reloaded'
  /** 草稿取回了文件的版本 ✓：**用户选重载的那次** ✓ ⇒ ⇒ **本地改动不保留** ✓ ⇒ ⇒ 要说 ✓。 */
  | 'reloaded-discarding'
  /** 两边都没动 ✓ ⇒ ⇒ 下次保存还会再问 ✓。 */
  | 'cancelled';

/** 一次写回的反馈 ✓：**是哪一句** ✓ ⇒ ⇒ 文案与语气在文案表里 ✓。 */
export interface SyncFeedback {
  kind: SyncFeedbackKind;
}

/**
 * **这一次该说什么** ✓ ⇒ ⇒ 各落到一句或一句都不说 ✓（§6.5 ✓）。
 *
 * **失败不归这里** ✓ ⇒ ⇒ **一次失败一次报告** ✓ ⇒ ⇒ 走机器码那条路 ✓（§9 ✓）
 * ⇒ ⇒ 这里不重复它 ✓ ⇒ ⇒ **同一件事不说两遍** ✓（§2.1 ✓）。
 *
 * **只说文件那一句** ✓ ⇒ ⇒ **草稿那一维是常驻状态** ✓ ⇒ ⇒ 这里不同时说两件事 ✓（§6.4 ✓）。
 *
 * **没有同步目标时不说话** ✓ ⇒ ⇒ 不提示 ✓ ⇒ ⇒ **不需要问要不要另存** ✓（§8.2 ✓）。
 *
 * **"本地改动不保留"只在一种情况下出现** ✓ ⇒ ⇒ 用户选重载那一次 ✓ ⇒ ⇒ 自动反向同步不说 ✓
 * ⇒ ⇒ 那是**有人交出了自己的改动** ✓ ⇒ ⇒ 那一句是给那次人听的 ✓（§6.5 ✓）。
 */
export function syncFeedback(outcome: SyncOutcome): SyncFeedback | undefined {
  switch (outcome.writeBack.kind) {
    case 'written':
      return {kind: 'written'};
    case 'reloaded':
      // **有没有人在场** ✓ ⇒ ⇒ **只有用户选重载那次要说"本地改动不保留"** ✓（§6.5 ✓）。
      return {kind: outcome.conflict === 'reload' ? 'reloaded-discarding' : 'reloaded'};
    case 'cancelled':
      return {kind: 'cancelled'};
    default:
      // **不适用** ✓（没有同步目标 ✓ ⇒ ⇒ 不提示 ✓）、
      // **失败** ✓（常驻状态说 ✓ ⇒ ⇒ 机器码那条路说 ✓）⇒ ⇒ 这两样都不在这里说 ✓。
      return undefined;
  }
}
