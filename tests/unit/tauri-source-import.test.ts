import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {createNativeSourceImport} from '../../src/core/platform/tauri/sourceImport';
import type {NativeSelection} from '../../src/core/platform/tauri/files';
import {createNewDocument} from '../../src/core/storage/storage';

/**
 * 桌面端那一半 ✓：**读与释放都走授权** ✓ ⇒ ⇒ 路径不出原生侧 ✓。
 *
 * **"是不是已经绑在某个文档上"由应用侧答** ✓ ⇒ ⇒ 这里只转发 ✓ ⇒ ⇒ 绑定只有一处 ✓。
 */

const native = vi.hoisted(() => ({
  isTauri: vi.fn(),
  invoke: vi.fn(),
  logs: vi.fn(),
  calls: [] as {command: string; args: Record<string, unknown> | undefined}[],
}));
vi.mock('../../src/core/platform/tauri/messages', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/platform/tauri/messages')>();
  return {
    ...actual,
    tauriMessagePort: actual.createTauriMessagePort(
      async () => ({
        isTauri: native.isTauri,
        invoke: async <T>(
          _command: string,
          args?: import('@tauri-apps/api/core').InvokeArgs,
        ): Promise<T> => native.logs(args),
      }),
      async () => 20,
    ),
  };
});
/** Exercise the real SDK bridge; concurrent dynamic imports must not depend on module-mock interception. */
function routeNativeCommand(command: string, args?: Record<string, unknown>) {
  if (command === 'get_runtime_prefs')
    return Promise.resolve({exportRoot: 'web', nativePdfAvailable: true, logCallTimeoutMs: 20});
  if (command === 'log_event') return native.logs(args);
  native.calls.push({command, args});
  const {callId: _callId, ...businessArgs} = args ?? {};
  return native.invoke(command, Object.keys(businessArgs).length ? businessArgs : undefined);
}
afterEach(async () => {
  await vi.waitFor(() =>
    expect(
      native.logs.mock.calls.filter(
        ([args]) => JSON.parse(String(args?.payload)).event === 'call_finished',
      ),
    ).toHaveLength(native.calls.length),
  );
});

const selection: NativeSelection = {
  key: '123e4567-e89b-42d3-a456-426614174000',
  name: '文档.md',
  size: 3,
  reference: '987e4567-e89b-42d3-a456-426614174000',
};

beforeEach(() => {
  vi.resetAllMocks();
  native.calls.length = 0;
  native.logs.mockResolvedValue('accepted');
  native.isTauri.mockReturnValue(true);
  vi.stubGlobal('isTauri', true);
  vi.stubGlobal('__TAURI_INTERNALS__', {invoke: routeNativeCommand});
});

it('reads through the grant and releases the grant it did not adopt', async () => {
  native.invoke.mockResolvedValueOnce('# 标题\n').mockResolvedValueOnce(undefined);
  const opened: string[] = [];
  const importer = createNativeSourceImport(
    {boundSelection: async () => undefined},
    async (doc) => {
      opened.push(doc.id);
      return {status: 'opened'};
    },
  );
  const result = await importer.run([selection]);
  expect(result.status === 'completed' && result.items[0]?.status).toBe('opened');
  expect(opened).toHaveLength(1);
  // **读走授权** ✓ ⇒ ⇒ 前端只把不透明的 key 给原生侧 ✓。
  expect(native.invoke).toHaveBeenNthCalledWith(1, 'read_native_text', {key: selection.key});
  // **打开成功的那一项不释放** ✓ ⇒ ⇒ 那个授权是绑定的命脉 ✓（M4-5 ✓）。
  expect(native.invoke).toHaveBeenCalledTimes(1);
});

it('focuses the bound document and releases the selection it did not adopt', async () => {
  native.invoke.mockResolvedValueOnce(undefined);
  const opened: string[] = [];
  const importer = createNativeSourceImport(
    {boundSelection: async () => ({documentId: 'bound-doc', target: 'ready'})},
    async (doc) => {
      opened.push(doc.id);
      return {status: 'opened'};
    },
  );
  const result = await importer.run([selection]);
  expect(result.status === 'completed' && result.items[0]?.status).toBe('focused');
  expect(result.status === 'completed' && result.items[0]?.documentId).toBe('bound-doc');
  // **不读、不开** ✓ ⇒ ⇒ 没有覆盖草稿 ✓（M4-4 ✓）。
  expect(opened).toHaveLength(0);
  expect(native.invoke).not.toHaveBeenCalledWith('read_native_text', expect.anything());
  // **这一项的授权用不上** ✓ ⇒ ⇒ 释放 ✓。
  expect(native.invoke).toHaveBeenCalledWith('release_native_file', {key: selection.key});
});

