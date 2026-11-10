import {it, expect, vi} from 'vitest';
import {act, createElement} from 'react';
import {createRoot} from 'react-dom/client';

/**
 * 根的选择：**导出必须用配置定下的那个根** ✓。
 *
 * 解析是异步的 ✓ —— 解析还没回来就点导出的话 ✓，
 * 若那时拿的是"还没定"的那份 ✓，就会悄悄走 Web 根 ✓ ——
 * 那正是"不许回落"要防的 ✓ ✓。
 */

const state = vi.hoisted(() => ({
  prepare: vi.fn(async () => ({html: '', pages: []}) as never),
  webRun: vi.fn(async () => ({status: 'completed', documentId: 'A', revision: 1, message: 'web'})),
  nativeRun: vi.fn(async () => ({
    status: 'completed',
    documentId: 'A',
    revision: 1,
    message: 'native',
  })),
  resolve: vi.fn(),
}));
vi.mock('../../src/core/export/exportContent', () => ({prepareExportContent: state.prepare}));
vi.mock('../../src/core/platform/web/exportService', () => ({
  webExportService: {busy: false, sourceLabel: undefined, run: state.webRun},
}));
vi.mock('../../src/core/platform/tauri/exportService', () => ({
  nativeExportService: {busy: false, sourceLabel: undefined, run: state.nativeRun},
}));
vi.mock('../../src/core/platform/exportRoot', () => ({resolveExportRoot: state.resolve}));

import {ExportModal} from '../../src/components/export/ExportModal';
import {createNewDocument} from '../../src/core/storage/storage';

it('waits for the root to resolve and then uses the one the configuration chose', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host),
    doc = createNewDocument('Root');
  let resolveRoot = (value: {root: 'web' | 'native'; nativePdfAvailable: boolean}) => {
    void value;
  };
  state.resolve.mockReturnValue(
    new Promise((done) => {
      resolveRoot = done;
    }),
  );
  const button = (text: string) =>
    [...host.querySelectorAll('button')].find((node) => node.textContent?.includes(text))!;
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
      button('立即导出并保存').click();
    });
    // 根还没解析出来 ⇒ 两个根都还没被用 ✓（不许先拿"还没定"的那个去导出 ✓）。
    expect(state.nativeRun).not.toHaveBeenCalled();
    expect(state.webRun).not.toHaveBeenCalled();
    await act(async () => {
      resolveRoot({root: 'native', nativePdfAvailable: true});
      for (let i = 0; i < 8; i++) await Promise.resolve();
    });
    expect(state.nativeRun).toHaveBeenCalledOnce();
    expect(state.webRun).not.toHaveBeenCalled();
  } finally {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    vi.unstubAllGlobals();
  }
});
