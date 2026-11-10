import type {DocumentRecord} from '../../core/model/document';
import type {DocumentFileContexts, FileReference} from './documentFileContext';
import type {SaveTargetDiskPorts} from './documentSaveTo';

/**
 * 另存为 ✓（设计 §6.2 ✓、§4.3 ✓）。
 *
 * **它住在应用层** ✓ ⇒ ⇒ 规则能被单测盯住 ✓ ⇒ ⇒ 不必起浏览器、不必开桌面外壳 ✓。
 * **宿主只给端口** ✓ ⇒ ⇒ 平台差异留在平台那一侧 ✓ ⇒ ⇒ 这里只有规则 ✓。
 *
 * **它是一次转移** ✓（§4.3 `save-as` ✓）⇒ ⇒ **不是"改指绑定"** ✓ ⇒ ⇒ 产生**另一个文档** ✓
 * ⇒ ⇒ 旧文档不受影响 ✓ ⇒ ⇒ 两边互不相关 ✓。
 */

/**
 * **磁盘那一半** ✓ ⇒ ⇒ 平台给得了 ✓ ⇒ ⇒ **两端各一套实现** ✓ ⇒ ⇒ 差异落在实现上 ✓。
 *
 * **Web 侧没有** ✓ ⇒ ⇒ 答不了就抛 ✓ ⇒ ⇒ **Web 的另存为走导出下载** ✓ ⇒ ⇒ 那一条不在这个菜单里 ✓（§8.2 ✓）。
 *
 * **它就是"写到新目标"那一个包** ✓ ⇒ ⇒ 一次事实一处存放 ✓ ⇒ ⇒ **两条流程共用** ✓
 * ⇒ ⇒ **另存为**（新文档 ✓）与**写到新目标**（这一份 ✓）的磁盘那一半相同 ✓（§6.2 ✓、§8.2 ✓）。
 */
export type SaveAsDiskPorts = SaveTargetDiskPorts;

/** 端口 ✓（宿主给实现 ✓）。 */
export interface DocumentSaveAsPorts extends SaveAsDiskPorts {
  /**
   * **建一个新文档** ✓：**新 id** ✓ ⇒ ⇒ 另一个文档 ✓ ⇒ ⇒ 内容取**冻结的那一份** ✓（§6.2 ✓）。
   *
   * **修订由应用层钉** ✓ ⇒ ⇒ 宿主给什么修订不算数 ✓ ⇒ ⇒ **只记录实际写出的冻结修订** ✓（§4.3 ✓）。
   */
  createDocument(source: DocumentRecord): Promise<DocumentRecord>;
}

/** 另存为的结果 ✓。 */
export type SaveAsResult =
  /** 用户取消 ✓ ⇒ ⇒ **不是失败** ✓ ⇒ ⇒ 什么都没变 ✓（§9 ✓）。 */
  | {kind: 'cancelled'}
  /** **这个文件已经绑在别的文档上** ✓ ⇒ ⇒ **不抢** ✓ ⇒ ⇒ 放掉这次的句柄 ✓ ⇒ ⇒ **不写它** ✓（§5.1 ✓）。 */
  | {kind: 'already-bound'; documentId: string}
  /** 写不进去 ✓ ⇒ ⇒ **没新建文档** ✓ ⇒ ⇒ 旧文档不动 ✓。 */
  | {kind: 'failed'; error: unknown}
  /**
   * **写出去了，但读没有确认** ✓ ⇒ ⇒ **关联不成立** ✓ ⇒ ⇒ **没新建文档** ✓ ⇒ ⇒
   * **用户要知道那一句** ✓（§4.1 ✓、§8.5 ✓）。
   */
  | {kind: 'unconfirmed'}
  /** 读成功了 ✓ ⇒ ⇒ **新文档** ✓ ⇒ ⇒ 初始即已同步 ✓（§6.2 ✓、M5-5 ✓）。 */
  | {kind: 'saved'; document: DocumentRecord};

/** 一次另存为的请求 ✓：**冻结的那一份** ✓（§6.2 ✓）。 */
export interface SaveAsRequest {
  /** 冻结的源文档 ✓ ⇒ ⇒ **它的修订就是写出去的那一版** ✓ ⇒ ⇒ 之后编辑不影响这次 ✓。 */
  document: DocumentRecord;
  /** 冻结的源快照 ✓：**草稿与文件写的是同一份字节** ✓ ⇒ ⇒ 两者不会差一个按键 ✓。 */
  bytes: Uint8Array;
  /** 建议的文件名 ✓：**文件名规则复用导出契约** ✓ ⇒ ⇒ 宿主给 ✓（§6.2 ✓）。 */
  suggestedName: string;
}

