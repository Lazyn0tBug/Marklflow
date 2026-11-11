import {describe, expect, it, vi, beforeEach} from 'vitest';
import {tauriMessagePort} from '../../src/core/platform/tauri/messages';
import {markAppReady} from '../../src/core/platform/web/capture';

/**
 * 页面侧回传的业务事件 ✓。
 *
 * **页面告诉原生侧"我起来了"** ✓ ⇒ ⇒ 原生侧知道页面到这一步了 ✓ ⇒ ⇒
 * 与它自己的启动标记对得上 ✓ ⇒ ⇒ 缺了哪一段**日志里看得见** ✓ ⇒ ⇒ 不用猜 ✓。
 *
 * **业务事件与错误走同一个出口** ✓ ⇒ ⇒ **同一份日志** ✓ ⇒ ⇒ 两边对得上 ✓。
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
  native.isTauri.mockReturnValue(true);
  native.invoke.mockResolvedValue(undefined);
});

const payloadOf = (index = 0): Record<string, unknown> =>
  JSON.parse(String(native.invoke.mock.calls[index]?.[1]?.payload));

describe('页面侧的业务事件', () => {
  it('页面起来时告诉原生侧', async () => {
    markAppReady();
    await vi.waitFor(() => expect(native.invoke).toHaveBeenCalled());
    expect(payloadOf().event).toBe('page_ready');
  });

  it('业务事件只带那几样字段', async () => {
    await tauriMessagePort.event({
      kind: 'call_started',
      callId: 'c-1',
      command: 'read_native_text',
    });
    const payload = payloadOf();
    expect(payload.event).toBe('call_started');
    expect(payload.call_id).toBe('c-1');
    expect(payload.command).toBe('read_native_text');
    // **封闭形状** ✓ ⇒ ⇒ 没有自由正文 ✓ ⇒ ⇒ 用户数据不落日志 ✓。
    // **页面那一份构建标识也带着** ✓ ⇒ ⇒ 与原生侧那一份对得上 ✓。
    expect(Object.keys(payload).sort()).toEqual(['build', 'call_id', 'command', 'event']);
  });

  it('没有的那些字段就不出现', async () => {
    await tauriMessagePort.event({kind: 'page_ready'});
    expect(Object.keys(payloadOf()).sort()).toEqual(['build', 'event']);
  });
});
