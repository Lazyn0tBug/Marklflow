import type {DocumentRecord} from '../../core/model/document';
import type {DocumentFileContexts} from './documentFileContext';

/**
 * 应用层同步 ✓（设计 §6.5 ✓）。
 *
 * **规则在这儿** ✓ ⇒ ⇒ 不必起浏览器、不必开桌面外壳就能盯住 ✓ ⇒ ⇒ 与 `documentOpen.ts` 同一范式 ✓。
 * **宿主只给端口** ✓ ⇒ ⇒ 平台差异留在平台那一侧 ✓ ⇒ ⇒ **应用层不判 `isTauri`** ✓。
 *
 * **冲突不是状态** ✓ ⇒ ⇒ 三个选择是**这一次操作里的一次提问** ✓ ⇒ ⇒ 三个答案各落到一项写回结果上 ✓
 * ⇒ ⇒ 上下文里不留"待用户决定" ✓（§4.1 ✓）。
 */

/**
 * 冲突时问的那一句 ✓：三个选择 ✓（§6.1 ✓）。
 *
 * **重载不是自动反向同步** ✓ ⇒ ⇒ **自动的那次没有人在场** ✓ ⇒ ⇒ 本地没有改动可丢 ✓；
 * **重载是有人交出了自己的改动** ✓ ⇒ ⇒ **反馈必须说"本地改动不保留"** ✓ ⇒ ⇒ 两个词不能混 ✓。
 */
export type ConflictChoice = 'overwrite' | 'reload' | 'cancel';

/** 写回的那一种 ✓：**普通写回**比"应用手上那一版" ✓；**覆盖写回**比"用户看到的那一版" ✓（§6.1 ✓）。 */
export type WriteIntent = 'sync' | 'overwrite';

/**
 * 写回的结果 ✓：**只有端口这一层知道机器码** ✓ ⇒ ⇒ 这里只说发生了什么 ✓。
 *
 * **目标又变了** ✓ ⇒ ⇒ 它引发一次新的分流 ✓ ⇒ ⇒ **不是失败** ✓（§8.6 ✓）。
 */
export type WriteOutcome =
  | {kind: 'written'}
  | {kind: 'target-changed'}
  | {kind: 'failed'; error: unknown};

/** 冲突时问的那一次 ✓：对话框要说的那几句 ✓。 */
export interface ConflictRequest {
  documentId: string;
  revision: number;
  displayName: string;
}

/**
 * 写回的结果 ✓（§6.5 的六种 ✓）：**每一项都落在上下文的一个变化上** ✓。
 *
 * **`written` 与 `reloaded` 各合两件事** ✓ ⇒ ⇒ 区别只在**基准**或**有没有人在场** ✓
 * ⇒ ⇒ 而**问的那一方自己知道** ✓ ⇒ ⇒ **反馈要分清** ⇒ ⇒ 结果里带上问过没有、问了什么 ✓。
 */
export type WriteBackResult =
  | {
      /**
       * **没有同步目标** ✓ ⇒ ⇒ 写回**不适用** ✓ ⇒ ⇒ **入口已经灰掉** ✓（§8.2 ✓）
       * ⇒ ⇒ **走不到这一步** ✓ ⇒ ⇒ 只剩"渲染时还有目标、点击时已经没了"这一支 ✓。
       *
       * **不提示** ✓ ⇒ ⇒ 不需要问要不要另存 ✓ ⇒ ⇒ 那是界面那一层的事 ✓（§2.1 ✓）。
       */
      kind: 'not-applicable';
    }
  | {kind: 'not-attempted'}
  | {kind: 'written'; revision: number}
  | {kind: 'reloaded'; revision: number}
  | {kind: 'cancelled'}
  | {kind: 'failed'; error: unknown};

/** 草稿的结果 ✓：**与写回结果分开记** ✓（§6.5 ✓）。 */
export type DraftResult = {kind: 'saved'} | {kind: 'failed'; error: unknown};

