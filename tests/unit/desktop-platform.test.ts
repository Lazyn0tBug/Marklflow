import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isTauri, getPlatformInfo, saveExportBinaryOrText } from '../../src/core/platform/desktop';

describe('desktop platform abstraction', () => {
  const originalTauriInternals = (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;

  beforeEach(() => {
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  afterEach(() => {
    if (originalTauriInternals !== undefined) {
      (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = originalTauriInternals;
    } else {
      delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    }
  });

  it('detects web environment when __TAURI_INTERNALS__ is not present', () => {
    expect(isTauri()).toBe(false);
  });

  it('detects desktop environment when __TAURI_INTERNALS__ is injected', () => {
    (window as unknown as { __TAURI_INTERNALS__?: Record<string, unknown> }).__TAURI_INTERNALS__ = {};
    expect(isTauri()).toBe(true);
  });

  it('returns valid web platform info in browser environment', async () => {
    const info = await getPlatformInfo();
    expect(info.isDesktop).toBe(false);
    expect(info.version).toBe('Web SPA');
    expect(info.os).toBeDefined();
  });

  it('provides web fallback download for saveExportBinaryOrText when not in Tauri', async () => {
    // Mock DOM download elements
    const appendChildSpy = vi.spyOn(document.body, 'appendChild');
    const removeChildSpy = vi.spyOn(document.body, 'removeChild');

    const result = await saveExportBinaryOrText('test-document', 'md', '# Title\nContent');
    expect(result.saved).toBe(true);
    expect(appendChildSpy).toHaveBeenCalled();
    expect(removeChildSpy).toHaveBeenCalled();

    appendChildSpy.mockRestore();
    removeChildSpy.mockRestore();
  });

  it('updates document.title correctly with dirty indicator', async () => {
    await import('../../src/core/platform/desktop').then(async (m) => {
      await m.updateWindowTitle('系统报告', true);
      expect(document.title).toBe('● 系统报告 - MarkFlow 墨流');

      await m.updateWindowTitle('系统报告', false);
      expect(document.title).toBe('系统报告 - MarkFlow 墨流');

      await m.updateWindowTitle('', false);
      expect(document.title).toBe('未命名技术文档 - MarkFlow 墨流');
    });
  });

  it('returns undefined for listenNativeFileDrop when running in browser', async () => {
    const { listenNativeFileDrop } = await import('../../src/core/platform/desktop');
    const unlisten = await listenNativeFileDrop(() => {});
    expect(unlisten).toBeUndefined();
  });
});
