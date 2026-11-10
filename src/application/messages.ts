/**
 * 应用消息：类别词表、报告的形状、文案，以及端口接口。
 *
 * **一处事实** ✓：原生侧的失败码与应用侧的失败码在同一张表里 ✓（见
 * [本地文档支持设计](../docs/design/local-document-support-2026-11-05.md) §9 与
 * [日志基座设计](../docs/design/log-base-plan-2026-11-03.md) §5.2 ✓）⇒ ⇒
 * 原生侧的码由 Rust 给出、与这里**必须同步** ✓（已有的"两处必须同步改"约定 ✓）
 * ⇒ ⇒ **这次同步由检查兜住** ✓：`scripts/check-message-vocabulary.ts` ✓
 * ⇒ ⇒ 两侧对不上就红 ✓ ⇒ ⇒ 词表不会烂掉 ✓。
 *
 * **成功不是失败** ⇒ ⇒ 成功不在这张表里 ✓（成功的分流由回执与 result 枚举承载 ✓）。
 *
 * **状态那一维的文案也在这里** ✓ ⇒ ⇒ 界面不自己拼句子 ✓ ⇒ ⇒ 一处改，处处改 ✓。
 */

import type {SyncStatus} from './workspace/documentFileContext';
import type {SyncFeedbackKind} from './workspace/syncFeedback';
import type {CloseTabReason} from './workspace/closeTab';
import {formatBytes} from '../core/model/limits';
export {formatBytes};

/**
 * 消息类别（封闭）✓：**页面侧与应用侧共用这一份** ✓。
 *
 * **一族一种拼写** ✓：全是 kebab ✓ ⇒ ⇒ 同一个字段里不会混着两种写法 ✓
 * ⇒ ⇒ 线上名字只有一处事实 ✓（Rust 侧的同一个枚举 ✓，
 * 见 [日志基座设计](../../docs/design/log-base-plan-2026-11-03.md) §5.2 ✓）。
 *
 * **四族** ✓：
 * - **通道类** ✓：页面到原生的**通道自己**的问题 ✓（基座原有 ✓，探针在用 ✓）；
 * - **原生文件类** ✓：由 `files.rs` 与 `source_guard.rs` 给出 ✓，拼写与那边一致 ✓；
 * - **应用自身类** ✓：应用自己的失败 ✓；
 * - **捕获类** ✓：**未捕获的错误从哪来** ✓（渲染期、脚本、拒绝、启动、后台）✓。
 */
export const MESSAGE_CATEGORIES = [
  // 通道类（基座原有 ✓，探针在用 ✓）
  'no-tauri-internals',
  'invoke-rejected',
  'invalid-payload',
  'rate-limited',
  'timeout',
  'unknown',
  // 原生文件类（`files.rs` 与 `source_guard.rs` 给出 ✓）
  'native-source-denied',
  'native-target-missing',
  'native-permission-denied',
  'native-io-failed',
  'native-dialog-failed',
  'file-too-large',
  'invalid-utf8',
  'not-a-file',
  'not-a-regular-target',
  'unknown-file-key',
  'print-failed',
  // 内部失活（不是用户的错）
  'file-capability-mismatch',
  'native-internal-failed',
  'invalid-file-name',
  'invalid-target',
  // 应用自身的失败
  'app-internal-failed',
  'document-open-failed',
  'export-failed',
  'export-blocked',
  'save-failed',
  'storage-corrupted',
  'storage-unreadable',
  'storage-write-failed',
  'preview-unavailable',
  'import-rejected',
  'input-too-large',
  // 捕获类（未捕获的错误从哪来 ✓）
  'render',
  'unhandled',
  'rejection',
  'startup',
  'worker',
] as const;

export type MessageCategory = (typeof MESSAGE_CATEGORIES)[number];

