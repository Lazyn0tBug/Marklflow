/**
 * 文档与磁盘的关系 ✓：**一份上下文** ✓（设计 §4.1 ✓）。
 *
 * **两个面** ✓：文件（file ✓）／ 一致性（sync ✓）
 * ⇒ ⇒ 上下文是一次转移带来的字段变化 ✓ ⇒ ⇒ 不是一袋字段 ✓。
 * **没有资源面** ✓ ⇒ ⇒ M6 还没实施 ✓ ⇒ ⇒ 应用层不留一个用不上的面 ✓（《概念裁剪》§1 ✓）
 * ⇒ ⇒ M6 实施时再加进来 ✓ ⇒ ⇒ 那时它的规则在《本地资源支持设计》里 ✓。
 *
 * **它不进文档** ✓ ⇒ ⇒ 文档记录会作为载荷外传 ✓ ⇒ ⇒ 本机路径不跟着走 ✓（§4.2 ✓）。
 * **它不落盘** ✓ ⇒ ⇒ 重启后绑定不恢复 ✓ ⇒ ⇒ 文件引用也随之作废 ✓（§3.3 ✓）。
 *
 * **上下文里没有摘要** ✓ ⇒ ⇒ 磁盘上是什么由原生侧回答 ✓（§3.4 ✓）
 * ⇒ ⇒ 少一份会漂的副本 ✓ ⇒ ⇒ 少一次误判 ✓。
 */

import type {SourceFormat} from '../../core/model/document';

/**
 * 文件引用 ✓（file 面 ✓）：这个文档对应磁盘上的哪个文件 ✓。
 *
 * **两个不透明串** ✓ ⇒ ⇒ 应用层一个也读不懂 ✓ ⇒ ⇒ 路径不参与 ✓。
 */
export interface FileReference {
  /** 文件引用 ✓：原生侧给的随机 token ✓ ⇒ ⇒ 同一个文件同一个 ✓ ⇒ ⇒ **归属按它定** ✓。 */
  reference: string;
  /** 访问句柄 ✓ ⇒ ⇒ 读与写都用它 ✓ ⇒ ⇒ 前端拿它反推不出路径 ✓。 */
  handle: string;
  /** 文件名 ✓：原生侧给的 ✓ ⇒ ⇒ 只用于展示 ✓。 */
  displayName: string;
  /** 人类可读的定位串 ✓：**可选** ✓ ⇒ ⇒ 只是展示 ✓ ⇒ ⇒ 不作标识 ✓ ⇒ ⇒ 不用于寻址 ✓。 */
  displayPath?: string | undefined;
  /** 这个文件按哪种载荷读进来的 ✓ ⇒ ⇒ 界面据此决定标题区怎么写 ✓。 */
  sourceFormat: SourceFormat;
  /**
   * **那个目标还在吗** ✓：**读判断给的答案** ✓（§8.2 ✓）。
   *
   * **只有原生侧答得了** ✓ ⇒ ⇒ 应用侧只是**存下那个答案** ✓ ⇒ ⇒ **不是自己判的** ✓（§1.2 ✓）
   * ⇒ ⇒ **不是摘要那种副本** ✓（§3.4 ✓）。
   *
   * **每一次写之后都跟一次验证读** ✓ ⇒ ⇒ **每次写完都刷新** ✓ ⇒ ⇒ **写失败时也刷新** ✓
   * ⇒ ⇒ ⇒ **关联的有效性不来自写的成败** ✓（§6.1 ✓）。
   *
   * **undefined = 还没失效过** ✓ ⇒ ⇒ 按有效处理 ✓ ⇒ ⇒ 它是**点时事实** ✓
   * ⇒ ⇒ 没有后台监视 ⇒ ⇒ 过期了就等下一次碰到它才知道 ✓（§13 ✓）。
   */
  targetPresent?: boolean | undefined;
}

/** 一致性 ✓（sync 面 ✓）：草稿与文件差多少 ✓。 */
export interface SyncState {
  /**
   * 上次同步到文件时的文档修订 ✓。
   *
   * **null = 无法证明一致** ✓ ⇒ ⇒ 按未同步显示 ✓（§2.3 ✓、§4.3 re-associate ✓）。
   */
  lastSyncedRevision: number | null;
  /**
   * 上一次写回没成功 ✓（§2.2 的"同步失败" ✓、§6.5 的 `failed` ✓）。
   *
   * **只有写回失败才有** ✓ ⇒ ⇒ **取消不算失败** ✓ ⇒ ⇒ 成功写回或反向同步把它清掉 ✓。
   */
  failure: null | {kind: 'write-failed'};
}

