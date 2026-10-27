import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isAbsolutePath,
  getDirectoryPath,
  resolvePath,
  resolveMarkdownImageUrl,
  isLocalAssetUrl,
} from '../../src/core/platform/assetResolver';
import { safeUrl } from '../../src/core/render/htmlPolicy';
import { parseMarkdownDocument } from '../../src/core/parser/markdownParser';

describe('AssetResolver Unit Tests', () => {
  describe('isAbsolutePath', () => {
    it('correctly identifies Windows absolute paths', () => {
      expect(isAbsolutePath('C:\\Users\\test\\photo.png')).toBe(true);
      expect(isAbsolutePath('D:/images/arch.svg')).toBe(true);
      expect(isAbsolutePath('\\\\server\\share\\pic.png')).toBe(true);
    });

    it('correctly identifies Unix absolute paths', () => {
      expect(isAbsolutePath('/Users/alice/Pictures/logo.png')).toBe(true);
      expect(isAbsolutePath('/home/user/arch.svg')).toBe(true);
    });

    it('correctly identifies file:// protocol URIs', () => {
      expect(isAbsolutePath('file:///C:/Users/photo.png')).toBe(true);
      expect(isAbsolutePath('file:///home/user/photo.png')).toBe(true);
    });

    it('returns false for relative paths', () => {
      expect(isAbsolutePath('./images/logo.png')).toBe(false);
      expect(isAbsolutePath('../assets/arch.svg')).toBe(false);
      expect(isAbsolutePath('logo.png')).toBe(false);
    });
  });

  describe('getDirectoryPath', () => {
    it('extracts directory from Unix and Windows paths', () => {
      expect(getDirectoryPath('/Users/alice/docs/article.md')).toBe('/Users/alice/docs');
      expect(getDirectoryPath('C:\\Users\\alice\\docs\\article.md')).toBe('C:\\Users\\alice\\docs');
      expect(getDirectoryPath('article.md')).toBe('');
    });
  });

  describe('resolvePath', () => {
    it('resolves relative subdirectories and parent directories on Unix', () => {
      expect(resolvePath('/Users/alice/docs', './images/pic.png')).toBe('/Users/alice/docs/images/pic.png');
      expect(resolvePath('/Users/alice/docs/sub', '../assets/pic.svg')).toBe('/Users/alice/docs/assets/pic.svg');
    });

    it('resolves relative paths on Windows', () => {
      expect(resolvePath('C:\\Users\\docs', './images/pic.png')).toBe('C:\\Users\\docs\\images\\pic.png');
      expect(resolvePath('C:\\Users\\docs\\v1', '..\\shared\\pic.svg')).toBe('C:\\Users\\docs\\shared\\pic.svg');
    });
  });

  describe('safeUrl validation for local asset protocols', () => {
    it('permits asset:// and asset.localhost protocols for images', () => {
      expect(safeUrl('asset://localhost/%2FUsers%2Flogo.png', true)).toBe(true);
      expect(safeUrl('http://asset.localhost/C%3A%2FUsers%2Flogo.png', true)).toBe(true);
      expect(safeUrl('https://asset.localhost/logo.png', true)).toBe(true);
    });

    it('permits data:image/svg+xml Base64 URLs', () => {
      expect(safeUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', true)).toBe(true);
    });

    it('rejects asset protocol when not an image', () => {
      expect(safeUrl('asset://localhost/malicious.exe', false)).toBe(false);
    });
  });

  describe('resolveMarkdownImageUrl', () => {
    it('keeps remote URLs, data URLs, and blobs intact', () => {
      expect(resolveMarkdownImageUrl('https://example.com/pic.png')).toBe('https://example.com/pic.png');
      expect(resolveMarkdownImageUrl('http://example.com/pic.jpg')).toBe('http://example.com/pic.jpg');
      expect(resolveMarkdownImageUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
      expect(resolveMarkdownImageUrl('blob:http://localhost:3000/123')).toBe('blob:http://localhost:3000/123');
    });

    describe('when in Tauri desktop environment', () => {
      beforeEach(() => {
        (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {
          convertFileSrc: (p: string) => `asset://localhost/${encodeURIComponent(p.replace(/\\/g, '/'))}`,
        };
      });

      afterEach(() => {
        delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
      });

      it('converts absolute paths to asset protocol', () => {
        const resolved = resolveMarkdownImageUrl('/Users/alice/Pictures/logo.png');
        expect(resolved).toContain('asset://localhost/');
        expect(decodeURIComponent(resolved)).toContain('/Users/alice/Pictures/logo.png');
      });

      it('resolves relative paths with docFilePath into asset protocol', () => {
        const docPath = '/Users/alice/projects/doc.md';
        const resolved = resolveMarkdownImageUrl('./assets/arch.svg', docPath);
        expect(resolved).toContain('asset://localhost/');
        expect(decodeURIComponent(resolved)).toContain('/Users/alice/projects/assets/arch.svg');
      });

      it('integrates into Markdown parser output', () => {
        const markdown = '![示例图片](./figures/diagram.png)';
        const docPath = '/Users/alice/report.md';
        const { html, diagnostics } = parseMarkdownDocument(markdown, { docFilePath: docPath });

        expect(diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
        expect(html).toContain('src="asset://localhost/');
        expect(decodeURIComponent(html)).toContain('/Users/alice/figures/diagram.png');
      });
    });
  });

  describe('isLocalAssetUrl', () => {
    it('identifies local asset protocols', () => {
      expect(isLocalAssetUrl('asset://localhost/foo.png')).toBe(true);
      expect(isLocalAssetUrl('http://asset.localhost/bar.png')).toBe(true);
      expect(isLocalAssetUrl('file:///Users/foo.png')).toBe(true);
      expect(isLocalAssetUrl('/Users/foo.png')).toBe(true);
      expect(isLocalAssetUrl('C:\\Users\\foo.png')).toBe(true);
      expect(isLocalAssetUrl('https://example.com/foo.png')).toBe(false);
    });
  });
});