/**
 * 文案要的参数 ✓：**上限这类事实由拥有它的那一侧给出** ✓（§8.5 ✓）
 * ⇒ ⇒ 表里不写死数字 ✓ ⇒ ⇒ 用户看得到"多少" ✓。
 */
export interface MessageParams {
  /** 字节上限 ✓：原生侧随机器码给出 ✓，或应用侧的常量给出 ✓。 */
  limitBytes?: number | undefined;
  /** 字符上限 ✓：编辑器那份源文上限 ✓。 */
  limitChars?: number | undefined;
}

/** 一条文案 ✓：要么是一句 ✓，要么是"参数 ⇒ 一句" ✓。 */
export type MessageText = string | ((params: MessageParams) => string);

/**
 * 类别 → 用户可见的文案。
 *
 * **只收"用户可行动或可理解"的那些** ✓；其余的（应用自己用错了句柄、句柄已失效、
 * 内部状态不可用、路径或名字不可用）**不是用户造成的** ⇒ ⇒ 用户看一句通用失败即可 ✓，
 * 机器码仍留在报告里给日志与诊断 ✓。
 */
const MESSAGE_TEXTS: Partial<Record<MessageCategory, MessageText>> = {
  'native-source-denied': '当前窗口无权使用原生文件能力',
  'native-target-missing': '文件已被移走或重命名',
  'native-permission-denied': '没有权限访问这个文件',
  'native-io-failed': '文件读写失败',
  'native-dialog-failed': '系统文件对话框打不开',
  // **上限由拒绝它的那一侧给出** ✓ ⇒ ⇒ 说得出是多少 ✓ ⇒ ⇒ 没有就退回一句 ✓。
  'file-too-large': ({limitBytes}) =>
    limitBytes === undefined
      ? '文件超过可处理的大小上限'
      : `文件超过 ${formatBytes(limitBytes)} 的上限`,
  'invalid-utf8': '文件不是合法的 UTF-8 文本',
  'not-a-file': '目标不是一个普通文件',
  'not-a-regular-target': '目标不是一个普通文件',
  'unknown-file-key': '这个文件已经不再可访问',
  'print-failed': '打印失败',
  'app-internal-failed': '应用内部出了点问题，这次操作没有生效',
  'document-open-failed': '这个文档没能打开',
  'export-failed': '导出失败，请重试',
  'export-blocked': '这个产物在此平台无法导出',
  'save-failed': '保存失败，内容仍在工作区',
  'storage-corrupted': '部分记录已损坏，原始数据已保留',
  'storage-unreadable': '存储读不出来，原始数据未改写',
  'preview-unavailable': '这一份预览没能生成',
  'import-rejected': '这个文件没能导入',
  'input-too-large': ({limitChars}) =>
    limitChars === undefined
      ? '文档超过源文大小上限，本次输入未应用'
      : `文档超过 ${limitChars} 个字符的源文上限，本次输入未应用`,
  'storage-write-failed': '这次改动没能存下来，原数据未动',
  render: '这一部分没能显示',
  unhandled: '有个操作没能完成',
  rejection: '有个操作没能完成',
  startup: '工作台没能完全启动',
  worker: '后台处理没能完成',
};

/** 通用文案：不属于"用户可行动"那一类的失败 ⇒ 用户看到这一句 ✓。 */
export const GENERIC_FAILURE_TEXT = '文件操作失败';

/**
 * 草稿维度 ⇒ 文案 ✓（§2.2 ✓）。
 *
 * **说草稿就说草稿** ✓ ⇒ ⇒ 不写没有主语的"已更新 / 已保存" ✓。
 */
export const DRAFT_STATUS_TEXTS: {updated: string; saved: string} = {
  updated: '草稿已更新',
  saved: '草稿已保存',
};

/**
 * 同步维度 ⇒ 文案 ✓（§2.2 ✓）。
 *
 * **说文件就说文件** ✓ ⇒ ⇒ 不与草稿那一行混着说 ✓。
 */
