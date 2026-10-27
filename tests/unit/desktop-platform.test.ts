import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isTauri,
  getPlatformInfo,
  saveExportBinaryOrText,
  openLocalMarkdownFile,
  openNativeFileDialog,
  saveLocalMarkdownFile,
  saveNativeFileInPlace,
  saveAsLocalMarkdownFile,
  saveNativeFileAs,
  updateWindowTitle,
  listenNativeFileDrop,
} from '../../src/core/platform/desktop';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
  save: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  writeFile: vi.fn(),
}));

describe('desktop platform abstraction', () => {
  const originalTauriInternals = (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;

  beforeEach(() => {
    vi.clearAllMocks();
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
    await updateWindowTitle('系统报告', true);
    expect(document.title).toBe('● 系统报告 - MarkFlow 墨流');

    await updateWindowTitle('系统报告', false);
    expect(document.title).toBe('系统报告 - MarkFlow 墨流');

    await updateWindowTitle('', false);
    expect(document.title).toBe('未命名技术文档 - MarkFlow 墨流');
  });

  it('returns undefined for listenNativeFileDrop when running in browser', async () => {
    const unlisten = await listenNativeFileDrop(() => {});
    expect(unlisten).toBeUndefined();
  });

  describe('openLocalMarkdownFile & openNativeFileDialog', () => {
    it('returns null when called in non-Tauri browser environment', async () => {
      const result = await openLocalMarkdownFile();
      expect(result).toBeNull();
    });

    it('opens file dialog and returns file details in Tauri environment', async () => {
      (window as unknown as { __TAURI_INTERNALS__?: Record<string, unknown> }).__TAURI_INTERNALS__ = {};
      vi.mocked(open).mockResolvedValue('/Users/alice/docs/report.md');
      vi.mocked(readTextFile).mockResolvedValue('# Hello Tauri');

      const result = await openLocalMarkdownFile();
      expect(result).toEqual({
        path: '/Users/alice/docs/report.md',
        name: 'report.md',
        content: '# Hello Tauri',
      });
      expect(open).toHaveBeenCalled();
      expect(readTextFile).toHaveBeenCalledWith('/Users/alice/docs/report.md');
    });

    it('returns null if user cancels the file dialog in Tauri', async () => {
      (window as unknown as { __TAURI_INTERNALS__?: Record<string, unknown> }).__TAURI_INTERNALS__ = {};
      vi.mocked(open).mockResolvedValue(null);

      const result = await openNativeFileDialog();
      expect(result).toBeNull();
      expect(readTextFile).not.toHaveBeenCalled();
    });
  });

  describe('saveLocalMarkdownFile & saveNativeFileInPlace', () => {
    it('returns false when in browser or filePath is missing', async () => {
      expect(await saveLocalMarkdownFile('/test/path.md', '# test')).toBe(false);
      (window as unknown as { __TAURI_INTERNALS__?: Record<string, unknown> }).__TAURI_INTERNALS__ = {};
      expect(await saveLocalMarkdownFile('', '# test')).toBe(false);
    });

    it('writes content to disk in-place in Tauri environment', async () => {
      (window as unknown as { __TAURI_INTERNALS__?: Record<string, unknown> }).__TAURI_INTERNALS__ = {};
      vi.mocked(writeTextFile).mockResolvedValue(undefined);

      const ok = await saveLocalMarkdownFile('/Users/alice/docs/report.md', '# Updated Content');
      expect(ok).toBe(true);
      expect(writeTextFile).toHaveBeenCalledWith('/Users/alice/docs/report.md', '# Updated Content');
    });

    it('handles writeTextFile error gracefully without throwing', async () => {
      (window as unknown as { __TAURI_INTERNALS__?: Record<string, unknown> }).__TAURI_INTERNALS__ = {};
      vi.mocked(writeTextFile).mockRejectedValue(new Error('Permission denied'));

      const ok = await saveNativeFileInPlace('/Users/alice/docs/report.md', '# Content');
      expect(ok).toBe(false);
    });
  });

  describe('saveAsLocalMarkdownFile & saveNativeFileAs', () => {
    it('returns null when in browser environment', async () => {
      const result = await saveAsLocalMarkdownFile('report', '# content');
      expect(result).toBeNull();
    });

    it('prompts save dialog and writes file in Tauri environment', async () => {
      (window as unknown as { __TAURI_INTERNALS__?: Record<string, unknown> }).__TAURI_INTERNALS__ = {};
      vi.mocked(save).mockResolvedValue('/Users/alice/docs/new_report.md');
      vi.mocked(writeTextFile).mockResolvedValue(undefined);

      const targetPath = await saveAsLocalMarkdownFile('report', '# New Content', 'md');
      expect(targetPath).toBe('/Users/alice/docs/new_report.md');
      expect(save).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: 'report.md' }));
      expect(writeTextFile).toHaveBeenCalledWith('/Users/alice/docs/new_report.md', '# New Content');
    });

    it('returns null when user cancels save dialog', async () => {
      (window as unknown as { __TAURI_INTERNALS__?: Record<string, unknown> }).__TAURI_INTERNALS__ = {};
      vi.mocked(save).mockResolvedValue(null);

      const targetPath = await saveNativeFileAs('report', '# New Content');
      expect(targetPath).toBeNull();
      expect(writeTextFile).not.toHaveBeenCalled();
    });
  });
});
