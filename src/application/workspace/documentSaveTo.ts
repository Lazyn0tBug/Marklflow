import type {DocumentRecord} from '../../core/model/document';
import type {DocumentFileContexts, FileReference} from './documentFileContext';

/**
 * **写到新目标** ✓（设计 §6.2 ✓、§8.2 ✓）。
 *
 * **它是"保存"在关联为空时的那一次** ✓ ⇒ ⇒ 弹原生对话框 ✓ ⇒ ⇒ **文件名留空** ✓
 * ⇒ ⇒ 用户自己填 ✓ ⇒ ⇒ **写成功 ⇒ ⇒ 这一份就绑上那个文件** ✓（§8.2 ✓）。
 *
 * **它也是门那一条"换目标"** ✓ ⇒ ⇒ 不可写 ⇒ ⇒ 提示是否另存 ⇒ ⇒ **是** ⇒ ⇒ 换到这里 ✓
 * ⇒ ⇒ **再进写检测** ✓（§6.1 ✓）。
 *
 * **它住在应用层** ✓ ⇒ ⇒ 规则能被单测盯住 ✓ ⇒ ⇒ 宿主只给端口 ✓ ⇒ ⇒ **两端各一套实现** ✓。
 *
 * **绑定是写的副效应** ✓ ⇒ ⇒ 写成功才有绑定 ✓ ⇒ ⇒ **没有"改绑"这个动作** ✓（§4.1 ✓）。
 */

/**
 * **磁盘那一半** ✓ ⇒ ⇒ 平台给得了 ✓ ⇒ ⇒ **两端各一套实现** ✓ ⇒ ⇒ 差异落在实现上 ✓。
 *
 * **Web 侧没有** ✓ ⇒ ⇒ 答不了就抛 ✓ ⇒ ⇒ **整条写回逻辑在 Web 形态下不跑** ✓（§6.5 ✓）。
 */
export interface SaveTargetDiskPorts {
  /**
   * 选一个新目标 ✓：**用户取消 ⇒ undefined** ✓（§6.2 ✓）。
   *
   * **给出的是文件引用** ✓ ⇒ ⇒ 这一份绑的是**那个文件** ✓ ⇒ ⇒ 再次打开它聚焦这一份 ✓。
   */
  selectTarget(suggestedName: string): Promise<FileReference | undefined>;
  /**
   * 把这批字节写进去 ✓。
   *
   * **通用字节写入** ✓ ⇒ ⇒ **不是写回原文件那条路** ✓ ⇒ ⇒ 目标是**新选的** ✓ ⇒ ⇒ 那里没有基线 ✓
   * ⇒ ⇒ 无从复核 ✓ ⇒ ⇒ 而且**本来就要盖掉它** ✓ ⇒ ⇒ 用户在系统对话框里已经确认过 ✓（§6.2 ✓）。
   */
  write(handle: string, bytes: Uint8Array): Promise<void>;
  /** 放掉这一次的句柄 ✓ ⇒ ⇒ **没采用的授权不留着** ✓ ⇒ ⇒ 原生侧不留无主的凭据 ✓（§5.1 ✓）。 */
  releaseHandle(handle: string): Promise<void>;
  /**
   * **那个目标还在吗** ✓ ⇒ ⇒ **写完要问一次** ✓ ⇒ ⇒ **写完成的定义里含着它** ✓（§6.1 ✓）。
   *
   * **与同步那一句是同一个问答** ✓ ⇒ ⇒ 同一个原生命令 ✓ ⇒ ⇒ **但它归这条流程的端口** ✓
   * ⇒ ⇒ 两条流程各自拿自己那一份 ✓ ⇒ ⇒ **应用层不判平台** ✓。
   */
  targetPresent(handle: string): Promise<boolean>;
}

/** 端口 ✓（宿主给实现 ✓）。 */
export interface DocumentSaveToPorts extends SaveTargetDiskPorts {}

