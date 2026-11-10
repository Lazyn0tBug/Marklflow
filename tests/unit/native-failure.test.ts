import {it, expect} from 'vitest';
import {fileFailureMessage, FileFailure} from '../../src/core/platform/fileFailure';

/**
 * The native side reports a stable machine code; the words the user reads are mapped here, so
 * that they read the same on every platform.
 */
it('maps the native codes to words and keeps the code on the error', () => {
  expect(fileFailureMessage('native-source-denied')).toBe('当前窗口无权使用原生文件能力');
  expect(fileFailureMessage('native-target-missing')).toBe('文件已被移走或重命名');
  expect(fileFailureMessage('native-permission-denied')).toBe('没有权限访问这个文件');
  // 认不出的码给一句通用的话，不猜它意味着什么。
  expect(fileFailureMessage('native-something-new')).toBe('文件操作失败');
  // 不是用户造成的失败不给专门的话：机器码仍在错误对象上，给日志用。
  expect(fileFailureMessage('file-capability-mismatch')).toBe('文件操作失败');
  expect(fileFailureMessage('native-internal-failed')).toBe('文件操作失败');
  const error = new FileFailure('native-permission-denied');
  expect(error.code).toBe('native-permission-denied');
  expect(error.message).toBe('没有权限访问这个文件');
  expect(error instanceof Error).toBe(true);
});

it('carries the limit when the failure is about the size', () => {
  // **上限随标识一起走** ✓ ⇒ ⇒ 两端给的是同一个标识 + 同一个数 ✓（§8.5 ✓）。
  const error = new FileFailure('file-too-large', {limitBytes: 50 * 1024 * 1024});
  expect(error.code).toBe('file-too-large');
  expect(error.limitBytes).toBe(50 * 1024 * 1024);
  expect(error.message).toBe('文件超过 50MiB 的上限');
});
