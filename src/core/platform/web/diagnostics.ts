/**
 * **诊断行** ✓：给"偶发、难复现"的那类问题留证据 ✓。
 *
 * 业务的日志通道有**封闭词表** ✓ ⇒ ⇒ 没有自由正文 ✓ ⇒ ⇒ 这种流水账进不去 ✓
 * ⇒ ⇒ 它有自己的出口 ✓：一个**有界的环形缓冲** ✓ ⇒ ⇒ 出问题时把这一段
 * 取出来核对 ✓ ⇒ ⇒ 不必再复现一遍才能定位 ✓。
 *
 * **只放有界的东西** ✓：位置与事件名是字面量 ✓，细节是计数与状态 ✓，
 * **不带用户内容** ✓（文件名、标题、正文都不进这里 ✓）。
 */
const LIMIT = 40;
const lines: string[] = [];

/** 记一笔诊断 ✓：控制台一份（有界 ✓），环形缓冲一份 ✓。 */
export function diagnostic(scope: string, event: string, detail?: string | number): void {
  const line = scope + ' ' + event + (detail === undefined ? '' : ' ' + detail);
  lines.push(line);
  if (lines.length > LIMIT) lines.shift();
  console.info('[diag]', scope, event, detail === undefined ? '' : detail);
}

/**
 * 取最近的诊断行 ✓：出错时附在报告或断言消息里 ✓。
 *
 * **单行拼接** ✓ ⇒ ⇒ 日志基座要求的"每条记录一行"仍然成立 ✓。
 */
export function diagnosticTrace(): string {
  return lines.join(' | ');
}

/** 清空 ✓：一轮新的尝试从空开始 ✓。 */
export function resetDiagnosticTrace(): void {
  lines.length = 0;
}
