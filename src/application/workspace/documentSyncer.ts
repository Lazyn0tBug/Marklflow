import type {DocumentRecord, SourceFormat} from '../../core/model/document';
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

/**
 * 写回的那一种 ✓：**普通写回**比"应用手上那一版" ✓；**覆盖写回**比"用户看到的那一版" ✓（§6.1 ✓）。
 *
 * **"继续"那一种** ✓ ⇒ ⇒ 基准不变 ✓ ⇒ ⇒ **只是目标允许不存在** ✓ ⇒ ⇒
 * **用户说了继续** ✓ ⇒ ⇒ **其余复核照旧** ✓ ⇒ ⇒ **复核没有变松** ✓（§6.1 ✓）。
 */
export type WriteIntent = 'sync' | 'overwrite' | 'continue';

/**
 * 写回的结果 ✓：**那是目标的状态** ✓ ⇒ ⇒ 原生侧归类 ✓ ⇒ ⇒ 这里只说发生了什么 ✓。
 *
 * **五个状态各有一个处理** ✓ ⇒ ⇒ **按状态选处理** ✓ ⇒ ⇒
 * **不是每个状态各写一堆逻辑** ✓ ⇒ ⇒ **检测与处理分开** ✓（§6.1 ✓）。
 *
 * **目标又变了** ✓ ⇒ ⇒ 它引发一次新的分流 ✓ ⇒ ⇒ **不是失败** ✓（§8.6 ✓）。
 * **目标没了** ✓ ⇒ ⇒ **提示是否继续** ✓ ⇒ ⇒ **不是失败** ✓。
 * **写不进去** ✓ ⇒ ⇒ **提示是否另存** ✓ ⇒ ⇒ **不是失败** ✓。
 * **授权没了** ✓ ⇒ ⇒ **与写不进去同一支** ✓ ⇒ ⇒ **不是失败** ✓。
 */
export type WriteOutcome =
  | {kind: 'written'}
  | {kind: 'target-changed'}
  | {kind: 'missing'}
  | {kind: 'unwritable'}
  | {kind: 'invalid'}
  | {kind: 'failed'; error: unknown};

/** 冲突时问的那一次 ✓：对话框要说的那几句 ✓。 */
export interface ConflictRequest {
  documentId: string;
  revision: number;
  displayName: string;
}

/**
 * 写回的结果 ✓（§6.5 的五种 ✓）：**每一项都落在上下文的一个变化上** ✓。
 *
 * **`written` 与 `reloaded` 各合两件事** ✓ ⇒ ⇒ 区别只在**基准**或**有没有人在场** ✓
 * ⇒ ⇒ 而**问的那一方自己知道** ✓ ⇒ ⇒ **反馈要分清** ⇒ ⇒ 结果里带上问过没有、问了什么 ✓。
 *
 * **只有五种** ✓ ⇒ ⇒ **没有"未尝试"** ✓ ⇒ ⇒ 那是**草稿那边**的事 ✓ ⇒ ⇒
 * **草稿与写回不接成一个流程** ✓ ⇒ ⇒ 草稿没存住不决定写回的结果 ✓（§6.1 ✓）。
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
  | {kind: 'written'; revision: number}
  | {kind: 'reloaded'; revision: number}
  | {kind: 'cancelled'}
  | {kind: 'failed'; error: unknown};

/**
 * 一次写回的结果 ✓：**只说文件那一句** ✓（§6.5 ✓）。
 *
 * **草稿那一维不在这里** ✓ ⇒ ⇒ 草稿那边**自己报它自己** ✓ ⇒ ⇒ **它是常驻状态** ✓
 * ⇒ ⇒ 反馈不同时说两件事 ✓（§8.4 ✓）。
 */
