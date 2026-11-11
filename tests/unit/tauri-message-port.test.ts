import {describe, expect, it, vi, beforeEach, afterEach} from 'vitest';
import {createTauriMessagePort} from '../../src/core/platform/tauri/messages';
import {pageBuildCommit} from '../../src/core/platform/buildInfo';

/**
 * 桌面消息端口：进原生日志基座的那条路。
 *
 * **它带页面自己的构建标识** ✓ ⇒ ⇒ 日志能对出**页面与原生侧是不是同一个构建** ✓ ⇒ ⇒
 * 不用问人那个包是不是新的 ✓。
 *
 * **原始文本不进载荷** ✓ ⇒ ⇒ 用户数据不落日志 ✓（基座 §5.2 ✓）。
 */

let tauriMessagePort: ReturnType<typeof createTauriMessagePort>;
const native = vi.hoisted(() => ({isTauri: vi.fn(), invoke: vi.fn()}));
vi.mock('@tauri-apps/api/core', () => native);

beforeEach(() => {
  vi.resetAllMocks();
  native.isTauri.mockReturnValue(true);
  native.invoke.mockResolvedValue('accepted');
  tauriMessagePort = createTauriMessagePort(
    async () => native,
    async () => 20,
  );
});

const payloadOf = (): Record<string, unknown> =>
  JSON.parse(String(native.invoke.mock.calls[0]?.[1]?.payload));

describe('桌面消息端口', () => {
  it('把页面自己的构建标识一起发出去', async () => {
    await tauriMessagePort.report({category: 'rejection', source: 'TypeError@app.js:1'});
    // **页面那一份 commit** ✓ ⇒ ⇒ 原生侧记成 `page_build` ✓ ⇒ ⇒
    // 与运行标记里的 `build_commit` 一比 ⇒ ⇒ 两边是不是同一个构建 ✓。
    expect(payloadOf().build).toBe(pageBuildCommit);
    // **一处事实** ✓ ⇒ ⇒ 端口发的与页面那一份是同一个值 ✓。
    expect(typeof payloadOf().build).toBe('string');
  });

  it('原始文本不进载荷', async () => {
    await tauriMessagePort.report({category: 'rejection', detail: '磁盘满了'});
    expect(payloadOf().detail).toBeUndefined();
  });

  it('类别与定位串照旧发出去', async () => {
    await tauriMessagePort.report({category: 'rejection', source: 'TypeError@app.js:1'});
    expect(payloadOf().event).toBe('page_error');
    expect(payloadOf().error_category).toBe('rejection');
    expect(payloadOf().source).toBe('TypeError@app.js:1');
  });
});

afterEach(() => vi.useRealTimers());
it.each(['accepted', 'dropped', 'rejected'] as const)(
  'consumes the %s receipt',
  async (receipt) => {
    native.invoke.mockResolvedValue(receipt);
    await tauriMessagePort.event({kind: 'page_ready'});
    expect(tauriMessagePort.health()).toEqual({status: receipt});
    expect(native.invoke).toHaveBeenCalledTimes(1);
  },
);
it('distinguishes invalid receipts, unavailable bridges and exceptions without retry', async () => {
  native.invoke.mockResolvedValue('saved');
  await tauriMessagePort.event({kind: 'page_ready'});
  expect(tauriMessagePort.health().status).toBe('invalid-receipt');
  native.isTauri.mockReturnValue(false);
  await tauriMessagePort.event({kind: 'page_ready'});
  expect(tauriMessagePort.health().status).toBe('unavailable');
  native.isTauri.mockReturnValue(true);
  native.invoke.mockRejectedValue(new Error('bridge unavailable'));
  await tauriMessagePort.event({kind: 'page_ready'});
  expect(tauriMessagePort.health().status).toBe('failed');
  expect(native.invoke).toHaveBeenCalledTimes(2);
});
it('bounds hung reception and ignores its late result', async () => {
  vi.useFakeTimers();
  let finish: ((value: unknown) => void) | undefined;
  native.invoke.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = tauriMessagePort.event({kind: 'page_ready'});
  await vi.advanceTimersByTimeAsync(20);
  await pending;
  expect(tauriMessagePort.health().status).toBe('timeout');
  native.invoke.mockResolvedValue('rejected');
  await tauriMessagePort.event({kind: 'page_ready'});
  finish?.('accepted');
  await Promise.resolve();
  expect(tauriMessagePort.health().status).toBe('rejected');
});
it('bounds configuration loading and uses the default timeout', async () => {
  vi.useFakeTimers();
  const port = createTauriMessagePort(
    async () => native,
    () => new Promise(() => {}),
  );
  const pending = port.event({kind: 'page_ready'});
  await vi.advanceTimersByTimeAsync(200);
  await pending;
  expect(port.health().status).toBe('accepted');
});
it('does not let an older concurrent send replace the newest status', async () => {
  let finish: ((value: unknown) => void) | undefined;
  native.invoke.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const old = tauriMessagePort.event({kind: 'page_ready'});
  await vi.waitFor(() => expect(native.invoke).toHaveBeenCalledTimes(1));
  native.invoke.mockResolvedValue('dropped');
  await tauriMessagePort.event({kind: 'page_ready'});
  finish?.('accepted');
  await old;
  expect(tauriMessagePort.health().status).toBe('dropped');
});