export const SYNC_STATUS_TEXTS: Record<SyncStatus, string> = {
  none: '无同步目标',
  /** **目标不在了** ✓ ⇒ ⇒ **说清为什么保存灰着** ✓ ⇒ ⇒ **另存为是出路** ✓（§8.2 ✓）。 */
  'target-missing': '那个本地文件已经不在了，请另存为',
  synced: '已同步',
  unsynced: '未同步',
  failed: '同步失败',
};

/**
 * 顶栏那个分裂按钮 ⇒ 文案 ✓（§8.2 ✓、§8.5 ✓）。
 *
 * **主区叫「保存」** ✓ ⇒ ⇒ 用户熟悉这个动作 ✓ ⇒ ⇒ **提示写清它做什么** ✓ ⇒ ⇒ **不叫"同步"** ✓
 * ⇒ ⇒ 那是实现里的说法 ✓ ⇒ ⇒ 用户不需要那个词 ✓（§6.4 ✓）。
 */
export const SAVE_CONTROL_TEXTS = {
  /** 主区 ✓：点击即**把这一份写到一个本地文件** ✓（§6.4 ✓、§8.2 ✓）。 */
  writeBack: '保存',
  /** 菜单里那项 ✓：写明它写回哪里 ✓（§8.5 ✓）。 */
  writeBackMenu: '保存（写回文件）',
  /** 菜单里另存为 ✓。 */
  saveAs: '另存为…',
  /** 主区的提示 ✓：写清它做什么 ✓（§6.4 ✓）。 */
  writeBackHint: '写回文件',
  /**
   * **关联为空时那一句** ✓：这一份还没有本地文件 ✓ ⇒ ⇒ **点击会选一个** ✓ ⇒ ⇒
   * **文件名留空** ✓ ⇒ ⇒ 用户自己填 ✓（§8.2 ✓）。
   */
  pickTargetHint: '这一份还没有关联本地文件，点击后选一个',
  /**
   * **关联无效时那一句** ✓：那个文件不在了 ✓ ⇒ ⇒ **说清为什么不能点** ✓ ⇒ ⇒
   * **不给一个必然失败的按钮** ✓ ⇒ ⇒ **另存为是出路** ✓（§8.2 ✓、§8.5 ✓）。
   */
  invalidTargetHint: '那个本地文件已经不在了，请另存为',
  /** 没有同步目标时那一项的说明 ✓：说清为什么不能点 ✓ ⇒ ⇒ **不弹提示** ✓（§8.5 ✓）。 */
  noTargetHint: '这一份还没有关联本地文件',
};

/**
 * 冲突那三个选择 ⇒ 文案 ✓（§8.5 ✓、§8.6 ✓）。
 *
 * **覆盖 / 重载 / 取消** ✓ ⇒ ⇒ 三个答案各落到一项写回结果上 ✓（§6.5 ✓）。
 *
 * **每个选择都写明它做什么** ✓ ⇒ ⇒ **"重载"要写清本地改动不保留** ✓ ⇒ ⇒
 * **那是有人交出了自己的改动** ✓ ⇒ ⇒ 用户点之前就知道 ✓（§6.5 ✓）。
 */
export const CONFLICT_TEXTS = {
  title: '这个文件在应用外被改过',
  /** 说明应用外有改动 ✓ ⇒ ⇒ 请用户做决定 ✓ ⇒ ⇒ **不是一条告知** ✓（§8.6 ✓）。 */
  description: '应用外有改动，请选择怎么处理。',
  overwrite: '覆盖',
  overwriteHint: '用草稿覆盖文件',
  reload: '重载',
  reloadHint: '用文件覆盖草稿，本地改动不保留',
  cancel: '取消',
  cancelHint: '两边都不动，下次保存还会再问',
};

/**
 * 同步失败 ⇒ 文案 ✓（§8.5 ✓、§8.6 ✓）。
 *
 * **说清失败的是文件、不是草稿** ✓ ⇒ ⇒ 用户知道东西还在 ✓ ⇒ ⇒ **给重试入口** ✓。
 */