/**
 * 另存为 ✓（设计 §6.2 ✓、§4.3 的 `save-as` 转移 ✓）。
 *
 * **旧文档一个字不动** ✓ ⇒ ⇒ 它继续同步它自己的文件 ✓ ⇒ ⇒ 两边互不相关 ✓。
 *
 * **新文档初始即已同步** ✓ ⇒ ⇒ `lastSyncedRevision` = 写出的修订 ✓ ⇒ ⇒ 那条不变式由这里保证 ✓。
 */
export class DocumentSaveAs {
  constructor(
    private readonly contexts: DocumentFileContexts,
    private readonly ports: DocumentSaveAsPorts,
  ) {}

  /**
   * **一次另存为** ✓ ⇒ ⇒ 四种结果从这里出 ✓。
   *
   * **先写文件，再建文档** ✓（§6.2 的次序 ✓）⇒ ⇒ 写不进去 ⇒ ⇒ **没有文档可建** ✓
   * ⇒ ⇒ 旧文档与上下文都不动 ✓。
   */
  async saveAs(request: SaveAsRequest): Promise<SaveAsResult> {
    const {document: source, bytes} = request;
    let target: FileReference | undefined;
    try {
      target = await this.ports.selectTarget(request.suggestedName);
    } catch (error) {
      return {kind: 'failed', error};
    }
    // **用户取消** ✓ ⇒ ⇒ 没有句柄 ✓ ⇒ ⇒ **无任何状态变化** ✓ ⇒ ⇒ **不是失败** ✓（§6.2 ✓、§9 ✓）。
    if (target === undefined) return {kind: 'cancelled'};

    // **这个文件已经开着** ✓ ⇒ ⇒ **不抢** ✓ ⇒ ⇒ 不写它 ✓ ⇒ ⇒ 放掉这次的句柄 ✓（§5.1 ✓）。
    // **在写之前问** ✓ ⇒ ⇒ 不写进去才没有话说 ✓ ⇒ ⇒ 两个文档不会指同一个文件 ✓。
    const bound = this.contexts.documentFor(target.reference);
    if (bound !== undefined) {
      await this.ports.releaseHandle(target.handle).catch(() => {});
      return {kind: 'already-bound', documentId: bound};
    }

    try {
      await this.ports.write(target.handle, bytes);
    } catch (error) {
      // **写不进去** ⇒ ⇒ 这个授权没有用途 ⇒ ⇒ 放掉它 ✓ ⇒ ⇒ 原生侧不留凭据 ✓（§5.1 ✓）。
      await this.ports.releaseHandle(target.handle).catch(() => {});
      return {kind: 'failed', error};
    }

    // **写成功 ⇒ ⇒ 接着读** ✓ ⇒ ⇒ **关联始终基于读成功** ✓ ⇒ ⇒ **写成功不是关联** ✓（§4.1 ✓）。
    const present = await this.readTarget(target.handle);
    if (present !== true) {
      // **读没有确认** ⇒ ⇒ **关联不成立** ✓ ⇒ ⇒ **不新建文档** ✓ ⇒ ⇒
      // **用户要知道那一句** ✓（§8.5 ✓）。
      await this.ports.releaseHandle(target.handle).catch(() => {});
      return {kind: 'unconfirmed'};
    }

    let created: DocumentRecord;
    try {
      created = await this.ports.createDocument(source);
    } catch (error) {
      await this.ports.releaseHandle(target.handle).catch(() => {});
      return {kind: 'failed', error};
    }

    // **修订钉在冻结的那一版** ✓ ⇒ ⇒ **只记录实际写出的冻结修订** ✓（§4.3 ✓、M5-12 ✓）
    // ⇒ ⇒ 另存期间继续编辑 ⇒ ⇒ **那一次编辑不算进这次写回** ✓ ⇒ ⇒ 仍然是未同步 ✓。
    const doc: DocumentRecord = {...created, revision: source.revision};
    // **读成功了才绑定新文件** ✓ ⇒ ⇒ **旧文档的绑定一个字不动** ✓ ⇒ ⇒ 两边互不相关 ✓。
    this.contexts.saveAs(doc.id, target, doc.revision, present);
    return {kind: 'saved', document: doc};
  }

  /**
   * **那个目标还在吗** ✓ ⇒ ⇒ **答不上就是没读成功** ✓ ⇒ ⇒ **不拿旧值冒充新值** ✓
   * ⇒ ⇒ **不猜** ✓ ⇒ ⇒ **关联因此不成立** ✓（§4.1 ✓、§8.2 ✓）。
   */
  private async readTarget(handle: string): Promise<boolean | undefined> {
    try {
      return await this.ports.targetPresent(handle);
    } catch {
      return undefined;
    }
  }
}
