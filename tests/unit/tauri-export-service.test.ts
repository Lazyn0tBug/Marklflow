// @vitest-environment node
import {it, expect, vi, beforeEach} from 'vitest';

const mocks = vi.hoisted(() => ({
  selectNativeSave: vi.fn(),
  printNativePdf: vi.fn(),
  readRuntimePrefs: vi.fn(),
}));
vi.mock('../../src/core/platform/tauri/files', () => ({
  selectNativeSave: mocks.selectNativeSave,
  printNativePdf: mocks.printNativePdf,
}));
vi.mock('../../src/core/platform/tauri/runtime', () => ({
  readRuntimePrefs: mocks.readRuntimePrefs,
}));

import {deliverPdfNative} from '../../src/core/platform/tauri/exportService';
import {resolveExportRoot} from '../../src/core/platform/exportRoot';

const target = (key: string, release: () => Promise<void>) => ({
  key,
  async save() {
    return 'saved' as const;
  },
  release,
});
const file = {name: 'a.pdf', baseName: 'a', extension: '.pdf', mime: 'application/pdf'};

beforeEach(() => {
  mocks.selectNativeSave.mockReset();
  mocks.printNativePdf.mockReset();
  mocks.readRuntimePrefs.mockReset();
});

it('a cancelled target writes nothing and reports the cancel', async () => {
  mocks.selectNativeSave.mockResolvedValue(undefined);
  expect(await deliverPdfNative('<html>x</html>', file)).toBe('cancelled');
  expect(mocks.printNativePdf).not.toHaveBeenCalled();
});

it('a saved target reports saved and releases the grant', async () => {
  const release = vi.fn(async () => {});
  mocks.selectNativeSave.mockResolvedValue(target('k1', release));
  mocks.printNativePdf.mockResolvedValue('saved');
  expect(await deliverPdfNative('<html>x</html>', file)).toBe('saved');
  expect(mocks.selectNativeSave).toHaveBeenCalledExactlyOnceWith('a.pdf');
  expect(release).toHaveBeenCalledOnce();
});

it('a commit that did not happen is a failure and still releases the grant', async () => {
  const release = vi.fn(async () => {});
  mocks.selectNativeSave.mockResolvedValue(target('k2', release));
  mocks.printNativePdf.mockResolvedValue('not-committed');
  expect(await deliverPdfNative('<html>x</html>', file)).toBe('failed');
  expect(release).toHaveBeenCalledOnce();
});

it('a print that throws is a failure and still releases the grant', async () => {
  const release = vi.fn(async () => {});
  mocks.selectNativeSave.mockResolvedValue(target('k3', release));
  mocks.printNativePdf.mockRejectedValue(new Error('print failed'));
  expect(await deliverPdfNative('<html>x</html>', file)).toBe('failed');
  expect(release).toHaveBeenCalledOnce();
});

it('the root comes from the configuration and never falls back to the web root', async () => {
  mocks.readRuntimePrefs.mockResolvedValue({exportRoot: 'native', nativePdfAvailable: true});
  expect(await resolveExportRoot()).toMatchObject({root: 'native', nativePdfAvailable: true});
  mocks.readRuntimePrefs.mockResolvedValue({exportRoot: 'native', nativePdfAvailable: false});
  const choice = await resolveExportRoot();
  // 平台没有静默 PDF 而配置选了它 ⇒ **不改走 Web** ✓（回落就是降级 ✓）。
  expect(choice.root).toBe('native');
  expect(choice.blockedReason).toBeTruthy();
  mocks.readRuntimePrefs.mockResolvedValue({exportRoot: 'web', nativePdfAvailable: true});
  expect(await resolveExportRoot()).toMatchObject({root: 'web'});
  mocks.readRuntimePrefs.mockResolvedValue(undefined);
  expect(await resolveExportRoot()).toMatchObject({root: 'web'});
});
