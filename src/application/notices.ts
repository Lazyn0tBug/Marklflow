import type {MessageCategory} from './messages';

/**
 * 通知面：**一次告知**的去处 ✓（设计 §2.1 ✓）。
 *
 * **不是状态、也不是回执** ✓：状态留在那个表面 ✓（存储恢复那条 ✓、预览那块 ✓），
 * 回执由操作的调用方显示 ✓ ⇒ ⇒ 三条去向不混 ✓ ⇒ ⇒ 同一件事不说两遍 ✓。
 *
 * **多条并存** ✓：后一条不盖掉前一条 ✓ ⇒ ⇒ 不是一个字符串状态 ✓。
 * **可关闭** ✓：关掉就是关掉 ✓ ⇒ ⇒ 不打断正在做的事 ✓（`alert()` 退场 ✓）。
 * **四种语气** ✓：成功与失败都在这一类里 ✓ ⇒ ⇒ 用语气区分 ✓（设计 §2.1 ✓）。
 */

/** 语气四种 ✓（沿用导出面板那套 ✓ ⇒ ⇒ 不另造一套视觉语言 ✓）。 */
export type NoticeTone = 'success' | 'info' | 'warning' | 'error';

/** 一条通知 ✓。 */
export interface Notice {
  /** 通知自己的 id ✓（关掉它靠它 ✓）。 */
  id: string;
  tone: NoticeTone;
  message: string;
  /** 失败才有 ✓：机器码 ✓（分流与统计用 ✓）。 */
  category?: MessageCategory;
  /** 失败才有 ✓：诊断 id ✓（用户能念出来 ✓ ⇒ ⇒ 拿它对上控制台那一条 ✓）。 */
  diagnosticId?: string;
  /**
   * 正在退场 ✓ ⇒ ⇒ 先渐隐往下沉 ✓ ⇒ ⇒ 动画走完才真的收走 ✓。
   *
   * **消失是分两段的事** ✓ ⇒ ⇒ 存储只管"开始退场" ✓ ⇒ ⇒ 真正收走是 `remove` ✓。
   */
  leaving?: boolean;
}

/**
 * 哪些类别**用户该知道** ✓。
 *
 * **表面状态与回执不进这里** ✓（设计 §2.1 ✓）：
 * - `render` / `startup` ⇒ 错误边界的降级内容**就是**给用户看的 ✓ ⇒ ⇒ 不再发一条 ✓；
 * - `storage-corrupted` ⇒ 存储恢复那条横幅 ✓；`preview-unavailable` ⇒ 预览面板 ✓；
 *   `import-rejected` ⇒ 导入结果列表 ✓ ⇒ ⇒ 各自留在自己那儿 ✓。
 *
 * **其余的进这里** ✓：用户不点破就会一直不知道 ✓ ⇒ ⇒ 该说一声 ✓。
 *
 * **`storage-write-failed` 在这里** ✓：**草稿落盘是唯一的存放处** ✓（§2.1 ✓）
 * ⇒ ⇒ 它没存住 ⇒ ⇒ **用户必须知道** ✓ ⇒ ⇒ 它是自动发生的 ✓（§6.4 ✓）
 * ⇒ ⇒ 没有按钮能补救它 ✓ ⇒ ⇒ 只能靠这一声 ✓。
 */
const NOTIFYING: ReadonlySet<MessageCategory> = new Set<MessageCategory>([
  'unhandled',
  'rejection',
  'worker',
  'export-failed',
  'export-blocked',
  'save-failed',
  'storage-write-failed',
]);

/** 这个类别要不要发一条通知 ✓。 */
export function notifiesUser(category: MessageCategory): boolean {
  return NOTIFYING.has(category);
}

/**
 * **一次告知多久自己走** ✓ ⇒ ⇒ 通知面与导入结果面**共用这一个数** ✓ ⇒ ⇒
 * 两处不会一个快一个慢 ✓ ⇒ ⇒ 一处改了两处一起改 ✓。
 */