/** 一次保存的结果 ✓：**两项分开** ✓ ⇒ ⇒ 反馈能同时说清草稿与文件 ✓。 */
export interface SyncOutcome {
  documentId: string;
  revision: number;
  draft: DraftResult;
  writeBack: WriteBackResult;
  /**
   * **问过没有、问了什么** ✓：**只有问过才有** ✓ ⇒ ⇒ 没有就 undefined ✓。
   *
   * **它分清两件反馈必须分开的事** ✓ ⇒ ⇒ 用户选重载 ⇒ ⇒ **本地改动不保留，要说** ✓；
   * 自动反向同步 ⇒ ⇒ **没有本地改动可丢，不说** ✓。
   */
  conflict?: ConflictChoice | undefined;
}

/** 一次保存的请求 ✓：**冻结的那一份** ✓（§6.1 ✓）。 */
export interface SyncRequest {
  /** 冻结的文档 ✓：**文档 ID 与修订从这里来** ✓ ⇒ ⇒ 之后编辑器的改动不影响这次保存 ✓。 */
  document: DocumentRecord;
  /** 待写字节 ✓：冻结的那一份 ✓ ⇒ ⇒ 草稿与文件不会差一个按键 ✓。 */
  bytes: Uint8Array;
}

/**
 * 端口 ✓（宿主给实现 ✓）。
 *
 * **与磁盘打交道的那三个** ✓（§6.5 ✓）⇒ ⇒ Web 侧没有 ⇒ ⇒ 抛 ✓ ⇒ ⇒ **整条同步逻辑在 Web 形态下不跑** ✓；
 * **落草稿、问用户、反向同步回填** ✓ ⇒ ⇒ 这三样两端一样或有宿主 ⇒ ⇒ 不在这张表里 ✓。
 */
export interface DocumentSyncPorts {
  /** 落草稿 ✓（IndexedDB ✓）：失败就抛 ✓ ⇒ ⇒ 写回记为**未尝试** ✓（§6.5 ✓）。 */
  persistDraft(doc: DocumentRecord): Promise<void>;
  /** 磁盘上那份还是应用手上那一版吗 ✓（§3.1 ✓）：答不了就抛 ✓。 */
  sameVersion(handle: string): Promise<boolean>;
  /**
   * 把这批字节写进去 ✓。
   *
   * **两种写回、两个基准** ✓ ⇒ ⇒ `intent` 表达"这次是覆盖" ✓ ⇒ ⇒ 前端仍拿不到摘要值 ✓（§6.1 ✓）。
   */
  write(handle: string, bytes: Uint8Array, intent: WriteIntent): Promise<WriteOutcome>;
  /** 磁盘上那份现在是什么 ✓（反向同步要它 ✓）。 */
  read(handle: string): Promise<string>;
  /** 冲突时问一次 ✓：三个选择 ✓（§6.1 ✓）。 */
  decide(request: ConflictRequest): Promise<ConflictChoice>;
  /** 反向同步：把文件的当前内容放进草稿 ✓ ⇒ ⇒ 交回落定后的修订 ✓。 */
  applyPulled(documentId: string, markdown: string): Promise<number>;
}

/** 一次同步绑定的那一份 ✓：**回填前要核对它** ✓（§6.1 ✓）。 */
interface Binding {
  reference: string;
  handle: string;
}

/**
 * 应用层同步 ✓（设计 §6.5 ✓、§17 的 M5-b1 ✓）。
 *
 * **先草稿，后同步** ✓ ⇒ ⇒ 草稿失败 ⇒ ⇒ 写回记为**未尝试** ✓ ⇒ ⇒ 不同步一份没存住的草稿 ✓。
 * **对同一目标串行** ✓ ⇒ ⇒ 两个保存不会交错写同一个文件 ✓。
 * **按文档 ID 回填** ✓ ⇒ ⇒ 切换标签页期间完成的同步只更新它自己的那个文档 ✓ ⇒ ⇒ 不串到当前标签页 ✓。
 */
export class DocumentSyncer {
  /** 同一目标的排队 ✓：**按文件引用** ✓ ⇒ ⇒ 同一个文件的两次保存不会交错 ✓。 */
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(
    private readonly contexts: DocumentFileContexts,
    private readonly ports: DocumentSyncPorts,
  ) {}