export interface SyncOutcome {
  documentId: string;
  revision: number;
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
 * **磁盘那一半** ✓ ⇒ ⇒ 平台给得了 ✓ ⇒ ⇒ **两端各一套实现** ✓
 * ⇒ ⇒ 差异落在**实现**上 ✓ ⇒ ⇒ 不是落在调用点上 ✓（§6.5 ✓）。
 *
 * **Web 侧没有** ✓ ⇒ ⇒ 那三个答不了就抛 ✓ ⇒ ⇒ **整条同步逻辑在 Web 形态下不跑** ✓（§6.5 ✓）。
 */
export interface SyncDiskPorts {
  /** 磁盘上那份还是应用手上那一版吗 ✓（§3.1 ✓）：答不了就抛 ✓。 */
  sameVersion(handle: string): Promise<boolean>;
  /**
   * **那个目标还在吗** ✓（§3.1 ✓、§8.2 ✓）：答不了就抛 ✓。
   *
   * **只回是或不是** ✓ ⇒ ⇒ 目标没了 ⇒ ⇒ 回"否" ✓ ⇒ ⇒ **不是报错** ✓
   * ⇒ ⇒ 那是**关联的有效性** ✓ ⇒ ⇒ **每一次写之后都问一次** ✓ ⇒ ⇒ **写完成的定义里含着它** ✓。
   */
  targetPresent(handle: string): Promise<boolean>;
  /**
   * 把这批字节写进去 ✓。
   *
   * **两种写回、两个基准** ✓ ⇒ ⇒ `intent` 表达"这次是覆盖" ✓ ⇒ ⇒ 前端仍拿不到摘要值 ✓（§6.1 ✓）。
   */
  write(handle: string, bytes: Uint8Array, intent: WriteIntent): Promise<WriteOutcome>;
  /**
   * 磁盘上那份现在是什么 ✓（反向同步要它 ✓）。
   *
   * **读回来的是源快照** ✓ ⇒ ⇒ **可编辑 HTML 要解出载荷** ✓ ⇒ ⇒ 草稿里是正文不是 HTML ✓
   * ⇒ ⇒ **载荷类型由绑定给出** ✓ ⇒ ⇒ 端口不必自己猜 ✓（§6.1 ✓）。
   */
  read(handle: string, format: SourceFormat): Promise<string>;
}

/**
 * **门没过 ⇒ ⇒ 问哪一句** ✓（§6.1 ✓）。
 *
 * **两条分支各问一句** ✓ ⇒ ⇒ **目标没了 ⇒ ⇒ 问要不要继续** ✓ ⇒ ⇒
 * **写不进去 ⇒ ⇒ 问要不要另存** ✓ ⇒ ⇒ **答的是"是/否"** ✓ ⇒ ⇒ **下一步由应用层选** ✓。
 */
export type GateReason = 'missing' | 'unwritable';

/**
 * 端口 ✓（宿主给实现 ✓）。
 *
 * **与磁盘打交道的那几个在 `SyncDiskPorts`** ✓ ⇒ ⇒ 平台层只组装那一个包 ✓
 * ⇒ ⇒ **另外两个两端一样或有宿主** ✓ ⇒ ⇒ 问用户、反向同步回填 ✓。
 *
 * **落草稿不在这里** ✓ ⇒ ⇒ **草稿与写回不接成一个流程** ✓ ⇒ ⇒
 * 草稿那边**自己报它自己** ✓（§6.1 ✓、§6.5 ✓）。
 */
export interface DocumentSyncPorts extends SyncDiskPorts {
  /** 冲突时问一次 ✓：三个选择 ✓（§6.1 ✓）。 */
  decide(request: ConflictRequest): Promise<ConflictChoice>;
  /** 反向同步：把文件的当前内容放进草稿 ✓ ⇒ ⇒ 交回落定后的修订 ✓。 */
  applyPulled(documentId: string, markdown: string): Promise<number>;
  /**
   * **门没过 ⇒ ⇒ 问用户一次** ✓（§6.1 ✓）。
   *
   * **只答"是/否"** ✓ ⇒ ⇒ **下一步由应用层选** ✓ ⇒ ⇒ **宿主只管把那句话说出来** ✓。
   */
  askGate(reason: GateReason): Promise<boolean>;
  /**
   * **换目标** ✓：**宿主把这一份写到新目标** ✓ ⇒ ⇒ **那边再过一次门** ✓ ⇒ ⇒
   * **答的是"写成了没有"** ✓（§6.1 ✓）。
   *
   * **绑定在那边读成功之后才成立** ✓ ⇒ ⇒ 这里不重复记 ✓（§4.1 ✓）。
   */
  saveElsewhere(request: {document: DocumentRecord; bytes: Uint8Array}): Promise<WriteBackResult>;
}

/** 一次同步绑定的那一份 ✓：**回填前要核对它** ✓（§6.1 ✓）。 */
interface Binding {
  reference: string;
  handle: string;
  /** 载荷类型 ✓ ⇒ ⇒ 读回来的是哪一种源快照 ✓（§6.1 ✓）。 */
  format: SourceFormat;
}

/**
 * 应用层同步 ✓（设计 §6.5 ✓、§17 的 M5-b1 ✓）。
 *
 * **草稿与写回不接成一个流程** ✓ ⇒ ⇒ 草稿那边**自己报它自己** ✓ ⇒ ⇒
 * **写回不保证草稿已落盘** ✓ ⇒ ⇒ **没有"草稿没存住所以没试"这种结果** ✓（§6.1 ✓）。
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
   * **一次写回** ✓ ⇒ ⇒ **结果只说文件那一句** ✓（§6.5 ✓）。
   *
   * **冻结** ✓：文档 ID、修订、待写字节与绑定在入口取好 ✓ ⇒ ⇒ 之后的改动不影响这一次 ✓。
   */
  async save(request: SyncRequest): Promise<SyncOutcome> {
    const {document: doc, bytes} = request,
      documentId = doc.id,
      revision = doc.revision;

    // **冻结** ✓：绑定在入口取好 ✓ ⇒ ⇒ **换绑发生在这次写期间也要被看见** ✓
    // ⇒ ⇒ 绑定实例标识在入口就记下 ✓（§6.1 ✓）。
    const context = this.contexts.read(documentId);
    const binding: Binding | undefined =
      context === undefined
        ? undefined
        : {
            reference: context.file.reference,
            handle: context.file.handle,
            format: context.file.sourceFormat,
          };

    // **没有同步目标** ✓ ⇒ ⇒ 那一步记为**不适用** ✓（§6.5 ✓）⇒ ⇒ **一个磁盘端口都不问** ✓
    // ⇒ ⇒ Web 形态就是这样：那里没有绑定 ⇒ ⇒ 整条同步逻辑不跑 ✓（§6.5 ✓）
    // ⇒ ⇒ **界面那一层已经把入口灰掉了** ✓（§8.2 ✓）⇒ ⇒ 这里只报事实 ✓。
    if (binding === undefined) return {documentId, revision, writeBack: {kind: 'not-applicable'}};

    return this.serialize(binding.reference, async () => {
      const {writeBack, conflict} = await this.writeBack(doc, bytes, binding);
      return {documentId, revision, writeBack, conflict};
    });
  }

