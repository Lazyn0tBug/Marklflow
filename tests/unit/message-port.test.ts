import {it, expect, vi, beforeEach} from 'vitest';
import {webMessagePort} from '../../src/core/platform/web/messages';
import {tauriMessagePort} from '../../src/core/platform/tauri/messages';
import {resolveMessagePort} from '../../src/core/platform/messages';

const native = vi.hoisted(() => ({isTauri: vi.fn(), invoke: vi.fn()}));
vi.mock('@tauri-apps/api/core', () => native);

beforeEach(() => {
  vi.resetAllMocks();
  native.isTauri.mockReturnValue(false);
  native.invoke.mockResolvedValue(undefined);
});

it('the browser port writes the raw text to the console', async () => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  await webMessagePort.report({category: 'export-failed', diagnosticId: 'e-1', detail: '原始文本'});
  expect(spy).toHaveBeenCalledOnce();
  expect(String(spy.mock.calls[0]?.[1])).toContain('export-failed');
  // 诊断 id 也在 ⇒ ⇒ 拿它对得上用户面那条 ✓。
  expect(String(spy.mock.calls[0]?.[2])).toContain('e-1');
  expect(String(spy.mock.calls[0]?.[3])).toContain('原始文本');
  spy.mockRestore();
});

it('the desktop port sends only the category to the log', async () => {
  native.isTauri.mockReturnValue(true);
  await tauriMessagePort.report({category: 'export-failed', detail: '原始文本'});
  expect(native.invoke).toHaveBeenCalledOnce();
  const payload = JSON.parse(String(native.invoke.mock.calls[0]?.[1]?.payload));
  expect(payload).toEqual({event: 'page_error', error_category: 'export-failed'});
  // 原始文本不进日志 ✓（基座 §5.2 的硬约束 ✓）。
  expect(JSON.stringify(payload)).not.toContain('原始文本');
});

it('picks the port by the runtime', async () => {
  native.isTauri.mockReturnValue(false);
  expect(await resolveMessagePort()).toBe(webMessagePort);
  native.isTauri.mockReturnValue(true);
  expect(await resolveMessagePort()).toBe(tauriMessagePort);
});