/** 上下文 ✓：一个文档与磁盘的关系 ✓。 */
export interface DocumentFileContext {
  /** 这个上下文属于哪个文档 ✓。 */
  documentId: string;
  /** 文件面 ✓。 */
  file: FileReference;
  /** 一致性面 ✓。 */
  sync: SyncState;
}

/**
 * 界面读的那一个状态 ✓（§2.2 ✓、§8.6 ✓）。
 *
 * **五种说法** ✓ ⇒ ⇒ 派生顺序按 §2.3 ✓：**先问有没有同步目标** ✓ ⇒ ⇒ 没有就是 `none` ✓；
 * **再问那个目标还在不在** ✓ ⇒ ⇒ 读判断答"不在" ⇒ ⇒ `target-missing` ✓（**不撒谎** ✓）；
 * **再问上一次写回是不是失败了** ✓ ⇒ ⇒ 是就是 `failed` ✓（**失败优先于基线** ✓）；
 * **最后比基线** ✓ ⇒ ⇒ 相等 `synced` ✓、不等 `unsynced` ✓。
 */
export type SyncStatus = 'none' | 'target-missing' | 'synced' | 'unsynced' | 'failed';

/** 打开的结果 ✓：要么新绑定 ✓，要么这个文件已经绑在别处 ✓。 */
export type OpenOutcome =
  | {kind: 'bound'; context: DocumentFileContext}
  | {kind: 'already-bound'; documentId: string};

/**
 * 上下文与它的转移 ✓（设计 §4.1、§4.3 ✓）。
 *
 * **它是会话内状态** ✓ ⇒ ⇒ 不进文档 ✓ ⇒ ⇒ 不落盘 ✓。
 * **一个事实一处存放** ✓ ⇒ ⇒ 文件引用到文档的索引也在这里 ✓ ⇒ ⇒ 别处不再存一份 ✓。
 */
export class DocumentFileContexts {
  private readonly byDocument = new Map<string, DocumentFileContext>();
  /** 文件引用 → 文档 ✓：聚焦靠它 ✓（§5.2 ✓、§5.3 归属按引用 ✓）。 */
  private readonly byReference = new Map<string, string>();

  /** 这个上下文 ✓。 */
  read(documentId: string): DocumentFileContext | undefined {
    return this.byDocument.get(documentId);
  }

  /** 这个文件绑在哪个文档上 ✓ ⇒ ⇒ 没有就是 undefined ✓。 */
  documentFor(reference: string): string | undefined {
    return this.byReference.get(reference);
  }

  /** 现在绑着的上下文 ✓。 */
  list(): readonly DocumentFileContext[] {
    return [...this.byDocument.values()];
  }

  /**
   * **打开** ✓（§4.3 open ✓）。
   *
   * **读**：选择结果 ✓、文档当前修订 ✓。
   * **写**：绑定就位 ✓、`lastSyncedRevision = revision` ✓。
   * **不变量**：**打开不同步** ✓ ⇒ ⇒ 不读盘覆盖草稿 ✓。
   *
   * **基线由调用方给** ✓ ⇒ ⇒ 新建时给修订 ✓ ⇒ ⇒ 命中已有内容时按内容是否相同给修订或 null ✓（§2.3 ✓）。
   *
   * **绑定是这次读建立的** ✓ ⇒ ⇒ **打开就是一次读** ✓ ⇒ ⇒ 读成功了 ⇒ ⇒ **关联成立** ✓
   * ⇒ ⇒ **关联始终基于读成功** ✓ ⇒ ⇒ **写成功不是关联** ✓（§4.1 ✓）。
   *
   * **同一文件已绑在这个文档上 ⇒ ⇒ 换用这次的句柄** ✓ ⇒ ⇒ **不是"改绑"** ✓ ⇒ ⇒
   * 那个动作本来就不存在 ✓（§4.1 ✓、§16 ✓）。
   * **绑在别的文档上 ⇒ ⇒ 不抢** ✓ ⇒ ⇒ 交回去让调用方聚焦那个标签页 ✓。
   */
  open(documentId: string, file: FileReference, revision: number | null): OpenOutcome {
    const existing = this.byReference.get(file.reference);
    if (existing !== undefined && existing !== documentId)
      return {kind: 'already-bound', documentId: existing};
    const context: DocumentFileContext = {
      documentId,
      // **打开就是一次读** ✓ ⇒ ⇒ 读成功了 ⇒ ⇒ **那个文件在** ✓ ⇒ ⇒ 有效性为真 ✓。
      file: {...file, targetPresent: file.targetPresent ?? true},
      sync: {lastSyncedRevision: revision, failure: null},
    };
    this.byDocument.set(documentId, context);
    this.byReference.set(file.reference, documentId);
    return {kind: 'bound', context};
  }