  /**
   * **写回的那一步** ✓ ⇒ ⇒ **五种结果从这里出** ✓。
   *
   * **问原生侧一句** ✓ ⇒ ⇒ 是 ⇒ ⇒ 正向写回 ✓；否 ⇒ ⇒ 文件被外部改过 ✓ ⇒ ⇒ 再看草稿改没改 ✓。
   * **目标又变了** ⇒ ⇒ 重新分流 ✓ ⇒ ⇒ 不静默覆盖 ✓（§6.1 ✓、§8.6 ✓）。
   */
  private async writeBack(
    doc: DocumentRecord,
    bytes: Uint8Array,
    binding: Binding,
  ): Promise<{writeBack: WriteBackResult; conflict?: ConflictChoice | undefined}> {
    const documentId = doc.id,
      revision = doc.revision;
    for (;;) {
      let same: boolean;
      try {
        same = await this.ports.sameVersion(binding.handle);
      } catch (error) {
        const failed = this.failed(documentId, binding, error);
        // **门没通过 ⇒ ⇒ 写没开始** ✓ ⇒ ⇒ **也要有那一次读** ✓ ⇒ ⇒
        // **目标没了就答"不在"** ✓ ⇒ ⇒ 关联的有效性因此由读判断给 ✓ ⇒ ⇒ **不是失败推出来的** ✓。
        await this.verifyTarget(documentId, binding);
        return {writeBack: failed};
      }

      if (same) {
        const outcome = await this.write(binding, bytes, 'sync');
        // **按状态选处理** ✓ ⇒ ⇒ **一个状态一个分支** ✓ ⇒ ⇒
        // **检测在原生侧，处理在这里** ✓ ⇒ ⇒ **两件事分开** ✓（§6.1 ✓）。
        switch (outcome.kind) {
          case 'written': {
            this.applied(documentId, binding, () =>
              this.contexts.markWritten(documentId, revision),
            );
            // **写完了 ⇒ ⇒ 跟一次验证读** ✓ ⇒ ⇒ 关联的有效性由它刷新 ✓（§6.1 ✓）。
            await this.verifyTarget(documentId, binding);
            return {writeBack: {kind: 'written', revision}};
          }
          // **目标在问答之后又变了** ⇒ ⇒ 重新分流 ✓ ⇒ ⇒ 回到上面那一句 ✓。
          case 'target-changed':
            continue;
          // **目标没了** ⇒ ⇒ **提示是否继续** ✓ ⇒ ⇒ 是 ⇒ ⇒ **再进写检测** ✓（§6.1 ✓）。
          case 'missing':
            return this.handleMissing(doc, bytes, binding);
          // **写不进去** ⇒ ⇒ **提示是否另存** ✓ ⇒ ⇒ 是 ⇒ ⇒ 换目标 ⇒ ⇒ **再进写检测** ✓（§6.1 ✓）。
          case 'unwritable':
          case 'invalid':
            return this.handleUnwritable(doc, bytes, binding);
          default: {
            const failed = this.failed(documentId, binding, outcome.error);
            // **写不进去 ⇒ ⇒ 也要有那一次读** ✓ ⇒ ⇒ 有效性不来自失败 ✓（§8.2 ✓）。
            await this.verifyTarget(documentId, binding);
            return {writeBack: failed};
          }
        }
      }

      // **文件被外部改过** ✓ ⇒ ⇒ 分叉那一次 ✓ ⇒ ⇒ **三个选择** ✓ ⇒ ⇒
      // **规则只有一处** ✓ ⇒ ⇒ 门的那一条也走它 ✓（§6.1 ✓）。
      return this.handleConflict(doc, bytes, binding);
    }
  }