export const NOTICE_AUTO_HIDE_MS = 10000;

/**
 * **哪些消息要人确认才算完** ✓。
 *
 * **错误类一律留着** ✓ ⇒ ⇒ 用户不点破就会一直不知道 ✓ ⇒ ⇒ 它不能定时自己走 ✓ ⇒ ⇒
 * 它等一个确认 ✓（设计 §8 ✓）。
 *
 * **其余的照旧** ✓：定时消失 ✓ ⇒ ⇒ 一次告知就是一次告知 ✓ ⇒ ⇒
 * **成功与信息不留着** ✓ ⇒ ⇒ 不打断正在做的事 ✓。
 *
 * **一处规则** ✓ ⇒ ⇒ 通知面与导入结果面问的是同一句 ✓ ⇒ ⇒ 不会一边留一边走 ✓。
 */
export function needsAcknowledgement(category: MessageCategory | undefined): boolean {
  return category !== undefined;
}

/**
 * 通知的存放处 ✓。
 *
 * **为什么不是组件里的状态** ✓：失败可能发生在**应用挂载之前** ✓（启动期 ✓）
 * ⇒ ⇒ 放组件里会丢 ✓ ⇒ ⇒ 放这里就留住 ✓ ⇒ ⇒ 挂载时读一次就看得见 ✓。
 * ⇒ ⇒ **一个地方** ✓ ⇒ ⇒ 谁都能推一条 ✓ ⇒ ⇒ 不用一路传回调 ✓。
 */
export class NoticeStore {
  private items: readonly Notice[] = [];
  private readonly listeners = new Set<() => void>();
  private counter = 0;
  private handles = 0;

  /**
   * 诊断 id：**短、稳定、可复述** ✓（`e-3` ✓）。
   *
   * **本次运行内的计数** ✓ ⇒ ⇒ 同一个问题在这一次运行里始终是同一个 id ✓
   * ⇒ ⇒ 用户念得出来 ✓ ⇒ ⇒ 不是跨运行的指纹 ✓（那需要原文或脱敏摘要 ✓ ⇒ ⇒ 基座排除了 ✓）。
   */
  nextDiagnosticId(): string {
    this.counter += 1;
    return 'e-' + this.counter;
  }

  /**
   * 推一条 ✓：**id 由这里给** ✓ ⇒ ⇒ 调用方不用管它 ✓ ⇒ ⇒ 诊断 id 是另一件事 ✓
   * ⇒ ⇒ 它只对失败有意义 ✓ ⇒ ⇒ 成功那条不带它 ✓。
   */
  push(notice: Omit<Notice, 'id'>): string {
    this.handles += 1;
    const id = 'n-' + this.handles;
    this.items = [...this.items, {...notice, id}];
    this.emit();
    return id;
  }

  /**
   * 关掉 ✓：**先开始退场** ✓ ⇒ ⇒ 淡出动画走完才真的没 ✓。
   *
   * **为什么分两段** ✓：直接删掉就没有退场动画 ✓ ⇒ ⇒ 用户看不见那条消息是怎么走的 ✓。
   */
  dismiss(id: string): void {
    let changed = false;
    const next = this.items.map((item) => {
      if (item.id !== id || item.leaving) return item;
      changed = true;
      return {...item, leaving: true};
    });
    if (!changed) return;
    this.items = next;
    this.emit();
  }

  /** 退场完了 ✓：真的收走 ✓。 */
  remove(id: string): void {
    const next = this.items.filter((item) => item.id !== id);
    if (next.length === this.items.length) return;
    this.items = next;
    this.emit();
  }

  clear(): void {
    if (this.items.length === 0) return;
    this.items = [];
    this.emit();
  }

  list = (): readonly Notice[] => this.items;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

/** 通知的存放处 ✓（应用里一份 ✓）。 */
export const noticeStore = new NoticeStore();