  /**
   * **另存为** ✓（§4.3 `save-as` ✓、§6.2 ✓）。
   *
   * **读**：新文档 id、选中的文件、写出的修订 ✓、**读判断的答案** ✓。
   * **写**：file 就位 ✓、`lastSyncedRevision` = 写出的修订 ✓、`failure` 清掉 ✓。
   * **不变量**：**旧文档不受影响** ✓ ⇒ ⇒ 旧文档继续同步它自己的文件 ✓ ⇒ ⇒ 两边互不相关 ✓。
   *
   * **新文档初始即已同步** ✓ ⇒ ⇒ 基线 = 写出的修订 ✓ ⇒ ⇒ 那一行说"已同步" ✓（§6.2 ✓、M5-5 ✓）。
   *
   * **它不是"改指绑定"** ✓ ⇒ ⇒ 旧文档的 file 与基线一个字不动 ✓ ⇒ ⇒ 两个文档两个文件 ✓。
   */
  saveAs(
    documentId: string,
    file: FileReference,
    revision: number,
    present: boolean,
  ): DocumentFileContext {
    return this.bind(documentId, file, revision, present);
  }

  /**
   * **写到新目标** ✓（§8.2 ✓）：**这一份**绑上那个文件 ✓。
   *
   * **关联基于读成功** ✓ ⇒ ⇒ **写成功不是关联** ✓ ⇒ ⇒ **写之后那次读成功了才是** ✓
   * ⇒ ⇒ **没有"改绑"这个动作** ✓（§4.1 ✓）。
   *
   * **草稿一个字不动** ✓ ⇒ ⇒ 这一份还是这一份 ✓ ⇒ ⇒ 基线 = 写出的那一版 ✓ ⇒ ⇒ 初始即已同步 ✓。
   */
  bindTo(
    documentId: string,
    file: FileReference,
    revision: number,
    present: boolean,
  ): DocumentFileContext {
    return this.bind(documentId, file, revision, present);
  }

  /**
   * **绑定一个文件** ✓：**两种入口同一个动作** ✓ ⇒ ⇒ 规则只有一处 ✓ ⇒ ⇒
   * **另存为**（新文档 ✓）与**写到新目标**（这一份 ✓）共用它 ✓。
   *
   * **`present` 是读判断的答案** ✓ ⇒ ⇒ **调用方必须先读成功** ✓ ⇒ ⇒
   * **关联始终基于读成功** ✓ ⇒ ⇒ **写成功不是关联** ✓（§4.1 ✓）。
   */
  private bind(
    documentId: string,
    file: FileReference,
    revision: number,
    present: boolean,
  ): DocumentFileContext {
    const context: DocumentFileContext = {
      documentId,
      // **有效性来自那次读** ✓ ⇒ ⇒ 不是"写成功了所以它在" ✓（§8.2 ✓）。
      file: {...file, targetPresent: present},
      sync: {lastSyncedRevision: revision, failure: null},
    };
    this.byDocument.set(documentId, context);
    this.byReference.set(file.reference, documentId);
    return context;
  }

  /**
   * **写回成功** ✓（§4.3 sync ✓、§6.5 `written` ✓）。
   *
   * **读**：写出的冻结修订 ✓。
   * **写**：`lastSyncedRevision` = 该修订 ✓；`failure` 清掉 ✓（成功就是没有失败 ✓）。
   * **不变量**：**草稿不动** ✓ ⇒ ⇒ 只记基线 ✓。
   */
  markWritten(documentId: string, revision: number): void {
    const context = this.byDocument.get(documentId);
    if (context === undefined) return;
    context.sync = {lastSyncedRevision: revision, failure: null};
  }

  /**
   * **反向同步成功** ✓（§4.3 pull ✓、§6.5 `reloaded` ✓）。
   *
   * **写**：`lastSyncedRevision` = 草稿取的那一版 ✓；`failure` 清掉 ✓。
   * **不变量**：**不能记作已写回** ✓ ⇒ ⇒ 它是这一条自己的转移 ✓。
   */
  markPulled(documentId: string, revision: number): void {
    const context = this.byDocument.get(documentId);
    if (context === undefined) return;
    context.sync = {lastSyncedRevision: revision, failure: null};
  }

