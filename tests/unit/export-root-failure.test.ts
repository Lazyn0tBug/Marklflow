import {it, expect, vi, beforeEach, afterEach} from 'vitest';
import {resolveExportRoot} from '../../src/core/platform/exportRoot';
import {reportAsync} from '../../src/core/platform/failures';
import {isOurBuildUrl, setOurMatcher} from '../../src/core/platform/callsite';

/**
 * 原生读取失败时，那次失败**有类别、有定位** ✓ ⇒ ⇒ 不是一句笼统的"出了个拒绝" ✓。
 *
 * **原生命令失败拒绝的是字符串** ✓ ⇒ ⇒ 没有栈 ✓ ⇒ ⇒ 定位只能由**调用点**给 ✓ ⇒ ⇒
 * 失败出口替它补上 ✓ ⇒ ⇒ 日志因此说得清是哪儿、是什么事 ✓。
 */

const native = vi.hoisted(() => ({isTauri: vi.fn(), invoke: vi.fn()}));
vi.mock('@tauri-apps/api/core', () => ({
  isTauri: native.isTauri,
  invoke: native.invoke,
}));

beforeEach(() => {
  vi.resetAllMocks();
  native.isTauri.mockReturnValue(true);
  // **原生拒绝的是字符串** ✓ ⇒ ⇒ 与"栈不可用"分得开 ✓。
  native.invoke.mockRejectedValue('command not allowed');
  setOurMatcher((file) => file.includes('/src/') || file.includes('/tests/'));
});

afterEach(() => {
  setOurMatcher(isOurBuildUrl);
});

it('reports the failure with its category and a locator, and leaves no unhandled rejection', async () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  try {
    reportAsync('export-failed', resolveExportRoot());
    await vi.waitFor(() => expect(native.invoke).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    // **没有未处理的拒绝** ✓ ⇒ ⇒ 不会再有那种笼统的 rejection ✓。
    expect(unhandled).toHaveLength(0);
    await vi.waitFor(() =>
      expect(native.invoke.mock.calls.some(([command]) => command === 'log_event')).toBe(true),
    );
    const payload = String(
      native.invoke.mock.calls.find(([command]) => command === 'log_event')?.[1]?.payload,
    );
    // **类别说清是什么事** ✓ ⇒ ⇒ 日志直接答 ✓。
    expect(payload).toContain('export-failed');
    // **定位说清在哪儿** ✓ ⇒ ⇒ 不用再开控制台找那一行 ✓。
    expect(payload).toContain('source');
    expect(payload).toContain('export-root-failure.test.ts');
    // **原文仍然不进载荷** ✓ ⇒ ⇒ 用户数据不落日志 ✓。
    expect(payload).not.toContain('command not allowed');
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
});