it('reports the file as changed instead of overwriting the draft', async () => {
  native.invoke.mockResolvedValueOnce(undefined);
  const importer = createNativeSourceImport(
    {boundSelection: async () => ({documentId: 'bound-doc', target: 'changed'})},
    async () => ({status: 'opened'}),
  );
  const result = await importer.run([selection]);
  // **变了就是变了** ✓ ⇒ ⇒ 交给用户决定 ✓ ⇒ ⇒ 不静默覆盖 ✓（M4-9 ✓）。
  expect(result.status === 'completed' && result.items[0]?.status).toBe('changed');
  expect(native.invoke).toHaveBeenCalledWith('release_native_file', {key: selection.key});
});

it('releases the grant of an item it could not read', async () => {
  native.invoke.mockRejectedValueOnce({code: 'invalid-utf8'});
  const importer = createNativeSourceImport({boundSelection: async () => undefined}, async () => ({
    status: 'opened',
  }));
  const result = await importer.run([selection]);
  expect(result.status === 'completed' && result.items[0]?.status).toBe('failed');
  // **失败项不建绑定** ✓ ⇒ ⇒ 它的授权要释放 ✓（M4-5 ✓）。
  expect(native.invoke).toHaveBeenCalledWith('release_native_file', {key: selection.key});
});

it('reads an editable HTML file through the payload path, not as Markdown', async () => {
  // **可编辑 HTML 的载荷** ✓ ⇒ ⇒ 那条路径走载荷 ✓ ⇒ ⇒ 不按 Markdown 导入 ✓（M4-2 ✓）。
  const payload = createNewDocument('可编辑.html');
  const encoded = btoa(encodeURIComponent(JSON.stringify(payload)));
  native.invoke.mockResolvedValueOnce(
    `<script id="markflow-source-payload" type="application/json">${encoded}</script>`,
  );
  const importer = createNativeSourceImport({boundSelection: async () => undefined}, async () => ({
    status: 'opened',
  }));
  const html: NativeSelection = {...selection, name: '可编辑.html', size: 10};
  const result = await importer.run([html]);
  expect(result.status === 'completed' && result.items[0]?.status).toBe('opened');
});

it('gives two different native files with the same name and content two documents', async () => {
  // **来源不同就是不同的文件** ✓ ⇒ ⇒ 同名同内容也不合并 ✓ ⇒ ⇒ 两个文件两个文档 ✓（§5.1 ✓）。
  native.invoke.mockResolvedValue('# 同样的内容\n');
  const opened: string[] = [];
  const importer = createNativeSourceImport(
    {boundSelection: async () => undefined},
    async (doc) => {
      opened.push(doc.id);
      return {status: 'opened'};
    },
  );
  const other: NativeSelection = {
    ...selection,
    key: '223e4567-e89b-42d3-a456-426614174000',
    reference: '333e4567-e89b-42d3-a456-426614174000',
  };
  const result = await importer.run([selection, other]);
  expect(result.status === 'completed' && result.items.map((item) => item.status)).toEqual([
    'opened',
    'opened',
  ]);
  expect(opened).toHaveLength(2);
  // **两个文档** ✓ ⇒ ⇒ 归属按文件引用 ✓ ⇒ ⇒ 键里不看内容摘要 ✓（§5.3 ✓）。
  expect(opened[0]).not.toBe(opened[1]);
});

it('gives the same native file one document', async () => {
  // **同一个文件恒对应同一份内容** ✓ ⇒ ⇒ 再次打开不新建 ✓（§5.3 ✓）。
  native.invoke.mockResolvedValue('# 同样的内容\n');
  const opened: string[] = [];
  const importer = createNativeSourceImport(
    {boundSelection: async () => undefined},
    async (doc) => {
      opened.push(doc.id);
      return {status: 'opened'};
    },
  );
  await importer.run([selection]);
  await importer.run([selection]);
  expect(opened).toHaveLength(2);
  expect(opened[0]).toBe(opened[1]);
});

afterEach(() => vi.unstubAllGlobals());
