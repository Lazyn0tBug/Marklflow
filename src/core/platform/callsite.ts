/**
 * **定位串** ✓：**我们代码里的位置** ✓ ⇒ ⇒ 日志能指出是哪儿 ✓ ⇒ ⇒
 * 下一次同样的事看日志就够 ✓ ⇒ ⇒ 不必再开控制台找那一行 ✓（基座 §5.2 ✓）。
 *
 * **只认我们自己的构建产物** ✓ ⇒ ⇒ 别的来源的帧一律不取 ✓ ⇒ ⇒
 * 一个 `file://` 的用户路径**不会进日志** ✓ ⇒ ⇒ 那句"不含用户数据"从此是**约束** ✓。
 */

/**
 * 那个文件是不是我们自己的构建产物 ✓。
 *
 * **应用总是跑在 http(s) 上** ✓ ⇒ ⇒ 我们构建产物的帧就是 http(s) 的 URL ✓ ⇒ ⇒
 * 别的 scheme 一定不是我们的 ✓ ⇒ ⇒ 跳过它 ✓。
 */
export function isOurBuildUrl(file: string): boolean {
  return file.startsWith('http://') || file.startsWith('https://');
}

/**
 * **什么算"我们自己的"** ✓ ⇒ ⇒ 默认按构建产物算 ✓ ⇒ ⇒ 别的来源的帧一律不取 ✓。
 *
 * **它是一个接缝** ✓ ⇒ ⇒ 测试的栈是 `file://` ⇒ ⇒ 默认那一条在测试里看不到定位串 ✓ ⇒ ⇒
 * 测试换掉它才看得见 ✓ ⇒ ⇒ 生产那一套不动 ✓。
 */
let ourMatcher: (file: string) => boolean = isOurBuildUrl;

/** 换掉判法 ✓ ⇒ ⇒ 只给测试用 ✓ ⇒ ⇒ 用完换回去 ✓。 */
export function setOurMatcher(next: (file: string) => boolean): void {
  ourMatcher = next;
}

/**
 * 栈里**属于我们**的那一帧 ✓ ⇒ ⇒ **文件 + 行** ✓。
 *
 * @param stack 那个栈 ✓。
 * @param skip **跳过开头几帧** ✓ ⇒ ⇒ 跳过"就是它自己"那一帧 ✓ ⇒ ⇒
 *   落在**调用它的那一处**身上 ✓ ⇒ ⇒ 定位不会指着捕获器自己 ✓。
 * @param isOurs 什么算"我们的" ✓：默认按构建产物算 ✓ ⇒ ⇒ 测试可以换成别的判法 ✓。
 */
export function ourFrame(
  stack: string | undefined,
  skip = 0,
  isOurs: (file: string) => boolean = ourMatcher,
): string | undefined {
  if (!stack) return undefined;
  let seen = 0;
  for (const line of stack.split('\n')) {
    const match = /\(?([^()\s]+):(\d+):(\d+)\)?\s*$/.exec(line.trim());
    if (!match) continue;
    seen += 1;
    if (seen <= skip) continue;
    const file = match[1];
    if (!file || !isOurs(file)) continue;
    return `${file}:${match[2]}`;
  }
  return undefined;
}