  /**
   * **一次保存** ✓ ⇒ ⇒ 两项结果分开记 ✓（§6.5 ✓）。
   *
   * **冻结** ✓：文档 ID、修订、待写字节与绑定在入口取好 ✓ ⇒ ⇒ 之后的改动不影响这一次 ✓。
   */
  async save(request: SyncRequest): Promise<SyncOutcome> {
    const {document: doc, bytes} = request,
      documentId = doc.id,
      revision = doc.revision;

    // **冻结** ✓：绑定与草稿落盘一起取 ✓ ⇒ ⇒ **重新关联发生在落盘期间也要被看见** ✓
    // ⇒ ⇒ 绑定实例标识在入口就记下 ✓（§6.1 ✓）。
    const context = this.contexts.read(documentId);
    const binding: Binding | undefined =
      context === undefined
        ? undefined
        : {reference: context.file.reference, handle: context.file.handle};

    // **草稿先** ✓ ⇒ ⇒ 草稿失败 ⇒ ⇒ 本次保存结束 ✓ ⇒ ⇒ 写回记为**未尝试** ✓。
    try {
      await this.ports.persistDraft(doc);
    } catch (error) {
      return {
        documentId,
        revision,
        draft: {kind: 'failed', error},
        writeBack: {kind: 'not-attempted'},
      };
    }

    // **没有同步目标** ✓ ⇒ ⇒ 那一步记为**不适用** ✓（§6.5 ✓）⇒ ⇒ **一个磁盘端口都不问** ✓
    // ⇒ ⇒ Web 形态就是这样：那里没有绑定 ⇒ ⇒ 整条同步逻辑不跑 ✓（§6.5 ✓）
    // ⇒ ⇒ **界面那一层已经把入口灰掉了** ✓（§8.2 ✓）⇒ ⇒ 这里只报事实 ✓。
    if (binding === undefined)
      return {documentId, revision, draft: {kind: 'saved'}, writeBack: {kind: 'not-applicable'}};

    return this.serialize(binding.reference, async () => {
      const {writeBack, conflict} = await this.writeBack(documentId, revision, bytes, binding);
      return {documentId, revision, draft: {kind: 'saved' as const}, writeBack, conflict};
    });
  }

  /**
   * **写回的那一步** ✓ ⇒ ⇒ 六种结果从这里出 ✓。
   *
   * **问原生侧一句** ✓ ⇒ ⇒ 是 ⇒ ⇒ 正向写回 ✓；否 ⇒ ⇒ 文件被外部改过 ✓ ⇒ ⇒ 再看草稿改没改 ✓。
   * **目标又变了** ⇒ ⇒ 重新分流 ✓ ⇒ ⇒ 不静默覆盖 ✓（§6.1 ✓、§8.6 ✓）。
   */
  private async writeBack(
    documentId: string,
    revision: number,
    bytes: Uint8Array,
    binding: Binding,
  ): Promise<{writeBack: WriteBackResult; conflict?: ConflictChoice | undefined}> {
    for (;;) {
      let same: boolean;
      try {
        same = await this.ports.sameVersion(binding.handle);
      } catch (error) {
        return {writeBack: this.failed(documentId, binding, error)};
      }

      if (same) {
        const outcome = await this.ports.write(binding.handle, bytes, 'sync');
        if (outcome.kind === 'written') {
          this.applied(documentId, binding, () => this.contexts.markWritten(documentId, revision));
          return {writeBack: {kind: 'written', revision}};
        }
        // **目标在问答之后又变了** ⇒ ⇒ 重新分流 ✓ ⇒ ⇒ 回到上面那一句 ✓。
        if (outcome.kind === 'target-changed') continue;
        return {writeBack: this.failed(documentId, binding, outcome.error)};
      }

      // **文件被外部改过** ✓ ⇒ ⇒ 草稿自上次同步后没改 ⇒ ⇒ 那不是冲突，是一次更新 ✓（§6.1 ✓）。
      const baseline = this.contexts.read(documentId)?.sync.lastSyncedRevision;
      // **自动反向同步** ✓ ⇒ ⇒ **没有人在场** ✓ ⇒ ⇒ **本地没有改动可丢** ✓ ⇒ ⇒ 不带 conflict ✓。
      if (baseline === revision) return {writeBack: await this.reload(documentId, binding)};

      const choice = await this.ports.decide({
        documentId,
        revision,
        displayName: this.contexts.read(documentId)?.file.displayName ?? '',
      });
      if (choice === 'cancel') return {writeBack: {kind: 'cancelled'}, conflict: choice};
      // **重载 = 反向同步** ✓ ⇒ ⇒ 文件胜出 ✓ ⇒ ⇒ **本地改动不保留** ✓ ⇒ ⇒ 结果是 `reloaded` ✓
      // ⇒ ⇒ **不能记作已写回** ✓ ⇒ ⇒ **带上 conflict** ✓ ⇒ ⇒ 反馈要说清那句 ✓。
      if (choice === 'reload')
        return {writeBack: await this.reload(documentId, binding), conflict: choice};

      // **覆盖 = 正向写回** ✓ ⇒ ⇒ 草稿胜出 ✓ ⇒ ⇒ 带基准复核在端口内部 ✓（§6.1 ✓）。
      const outcome = await this.ports.write(binding.handle, bytes, 'overwrite');
      if (outcome.kind === 'written') {
        this.applied(documentId, binding, () => this.contexts.markWritten(documentId, revision));
        return {writeBack: {kind: 'written', revision}, conflict: choice};
      }
      // **覆盖期间目标又变了** ⇒ ⇒ 重新提示而不是覆盖 ✓（§6.1 ✓、M5-19 ✓）。
      if (outcome.kind === 'target-changed') continue;
      return {writeBack: this.failed(documentId, binding, outcome.error)};
    }
  }