  /**
   * **目标没了** ⇒ ⇒ **提示是否继续** ✓（§6.1 ✓）。
   *
   * **用户说继续** ⇒ ⇒ **再进写检测** ✓ ⇒ ⇒ 这一次**允许目标不存在** ✓ ⇒ ⇒
   * **其余复核照旧** ✓ ⇒ ⇒ **门没有变松** ✓ ⇒ ⇒ **重进一次不会让门变松** ✓。
   *
   * **每一次重进之前都有一次用户的选择** ✓ ⇒ ⇒ **它不会自己转起来** ✓ ⇒ ⇒ **不需要计数器** ✓。
   *
   * **用户说不** ⇒ ⇒ **放弃** ✓ ⇒ ⇒ **两边都不动** ✓ ⇒ ⇒ 结果是失败 ✓ ⇒ ⇒
   * **那一次读照旧要问** ✓ ⇒ ⇒ 关联的有效性因此由读判断给 ✓。
   */
  private async handleMissing(
    doc: DocumentRecord,
    bytes: Uint8Array,
    binding: Binding,
  ): Promise<{writeBack: WriteBackResult; conflict?: ConflictChoice | undefined}> {
    const documentId = doc.id,
      revision = doc.revision;
    for (;;) {
      const proceed = await this.ports.askGate('missing');
      if (!proceed) {
        const failed = this.failed(documentId, binding, new Error('那个文件已经不在了'));
        await this.verifyTarget(documentId, binding);
        return {writeBack: failed};
      }
      // **再进写检测** ✓ ⇒ ⇒ 这一次**允许目标不存在** ✓ ⇒ ⇒ 其余复核照旧 ✓。
      const outcome = await this.write(binding, bytes, 'continue');
      if (outcome.kind === 'written') {
        this.applied(documentId, binding, () => this.contexts.markWritten(documentId, revision));
        await this.verifyTarget(documentId, binding);
        return {writeBack: {kind: 'written', revision}};
      }
      // **它回来了而且变了** ⇒ ⇒ 那是冲突 ✓ ⇒ ⇒ 交给用户决定 ✓。
      if (outcome.kind === 'target-changed') return this.handleConflict(doc, bytes, binding);
      // **写不进去** ⇒ ⇒ 那一支 ✓ ⇒ ⇒ 提示是否另存 ✓。
      if (outcome.kind === 'unwritable' || outcome.kind === 'invalid')
        return this.handleUnwritable(doc, bytes, binding);
      // **又没了** ⇒ ⇒ **再问一次** ✓ ⇒ ⇒ 每一次重进之前都有一次用户的选择 ✓。
      if (outcome.kind === 'missing') continue;
      const failed = this.failed(documentId, binding, outcome.error);
      await this.verifyTarget(documentId, binding);
      return {writeBack: failed};
    }
  }

