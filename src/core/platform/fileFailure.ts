import {messageText, type MessageParams} from '../../application/messages';

/**
 * **文件读写的失败** ✓：**一个标识空间** ✓。
 *
 * **原生侧与浏览器侧发的是同一批机器码** ✓ ⇒ ⇒ 应用只按码分流 ✓
 * ⇒ ⇒ **不必知道这个码是哪一端给的** ✓（§9 ✓）⇒ ⇒ 同一件事就是同一个标识 ✓
 * ⇒ ⇒ 这就是这一层要的幂等 ✓。
 *
 * **文案在共享表里一处给出** ✓ ⇒ ⇒ 两端不可能各写一句 ✓ ⇒ ⇒ 漂移无处生 ✓。
 */
export class FileFailure extends Error {
  /** 机器码 ✓：**两端同一批** ✓ ⇒ ⇒ 应用按它分流 ✓。 */
  readonly code: string;
  /** 原生侧给出的上限 ✓：**只有"超过大小上限"那一类有** ✓ ⇒ ⇒ 其余是没有 ✓。 */
  readonly limitBytes?: number | undefined;
  constructor(code: string, params?: MessageParams) {
    super(messageText(code, params));
    this.name = 'FileFailure';
    this.code = code;
    this.limitBytes = params?.limitBytes;
  }
}

/** 码 → 文案 ✓。认不出的码给通用的一句 ✓：不猜它意味着什么 ✓。 */
export function fileFailureMessage(code: string, params?: MessageParams): string {
  return messageText(code, params);
}