  /**
   * **写回失败** ✓（§6.5 `failed` ✓）。
   *
   * **写**：`failure` 写下 ✓。
   * **不变量**：**草稿不动** ✓ ⇒ ⇒ **绑定不变** ✓ ⇒ ⇒ 基线不变 ✓ ⇒ ⇒ 仍是未同步 ✓。
   */
  markFailed(documentId: string): void {
    const context = this.byDocument.get(documentId);
    if (context === undefined) return;
    context.sync = {...context.sync, failure: {kind: 'write-failed'}};
  }

  /**
   * **刷新"那个目标还在吗"** ✓ ⇒ ⇒ **那是读判断的答案** ✓ ⇒ ⇒ 应用侧只存它 ✓（§8.2 ✓）。
   *
   * **每一次写之后都调** ✓ ⇒ ⇒ **写成功与写失败都刷** ✓ ⇒ ⇒
   * **关联的有效性不来自写的成败** ✓ ⇒ ⇒ **不是失败推出来的** ✓。
   *
   * **只改这一个字段** ✓ ⇒ ⇒ 绑定不变 ✓ ⇒ ⇒ 基线不变 ✓ ⇒ ⇒ 草稿不动 ✓。
   */
  markTargetPresent(documentId: string, present: boolean): void {
    const context = this.byDocument.get(documentId);
    if (context === undefined) return;
    context.file = {...context.file, targetPresent: present};
  }

  /**
   * **关掉** ✓：上下文连同它的文件索引一起收走 ✓。
   *
   * **返回绑定** ✓ ⇒ ⇒ 调用方拿它去放掉句柄 ✓ ⇒ ⇒ 放掉这一步在应用层编排 ✓（§14 ✓）。
   */
  release(documentId: string): FileReference | undefined {
    const context = this.byDocument.get(documentId);
    if (context === undefined) return undefined;
    this.byDocument.delete(documentId);
    this.byReference.delete(context.file.reference);
    return context.file;
  }
}

/**
 * **关掉文档 ⇒ ⇒ 句柄也放掉** ✓（M4-8 ✓）。
 *
 * **为什么在这里** ✓：关闭标签页是应用层的事 ✓ ⇒ ⇒ 原生句柄由应用层放掉 ✓
 * ⇒ ⇒ 这条规则有一处 ✓ ⇒ ⇒ 能被单测盯住 ✓（不必起浏览器 ✓）。
 */
export async function releaseDocumentFileContext(
  contexts: DocumentFileContexts,
  documentId: string,
  releaseHandle: (handle: string) => Promise<void>,
): Promise<void> {
  const binding = contexts.release(documentId);
  if (binding === undefined) return;
  await releaseHandle(binding.handle);
}

/**
 * 界面读的那一个状态 ✓（§2.2 ✓、§8.6 ✓）。
 *
 * **界面不自己判断** ✓ ⇒ ⇒ 只读这里派生出来的 ✓ ⇒ ⇒ 各处不各判一遍 ✓。
 *
 * **派生按这个顺序问** ✓（§2.3 ✓）：
 *
 * 1. **有没有同步目标** ✓ ⇒ ⇒ 没有就是 `none` ✓（那一行整行不显示 ✓）。
 * 2. **上一次写回是不是失败了** ✓ ⇒ ⇒ 是就是 `failed` ✓ ⇒ ⇒ **失败优先于基线** ✓
 *    ⇒ ⇒ 失败时即便基线恰好相等也不说"已同步" ✓ ⇒ ⇒ 因为文件里确实没有那一版 ✓。
 * 3. **比基线** ✓：当前修订 ≠ `lastSyncedRevision` ⇒ ⇒ `unsynced` ✓ ⇒ ⇒ 相等 `synced` ✓。
 *
 * **未同步的判定** ✓：当前修订 ≠ `lastSyncedRevision` ✓（§2.3 ✓）
 * ⇒ ⇒ 与会话里那份 `dirty` 同形 ✓ ⇒ ⇒ 不另造第二套"脏"语义 ✓。
 */
export function syncStatus(context: DocumentFileContext | undefined, revision: number): SyncStatus {
  if (context === undefined) return 'none';
  // **那个目标不在了** ✓ ⇒ ⇒ **说清为什么保存灰着** ✓ ⇒ ⇒ **不撒谎** ✓（§8.2 ✓）。
  // ⇒ ⇒ **这是读判断给的** ✓ ⇒ ⇒ **不是写失败推出来的** ✓。
  if (context.file.targetPresent === false) return 'target-missing';
  // **取消不算失败** ✓ ⇒ ⇒ 它不写这个字段 ✓ ⇒ ⇒ 这里只看写回失败 ✓。
  if (context.sync.failure !== null) return 'failed';
  if (context.sync.lastSyncedRevision === null) return 'unsynced';
  return context.sync.lastSyncedRevision === revision ? 'synced' : 'unsynced';
}