  /**
   * **写不进去** ⇒ ⇒ **提示是否另存** ✓（§6.1 ✓）。
   *
   * **用户说是** ⇒ ⇒ **换目标** ✓ ⇒ ⇒ 宿主把这一份写到新目标 ✓ ⇒ ⇒
   * **那边再过一次门** ✓ ⇒ ⇒ **绑定在读成功之后才成立** ✓（§4.1 ✓）。
   *
   * **用户说不** ⇒ ⇒ **放弃** ✓ ⇒ ⇒ 草稿不动 ✓ ⇒ ⇒ 结果是失败 ✓。
   */
  private async handleUnwritable(
    doc: DocumentRecord,
    bytes: Uint8Array,
    binding: Binding,
  ): Promise<{writeBack: WriteBackResult; conflict?: ConflictChoice | undefined}> {
    const documentId = doc.id;
    const proceed = await this.ports.askGate('unwritable');
    if (!proceed) {
      const failed = this.failed(documentId, binding, new Error('那个文件写不进去了'));
      await this.verifyTarget(documentId, binding);
      return {writeBack: failed};
    }
    // **换目标** ✓ ⇒ ⇒ **那边再过一次门** ✓ ⇒ ⇒ 答的是"写成了没有" ✓。
    const outcome = await this.ports.saveElsewhere({document: doc, bytes});
    if (outcome.kind === 'written') {
      // **那边读成功了 ⇒ ⇒ 关联就成立** ✓ ⇒ ⇒ 那边自己记好了 ✓ ⇒ ⇒ 这里不重复记 ✓（§4.1 ✓）。
      await this.verifyTarget(documentId, binding);
      return {writeBack: outcome};
    }
    const failed = this.failed(documentId, binding, new Error('换到新目标也没写成'));
    await this.verifyTarget(documentId, binding);
    return {writeBack: failed};
  }