  /**
   * **草稿取文件的版本** ✓（§4.3 pull ✓）：基线跟着更新 ✓。
   *
   * **自动的那次与用户选重载的那次，结果一样** ✓ ⇒ ⇒ 合成一项 `reloaded` ✓
   * ⇒ ⇒ 区别只在有没有人在场 ✓ ⇒ ⇒ **由 `conflict` 那一栏分清** ✓ ⇒ ⇒ 反馈据此说 ✓。
   *
   * **失败不改草稿** ✓ ⇒ ⇒ 绑定不变 ✓ ⇒ ⇒ 基线不变 ✓。
   */
  private async reload(documentId: string, binding: Binding): Promise<WriteBackResult> {
    let content: string;
    try {
      content = await this.ports.read(binding.handle);
    } catch (error) {
      return this.failed(documentId, binding, error);
    }
    let revision: number;
    try {
      revision = await this.ports.applyPulled(documentId, content);
    } catch (error) {
      return this.failed(documentId, binding, error);
    }
    this.applied(documentId, binding, () => this.contexts.markPulled(documentId, revision));
    return {kind: 'reloaded', revision};
  }

  /**
   * **写回失败** ✓（§6.5 `failed` ✓）：**草稿不动** ✓ ⇒ ⇒ 绑定不变 ✓ ⇒ ⇒ 报**保存文件错误** ✓。
   *
   * **失败优先于基线** ✓ ⇒ ⇒ 基线不变 ✓ ⇒ ⇒ 界面要说失败，不说"已同步" ✓（§2.3 ✓）。
   */
  private failed(documentId: string, binding: Binding, error: unknown): WriteBackResult {
    this.applied(documentId, binding, () => this.contexts.markFailed(documentId));
    return {kind: 'failed', error};
  }

  /**
   * **回填前核对绑定** ✓（§6.1 ✓）：**失效结果只报告原目标的实际结果** ✓ ⇒ ⇒ 不能更新当前上下文 ✓。
   *
   * **重新关联或换文件之后** ⇒ ⇒ 这一次写回仍然只对它原来那个目标成立 ✓ ⇒ ⇒ 当前上下文不动 ✓。
   */
  private applied(documentId: string, binding: Binding, mutate: () => void): void {
    const context = this.contexts.read(documentId);
    if (context === undefined) return;
    if (context.file.reference !== binding.reference || context.file.handle !== binding.handle)
      return;
    mutate();
  }

  /**
   * **对同一目标串行** ✓ ⇒ ⇒ 两个保存不会交错写同一个文件 ✓。
   *
   * **前一个失败不挡住后一个** ✓ ⇒ ⇒ 队列记的是"已经跑完" ✓ ⇒ ⇒ 不是"成功" ✓。
   */
  private serialize<T>(target: string, task: () => Promise<T>): Promise<T> {
    const prior = this.queues.get(target) ?? Promise.resolve();
    const next = prior.then(task, task);
    const settled = next.catch(() => {});
    this.queues.set(target, settled);
    void settled.then(() => {
      if (this.queues.get(target) === settled) this.queues.delete(target);
    });
    return next;
  }
}
