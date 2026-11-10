import {describe, expect, it, vi, beforeEach} from 'vitest';
import {tauriMessagePort} from '../../src/core/platform/tauri/messages';
import {pageBuildCommit} from '../../src/core/platform/buildInfo';

/**
 * 桌面消息端口：进原生日志基座的那条路。
 *
 * **它带页面自己的构建标识** ✓ ⇒ ⇒ 日志能对出**页面与原生侧是不是同一个构建** ✓ ⇒ ⇒
 * 不用问人那个包是不是新的 ✓。
 *
 * **原始文本不进载荷** ✓ ⇒ ⇒ 用户数据不落日志 ✓（基座 §5.2 ✓）。
 */

const native = vi.hoisted(() => ({isTauri: vi.fn(), invoke: vi.fn()}));
vi.mock('@tauri-apps/api/core', () => native);

beforeEach(() => {
  vi.resetAllMocks();
  native.isTauri.mockReturnValue(true);
  native.invoke.mockResolvedValue(undefined);
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