  /**
   * **分叉了那一次** ✓ ⇒ ⇒ 三个选择 ✓ ⇒ ⇒ **草稿没改就反向同步** ✓（§6.1 ✓）。
   */
  private async handleConflict(
    doc: DocumentRecord,
    bytes: Uint8Array,
    binding: Binding,
  ): Promise<{writeBack: WriteBackResult; conflict?: ConflictChoice | undefined}> {
    const documentId = doc.id,
      revision = doc.revision;
    // **草稿自上次同步后没改** ⇒ ⇒ 那不是冲突，是一次更新 ✓ ⇒ ⇒ **没有人在场** ✓。
    const baseline = this.contexts.read(documentId)?.sync.lastSyncedRevision;
    if (baseline === revision) return {writeBack: await this.reload(documentId, binding)};
    const choice = await this.ports.decide({
      documentId,
      revision,
      displayName: this.contexts.read(documentId)?.file.displayName ?? '',
    });
    if (choice === 'cancel') return {writeBack: {kind: 'cancelled'}, conflict: choice};
    if (choice === 'reload')
      return {writeBack: await this.reload(documentId, binding), conflict: choice};
    // **覆盖 = 正向写回** ✓ ⇒ ⇒ 带基准复核在端口内部 ✓（§6.1 ✓）。
    const outcome = await this.write(binding, bytes, 'overwrite');
    if (outcome.kind === 'written') {
      this.applied(documentId, binding, () => this.contexts.markWritten(documentId, revision));
      await this.verifyTarget(documentId, binding);
      return {writeBack: {kind: 'written', revision}, conflict: choice};
    }
    if (outcome.kind === 'target-changed') return this.handleConflict(doc, bytes, binding);
    if (outcome.kind === 'missing') return this.handleMissing(doc, bytes, binding);
    if (outcome.kind === 'unwritable' || outcome.kind === 'invalid')
      return this.handleUnwritable(doc, bytes, binding);
    const failed = this.failed(documentId, binding, outcome.error);
    await this.verifyTarget(documentId, binding);
    return {writeBack: failed};
  }

  /**
   * **写完之后跟一次验证读** ✓ ⇒ ⇒ **"那个目标还在吗"** ✓（§6.1 ✓、§8.2 ✓）。
   *
   * **写完成的定义里含着它** ✓ ⇒ ⇒ **关联的有效性由它刷新** ✓ ⇒ ⇒
   * **不是写的结果** ✓ ⇒ ⇒ **写失败时也照常刷** ✓ ⇒ ⇒ ⇒ **写失败不产生新的一类** ✓。
   *
   * **答不上就跳过** ✓ ⇒ ⇒ **不拿旧值冒充新值** ✓ ⇒ ⇒ **也不让这次写因此失败** ✓
   * ⇒ ⇒ **上一次读到的判断留在那里** ✓ ⇒ ⇒ **过期了就等下一次碰到它才知道** ✓。
   */
  private async verifyTarget(documentId: string, binding: Binding): Promise<void> {
    let present: boolean;
    try {
      present = await this.ports.targetPresent(binding.handle);
    } catch {
      // **答不了 ⇒ ⇒ 不知道** ✓ ⇒ ⇒ **不猜** ✓ ⇒ ⇒ 上一次读到的判断留着 ✓。
      return;
    }
    this.applied(documentId, binding, () => this.contexts.markTargetPresent(documentId, present));
  }

  /**
   * **写回** ✓：**端口抛了就当失败** ✓ ⇒ ⇒ 一次失败不会甩出这次保存 ✓。
   *
   * **端口自己答"目标又变了"** ✓ ⇒ ⇒ 那不是失败 ✓ ⇒ ⇒ 重新分流 ✓（§8.6 ✓）。
   */
  private async write(
    binding: Binding,
    bytes: Uint8Array,
    intent: WriteIntent,
  ): Promise<WriteOutcome> {
    try {
      return await this.ports.write(binding.handle, bytes, intent);
    } catch (error) {
      return {kind: 'failed', error};
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
      content = await this.ports.read(binding.handle, binding.format);
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
