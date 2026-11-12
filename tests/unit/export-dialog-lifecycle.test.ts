import {it, expect, vi} from 'vitest';
import {act, createElement} from 'react';
import {createRoot} from 'react-dom/client';
const state = vi.hoisted(() => ({prepare: vi.fn()}));
vi.mock('../../src/core/export/exportContent', () => ({prepareExportContent: state.prepare}));
import {ExportModal} from '../../src/components/export/ExportModal';
import {webExportService} from '../../src/core/platform/web/exportService';
import {createNewDocument} from '../../src/core/storage/storage';
import {htmlArtifact} from './export-fixtures';

/**
 * **等到条件成立** ✓ ⇒ ⇒ 不靠"数几次微任务" ✓。
 *
 * 固定次数的 `await Promise.resolve()` 是在赌那条异步链恰好那么长 ✓
 * ⇒ ⇒ 链上多一个 await 就赌输了 ✓ ⇒ ⇒ 用例偶尔变红 ✓（实测过 ✓）。
 */
async function settle(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error('条件没有在期限内成立');
}

it('does not leave export busy if the dialog unmounts before preparation asks for confirmation', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host),
    doc = createNewDocument('Closing');
  let mounted = true;
  let resolve = (value: ReturnType<typeof htmlArtifact>) => {
    void value;
  };
  state.prepare.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const button = (text: string) =>
    [...document.body.querySelectorAll<HTMLButtonElement>('[data-export-overlay] button')].find(
      (node) => node.textContent?.includes(text),
    )!;
  try {
    await act(async () => {
      root.render(
        createElement(ExportModal, {
          isOpen: true,
          onClose: () => {},
          document: doc,
          mathMode: 'svg',
        }),
      );
    });
    await act(async () => {
      button('Word 原生文档').click();
    });
    await act(async () => {
      button('立即导出并保存').click();
    });
    expect(webExportService.busy).toBe(true);
    await act(async () => {
      root.unmount();
      mounted = false;
    });
    await act(async () => {
      resolve(
        htmlArtifact(
          '<span data-mf-math-id="math-0"><svg xmlns="http://www.w3.org/2000/svg"></svg></span>',
          doc,
        ),
      );
      await settle(() => !webExportService.busy);
    });
    expect(webExportService.busy).toBe(false);
  } finally {
    if (mounted) await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it('does not revive a dismissed confirmation when the dialog is reopened during preparation', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host),
    doc = createNewDocument('Reopened');
  let resolve = (value: ReturnType<typeof htmlArtifact>) => {
    void value;
  };
  state.prepare.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const render = (isOpen: boolean) =>
    root.render(
      createElement(ExportModal, {isOpen, onClose: () => {}, document: doc, mathMode: 'svg'}),
    );
  const button = (text: string) =>
    [...document.body.querySelectorAll<HTMLButtonElement>('[data-export-overlay] button')].find(
      (node) => node.textContent?.includes(text),
    )!;
  try {
    await act(async () => {
      render(true);
    });
    await act(async () => {
      button('Word 原生文档').click();
    });
    await act(async () => {
      button('立即导出并保存').click();
    });
    await act(async () => {
      render(false);
    });
    await act(async () => {
      render(true);
    });
    await act(async () => {
      resolve(
        htmlArtifact(
          '<span data-mf-math-id="math-0"><svg xmlns="http://www.w3.org/2000/svg"></svg></span>',
          doc,
        ),
      );
      await settle(() => !webExportService.busy);
    });
    expect(webExportService.busy).toBe(false);
    expect(document.body.querySelector('[data-export-overlay] #export-docx-consent')).toBeNull();
  } finally {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    vi.unstubAllGlobals();
  }
});