/** 写到新目标的结果 ✓。 */
export type SaveToResult =
  /** 用户取消 ✓ ⇒ ⇒ **不是失败** ✓ ⇒ ⇒ 什么都没变 ✓（§9 ✓）。 */
  | {kind: 'cancelled'}
  /** **这个文件已经绑在别的文档上** ✓ ⇒ ⇒ **不抢** ✓ ⇒ ⇒ **不写它** ✓（§5.1 ✓）。 */
  | {kind: 'already-bound'; documentId: string}
  /** 写不进去 ✓ ⇒ ⇒ **不建立关联** ✓ ⇒ ⇒ 这一份还在原地 ✓。 */
  | {kind: 'failed'; error: unknown}
  /**
   * **写出去了，但读没有确认** ✓ ⇒ ⇒ **关联不成立** ✓ ⇒ ⇒ 这一份还在原地 ✓
   * ⇒ ⇒ **用户要知道那一句** ✓（§4.1 ✓、§8.5 ✓）。
   */
  | {kind: 'unconfirmed'}
  /** 读成功了 ✓ ⇒ ⇒ **这一份绑上了那个文件** ✓ ⇒ ⇒ 初始即已同步 ✓（§6.2 ✓）。 */
  | {kind: 'saved'; revision: number};

/** 一次写到新目标的请求 ✓：**冻结的那一份** ✓（§6.2 ✓）。 */
export interface SaveToRequest {
  /** 冻结的源文档 ✓：**它的修订就是写出去的那一版** ✓ ⇒ ⇒ 之后编辑不影响这次 ✓。 */
  document: DocumentRecord;
  /** 冻结的源快照 ✓：**草稿与文件写的是同一份字节** ✓ ⇒ ⇒ 两者不会差一个按键 ✓。 */
  bytes: Uint8Array;
  /** 建议的文件名 ✓：**文件名规则复用导出契约** ✓ ⇒ ⇒ 宿主给 ✓（§6.2 ✓）。 */
  suggestedName: string;
}

/**
 * 写到新目标 ✓（设计 §6.2 ✓、§8.2 ✓）。
 *
 * **先写文件，再读一次，再建立关联** ✓（§6.2 的次序 ✓）⇒ ⇒ 写不进去 ⇒ ⇒ **没有关联可建** ✓
 * ⇒ ⇒ 这一份还在原地 ✓ ⇒ ⇒ 草稿一个字不动 ✓。
 *
 * **关联始终基于读成功** ✓ ⇒ ⇒ **写成功不是关联** ✓ ⇒ ⇒ 读没有确认 ⇒ ⇒ **没有关联** ✓
 * ⇒ ⇒ **不拿"写成功了所以它在"当答案** ✓（§4.1 ✓、§8.2 ✓）。
 */
export class DocumentSaveTo {
  constructor(
    private readonly contexts: DocumentFileContexts,
    private readonly ports: DocumentSaveToPorts,
  ) {}

  /**
   * **一次写到新目标** ✓ ⇒ ⇒ 四种结果从这里出 ✓。
   */
  async saveTo(request: SaveToRequest): Promise<SaveToResult> {
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
      // **读没有确认** ⇒ ⇒ **关联不成立** ✓ ⇒ ⇒ 这一份还在原地 ✓ ⇒ ⇒
      // **用户要知道文件写出去了、但没有关联** ✓ ⇒ ⇒ **说清那一句** ✓（§8.5 ✓）。
      await this.ports.releaseHandle(target.handle).catch(() => {});
      return {kind: 'unconfirmed'};
    }

    // **读成功了 ⇒ ⇒ 这一份绑上那个文件** ✓ ⇒ ⇒ **绑定是读的副效应** ✓ ⇒ ⇒
    // **基线 = 写出的那一版** ✓ ⇒ ⇒ 初始即已同步 ✓（§6.2 ✓）。
    const revision = source.revision;
    this.contexts.bindTo(source.id, target, revision, present);
    return {kind: 'saved', revision};
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
