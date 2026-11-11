import {it, expect, vi, beforeEach} from 'vitest';
import {reportFailure} from '../../src/core/platform/failures';
import {tauriMessagePort} from '../../src/core/platform/tauri/messages';
import {noticeStore} from '../../src/application/notices';

/**
 * The failure outlet: one report ⇒ the log, the console and (when the user has to know it) a
 * notice that carries the category and a diagnostic id, but never the raw text.
 */

const native = vi.hoisted(() => ({isTauri: vi.fn(), invoke: vi.fn()}));
vi.mock('@tauri-apps/api/core', () => ({
  isTauri: native.isTauri,
  invoke: (command: string, args?: Record<string, unknown>) =>
    command === 'get_runtime_prefs'
      ? Promise.resolve({exportRoot: 'web', nativePdfAvailable: true, logCallTimeoutMs: 20})
      : native.invoke(command, args),
}));

beforeEach(() => {
  vi.resetAllMocks();
  native.isTauri.mockReturnValue(false);
  native.invoke.mockResolvedValue(undefined);
  noticeStore.clear();
});

it('reports the failure and tells the user about it', async () => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  const id = await reportFailure({
    category: 'save-failed',
    detail: '磁盘满了',
    cause: new Error('磁盘满了'),
  });
  // 用户面：类别 ＋ 诊断 id ＋ 一句可行动的话 ✓，**没有原文** ✓。
  const notices = noticeStore.list();
  expect(notices).toHaveLength(1);
  expect(notices[0]?.message).toBe('保存失败，内容仍在工作区');
  expect(notices[0]?.category).toBe('save-failed');
  expect(notices[0]?.diagnosticId).toBe(id);
  expect(notices[0]?.message).not.toContain('磁盘满了');
  // 控制台：原文在 ✓（开发者看得到 ✓）。
  await vi.waitFor(() => expect(spy).toHaveBeenCalled());
  expect(spy.mock.calls[0]?.[1]).toBe('save-failed');
  expect(String(spy.mock.calls[0]?.[3])).toContain('磁盘满了');
  spy.mockRestore();
});

it('keeps a surface failure on its own surface', async () => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  await reportFailure({category: 'preview-unavailable', detail: '预览起不来'});
  // 预览那块自己显示 ⇒ ⇒ 不进通知面 ✓（设计 §2.1 ✓）。
  expect(noticeStore.list()).toHaveLength(0);
  await vi.waitFor(() => expect(spy).toHaveBeenCalledOnce());
  spy.mockRestore();
});

it('lets the caller say more than the category does', async () => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  await reportFailure({category: 'save-failed', message: '保存失败（未命名），内容仍在工作区'});
  expect(noticeStore.list()[0]?.message).toBe('保存失败（未命名），内容仍在工作区');
  await vi.waitFor(() => expect(spy).toHaveBeenCalledOnce());
  spy.mockRestore();
});

it('does not take the application down when the channel fails', async () => {
  native.isTauri.mockReturnValue(true);
  native.invoke.mockRejectedValue(new Error('通道挂了'));
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  await expect(reportFailure({category: 'save-failed'})).resolves.toBeTruthy();
  await vi.waitFor(() => expect(tauriMessagePort.health().status).toBe('failed'));
  spy.mockRestore();
});

it('carries the locator to the log, so the log says where it happened', async () => {
  native.isTauri.mockReturnValue(true);
  await reportFailure({
    category: 'rejection',
    source: 'TypeError@http://tauri.localhost/assets/index.js:1234',
  });
  // **定位串进了载荷** ✓ ⇒ ⇒ 原生那条日志因此能指出是哪儿 ✓ ⇒ ⇒ 不用开控制台 ✓。
  //
  // **这一跳以前是断的** ✓：捕获器算出了定位串 ✓，原生侧也会写它 ✓，
  // 但**中间那个失败出口没转发** ✓ ⇒ ⇒ 两端的测试都绿 ✓ ⇒ ⇒ 日志里啥也没有 ✓。
  await vi.waitFor(() =>
    expect(native.invoke.mock.calls.some(([command]) => command === 'log_event')).toBe(true),
  );
  const payload = String(
    native.invoke.mock.calls.find(([command]) => command === 'log_event')?.[1]?.payload,
  );
  expect(payload).toContain('source');
  expect(payload).toContain('index.js:1234');
  // **原文仍然不进载荷** ✓ ⇒ ⇒ 用户数据不落日志 ✓（基座 §5.2 ✓）。
  expect(payload).not.toContain('detail');
});

it('puts the locator in the browser console line as well', async () => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  await reportFailure({
    category: 'rejection',
    source: 'TypeError@http://localhost:1420/index.js:1234',
  });
  // 控制台那一句与日志那一条**对得上** ✓ ⇒ ⇒ 找出处不用两处对 ✓。
  await vi.waitFor(() => expect(spy).toHaveBeenCalled());
  expect(spy.mock.calls[0]?.[4]).toBe('TypeError@http://localhost:1420/index.js:1234');
  spy.mockRestore();
});

it('shows feedback and returns without waiting for the native log channel', async () => {
  native.isTauri.mockReturnValue(true);
  native.invoke.mockImplementation(() => new Promise(() => {}));
  const id = await reportFailure({category: 'save-failed'});
  expect(noticeStore.list()[0]?.diagnosticId).toBe(id);
  await vi.waitFor(() => expect(tauriMessagePort.health().status).toBe('timeout'));
});