export const SYNC_FAILURE_HINT = '草稿已在工作区，失败的是文件';
export const SYNC_FAILURE_RETRY = '重试';

/**
 * 写回那一次的反馈 ⇒ 文案 ✓（§6.5 ✓、§8.5 ✓）。
 *
 * **一句话一处** ✓ ⇒ ⇒ 界面不自己拼句子 ✓ ⇒ ⇒ 一处改，处处改 ✓。
 *
 * **"本地改动不保留"只出现在一种情况里** ✓ ⇒ ⇒ 用户选重载那一次 ✓ ⇒ ⇒ 自动反向同步不说 ✓
 * ⇒ ⇒ 那是**有人交出了自己的改动** ✓ ⇒ ⇒ 那一句是给那次人听的 ✓（§6.5 ✓）。
 */
export const SYNC_FEEDBACK_TEXTS: Record<SyncFeedbackKind, string> = {
  written: '已写回文件',
  reloaded: '已按文件的最新内容更新了草稿',
  'reloaded-discarding': '已按文件的最新内容更新了草稿，本地改动不保留',
  cancelled: '两边都没有改动，下次保存还会再问',
};

/**
 * **那一条的语气** ✓ ⇒ ⇒ **与文案在一处** ✓ ⇒ ⇒ 一处改，处处改 ✓。
 *
 * **写回成功** ⇒ ⇒ 成功 ✓；**交出了本地改动** ⇒ ⇒ 提醒 ✓（不是失败 ✓）；
 * **两边都没动** ⇒ ⇒ 一句告知 ✓。
 */
export const SYNC_FEEDBACK_TONES: Record<
  SyncFeedbackKind,
  'success' | 'info' | 'warning' | 'error'
> = {
  written: 'success',
  reloaded: 'success',
  'reloaded-discarding': 'warning',
  cancelled: 'info',
};

/**
 * 另存为 ⇒ 文案 ✓（§6.2 ✓、§8.5 ✓）。
 *
 * **取消不是失败** ✓ ⇒ ⇒ 一句告知 ✓ ⇒ ⇒ **不弹错误** ✓（§9 ✓）。
 * **那个文件已经开着** ⇒ ⇒ 说清没有另存 ✓ ⇒ ⇒ 用户知道为什么没成 ✓。
 */
export const SAVE_AS_TEXTS = {
  saved: '已另存为新文档',
  cancelled: '已取消另存为',
  alreadyBound: '那个文件已经开着，没有另存',
  /**
   * **写出去了，但读没有确认** ✓ ⇒ ⇒ **关联不成立** ✓ ⇒ ⇒ 说清那一句 ✓（§8.5 ✓）。
   */
  unconfirmed: '文件已经写出去了，但没能读回来确认，因此没有建立关联',
  /**
   * **跨目录那一句** ✓（§6.2 ✓、M5-10 ✓）。
   *
   * **说清后果** ✓ ⇒ ⇒ 相对引用会按新位置解释 ⇒ ⇒ 可能裂图 ✓。
   * **两个可选项都在这一句里** ✓ ⇒ ⇒ 接受 ✓；**或先在原目录另存、再手动搬运资源** ✓。
   */
  crossDirectory:
    '另存到另一个目录后，正文里的相对图片引用会按新位置解释（可能裂图）。要么接受这一点，要么先在原目录另存、再手动搬运资源。要继续吗？',
};

/**
 * **写到新目标** ⇒ 文案 ✓（§8.2 ✓、§8.5 ✓）。
 *
 * **那是"关联为空时那一次保存"** ✓ ⇒ ⇒ **写成功即建立关联** ✓ ⇒ ⇒ 说清这一点 ✓。
 * **取消不是失败** ✓ ⇒ ⇒ 一句告知 ✓ ⇒ ⇒ **不弹错误** ✓（§9 ✓）。
 */
export const SAVE_TO_TEXTS = {
  saved: '已保存，并关联到那个文件',
  cancelled: '已取消保存',
  alreadyBound: '那个文件已经开着，没有保存过去',
  /**
   * **写出去了，但读没有确认** ✓ ⇒ ⇒ **关联不成立** ✓ ⇒ ⇒ 说清那一句 ✓（§8.5 ✓）。
   */
  unconfirmed: '文件已经写出去了，但没能读回来确认，因此没有建立关联',
};

/**
 * **门那两句** ⇒ 文案 ✓（§6.1 ✓、§8.5 ✓）。
 *
 * **目标没了** ⇒ ⇒ 说清它没了 ✓ ⇒ ⇒ 说清继续会怎样 ✓ ⇒ ⇒ **用户答的是"是/否"** ✓。
 * **写不进去** ⇒ ⇒ 说清写不进去了 ✓ ⇒ ⇒ 说清另存是出路 ✓ ⇒ ⇒ **不猜** ✓。
 */
export const GATE_TEXTS = {
  missing: '那个本地文件已经不在了。要继续写过去吗？继续会重新创建它。',
  unwritable: '那个本地文件写不进去了。要另存到一个新文件吗？',
};

/**
 * 关闭标签页那一次 ⇒ 文案 ✓（M5-8 ✓、§8.5 ✓）。
 *
 * **只问写那件** ✓ ⇒ ⇒ 草稿没存住**不在这儿问** ✓ ⇒ ⇒ 那一条自己报它自己 ✓（§9 ✓）。
 * **"保存"现在指写回文件** ✓ ⇒ ⇒ 那一句说的是**写回文件** ✓（§6.4 ✓）。
 * **说清关掉会怎样** ✓ ⇒ ⇒ 用户知道自己在答应什么 ✓。
 */
export const CLOSE_TAB_TEXTS: Record<Exclude<CloseTabReason, 'none'>, string> = {
  unsynced: '这份文档还有没写回文件的改动。要写回文件后关闭标签页吗？',
};

/** 类别 → 文案。认不出的类别给通用的一句 ✓：不猜它意味着什么 ✓。 */
export function messageText(category: string, params?: MessageParams): string {
  const text = MESSAGE_TEXTS[category as MessageCategory];
  if (text === undefined) return GENERIC_FAILURE_TEXT;
  return typeof text === 'string' ? text : text(params ?? {});
}

/** 这个类别有没有自己的文案（= 用户可行动或可理解）✓。 */
export function hasOwnText(category: string): boolean {
  return Object.prototype.hasOwnProperty.call(MESSAGE_TEXTS, category);
}

/**
 * 一次失败的报告。
 *
 * `detail` 是**原始文本** ⇒ ⇒ 只进控制台，不进日志、不进用户面 ✓
 * （基座 §5.2 的硬约束 ✓）。
 *
 * `cause` 是**原始异常本身** ⇒ ⇒ 控制台按它打（带可点的栈 ✓）⇒ ⇒ 借的是
 * `Error.cause` 的那个形状 ✓（设计 §7.1 ✓）⇒ ⇒ 日志与用户面都不碰它 ✓。
 *
 * `diagnosticId` 是**诊断 id** ✓：短、稳定、可复述 ✓ ⇒ ⇒ 用户面与控制台都有它 ✓
 * ⇒ ⇒ 拿它对上那一条 ✓ ⇒ ⇒ **不进日志** ✓（基座的载荷白名单里没有它 ✓）。
 */
export interface ProblemReport {
  category: MessageCategory;
  diagnosticId?: string;
  detail?: string;
  cause?: unknown;
}

/** 消息端口：应用层只认这个接口 ✓，不认 console、不认 log_event ✓。 */
export interface MessagePort {
  report(report: ProblemReport): Promise<void>;
}
