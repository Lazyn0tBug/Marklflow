import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {
  detectNativeTarget,
  isNativeSameDirectory,
  isNativeSynced,
  isNativeTargetPresent,
  listenNativeDrop,
  readNativeText,
  releaseNativeFile,
  selectNativeOpen,
  selectNativeSave,
  writeNativeBytes,
} from '../../src/core/platform/tauri/files';

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
const events = vi.hoisted(() => ({listen: vi.fn()}));
vi.mock('@tauri-apps/api/event', () => events);
const selected = {
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
afterEach(() => vi.unstubAllGlobals());

it('maps only dialog null to no selection and preserves observable invocation failures', async () => {
  native.invoke.mockResolvedValue(null);
  expect(await selectNativeOpen()).toBeUndefined();
  expect(await selectNativeSave('report.md')).toBeUndefined();
  const failure = new Error('native dialog failed');
  native.invoke.mockRejectedValue(failure);
  await expect(selectNativeOpen()).rejects.toBe(failure);
  await expect(selectNativeSave('report.md')).rejects.toBe(failure);
});
it('rejects native file operations outside Tauri', async () => {
  native.isTauri.mockReturnValue(false);
  vi.stubGlobal('isTauri', false);
  await expect(selectNativeOpen()).rejects.toThrow('原生文件能力');
  await expect(selectNativeSave('report.md')).rejects.toThrow('原生文件能力');
  expect(native.invoke).not.toHaveBeenCalled();
});
it('maps a native machine code to a friendly message and keeps the code for evidence', async () => {
  // 原生侧给的是结构化的机器码 ✓（§9）：拒绝不再靠子串匹配 ✓。
  native.invoke.mockRejectedValue({code: 'native-source-denied'});
  const error = await selectNativeOpen().catch((failure) => failure);
  expect(String(error)).toContain('当前窗口无权使用原生文件能力');
  expect(String(error)).not.toContain('native-source-denied');
  // 机器码留在错误对象上 ✓：探针与诊断要它 ✓。
  expect((error as {code?: string}).code).toBe('native-source-denied');
});
it('states the real limit when the native side gives one', async () => {
  // **上限由原生侧给出** ✓ ⇒ ⇒ 文案说得出是多少 ✓ ⇒ ⇒ 不猜 ✓（§8.5 ✓）。
  native.invoke.mockRejectedValueOnce({code: 'file-too-large', limitBytes: 52428800});
  const error = await selectNativeOpen().catch((failure) => failure);
  expect(String(error)).toContain('文件超过 50MiB 的上限');
  // **上限留在错误对象上** ✓ ⇒ ⇒ 诊断与日志要它 ✓。
  expect((error as {limitBytes?: number}).limitBytes).toBe(52428800);
  // **没有上限就不编数字** ✓ ⇒ ⇒ 退回一句概括的 ✓。
  native.invoke.mockRejectedValueOnce({code: 'file-too-large'});
  const plain = await selectNativeOpen().catch((failure) => failure);
  expect(String(plain)).toContain('文件超过可处理的大小上限');
});
it('tells the reasons apart: a file that moved is not a file that cannot be written', async () => {
  native.invoke.mockRejectedValueOnce({code: 'native-target-missing'});
  const missing = await selectNativeOpen().catch((failure) => failure);
  expect(String(missing)).toContain('已被移走');
  native.invoke.mockRejectedValueOnce({code: 'native-permission-denied'});
  const denied = await selectNativeOpen().catch((failure) => failure);
  expect(String(denied)).toContain('没有权限');
  expect(String(denied)).not.toBe(String(missing));
});

it('validates selected metadata strictly and preserves only opaque keys', async () => {
  native.invoke.mockResolvedValue([selected]);
  expect(await selectNativeOpen()).toEqual([selected]);
  for (const value of [
    [{...selected, path: 'C:/private'}],
    [{...selected, size: -1}],
    [{...selected, size: 1.5}],
    [{...selected, key: 'not-a-uuid'}],
    [{...selected, name: ''}],
    {},
  ]) {
    native.invoke.mockResolvedValue(value);
    await expect(selectNativeOpen()).rejects.toThrow();
  }
});
it('passes only the opaque key to read and release commands and validates read results', async () => {
  native.invoke.mockResolvedValueOnce('text').mockResolvedValueOnce(undefined);
  expect(await readNativeText(selected)).toBe('text');
  await releaseNativeFile(selected.key);
  expect(native.invoke).toHaveBeenNthCalledWith(1, 'read_native_text', {key: selected.key});
  expect(native.invoke).toHaveBeenNthCalledWith(2, 'release_native_file', {key: selected.key});
  native.invoke.mockResolvedValue(42);
  await expect(readNativeText(selected)).rejects.toThrow();
});
it('asks the native side what state that target is in', async () => {
  // **它答的是那个集合里的一个** ✓ ⇒ ⇒ **不在了与写不进去也在里面** ✓ ⇒ ⇒
  // **应用侧按状态选处理** ✓ ⇒ ⇒ **那两条分支因此走得到** ✓（§6.1 ✓）。
  native.invoke.mockResolvedValueOnce('ready').mockResolvedValueOnce('missing');
  expect(await detectNativeTarget(selected.key)).toBe('ready');
  expect(await detectNativeTarget(selected.key)).toBe('missing');
  expect(native.invoke).toHaveBeenNthCalledWith(1, 'detect_native_target', {key: selected.key});
  // **回的不是集合里的一个就是坏数据** ✓ ⇒ ⇒ 不能悄悄当真 ✓。
  native.invoke.mockResolvedValueOnce('yes');
  await expect(detectNativeTarget(selected.key)).rejects.toThrow();
  // **答不了的时候给机器码** ✓ ⇒ ⇒ 应用侧据此处理 ✓（§9 ✓）。
  const failure = new Error('native state unavailable');
  native.invoke.mockRejectedValueOnce(failure);
  await expect(detectNativeTarget(selected.key)).rejects.toBe(failure);
});

it('answers the old yes or no question from the same status', async () => {
  // **它只是那句检测的一个薄包装** ✓ ⇒ ⇒ **状态集合只定义一处** ✓ ⇒ ⇒
  // **答"就绪"就是那一版** ✓ ⇒ ⇒ 其余都是"不是" ✓。
  native.invoke.mockResolvedValueOnce('ready').mockResolvedValueOnce('changed');
  expect(await isNativeSynced(selected.key)).toBe(true);
  expect(await isNativeSynced(selected.key)).toBe(false);
  expect(native.invoke).toHaveBeenNthCalledWith(1, 'detect_native_target', {key: selected.key});
});
it('asks the native side whether two files sit in the same directory', async () => {
  // **只回一句是或不是** ✓ ⇒ ⇒ 路径不出原生侧 ✓ ⇒ ⇒ 应用侧拿不到路径 ✓（§3.4 ✓）。
  native.invoke.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  expect(await isNativeSameDirectory(selected.key, 'other-key')).toBe(true);
  expect(await isNativeSameDirectory(selected.key, 'other-key')).toBe(false);
  expect(native.invoke).toHaveBeenNthCalledWith(1, 'is_native_same_directory', {
    firstKey: selected.key,
    secondKey: 'other-key',
  });
  // **回的不是布尔就是坏数据** ✓ ⇒ ⇒ 不能悄悄当真 ✓。
  native.invoke.mockResolvedValueOnce('yes');
  await expect(isNativeSameDirectory(selected.key, 'other-key')).rejects.toThrow();
});
it('asks the native side whether that target is still there', async () => {
  // **只回一句是或不是** ✓ ⇒ ⇒ 目标没了 ⇒ ⇒ 回"否" ✓ ⇒ ⇒ **不是报错** ✓（§8.2 ✓）。
  native.invoke.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  expect(await isNativeTargetPresent(selected.key)).toBe(true);
  expect(await isNativeTargetPresent(selected.key)).toBe(false);
  expect(native.invoke).toHaveBeenNthCalledWith(1, 'is_native_target_present', {
    key: selected.key,
  });
  // **回的不是布尔就是坏数据** ✓ ⇒ ⇒ 不能悄悄当真 ✓。
  native.invoke.mockResolvedValueOnce('yes');
  await expect(isNativeTargetPresent(selected.key)).rejects.toThrow();
});
it('gives the save target its reference so the new document can bind to it', async () => {
  native.invoke.mockResolvedValueOnce(selected);
  const target = await selectNativeSave('report.md');
  // **另存为要拿到新文件的引用** ✓ ⇒ ⇒ 新文档绑的是**那个文件** ✓（M5-5 ✓）。
  expect(target!.reference).toBe(selected.reference);
  expect(target!.name).toBe(selected.name);
});
it('writes bytes to a chosen target without the sync recheck', async () => {
  native.invoke.mockResolvedValueOnce(undefined);
  await writeNativeBytes(selected.key, new Uint8Array([104, 105]));
  // **通用字节写入** ✓ ⇒ ⇒ **不走写回原文件那条路** ✓ ⇒ ⇒ 那里没有基线 ✓ ⇒ ⇒ 无从复核 ✓（§6.2 ✓）。
  expect(native.invoke).toHaveBeenCalledExactlyOnceWith('write_native_bytes', {
    key: selected.key,
    bytes: [104, 105],
  });
});
it('selects a save target without writing until save, then reports saved only after native success', async () => {
  native.invoke
    .mockResolvedValueOnce(selected)
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce(undefined);
  const target = await selectNativeSave('report.md');
  expect(native.invoke).toHaveBeenCalledExactlyOnceWith('select_native_save', {name: 'report.md'});
  const blob = new Blob(['hello']);
  expect(await target!.save(blob)).toBe('saved');
  expect(native.invoke).toHaveBeenNthCalledWith(2, 'write_native_bytes', {
    key: selected.key,
    bytes: [104, 101, 108, 108, 111],
  });
  await target!.release();
  expect(native.invoke).toHaveBeenNthCalledWith(3, 'release_native_file', {key: selected.key});
});
it('propagates write and release failures without reporting saved', async () => {
  const writeFailure = new Error('disk write failed');
  native.invoke.mockResolvedValueOnce(selected).mockRejectedValueOnce(writeFailure);
  const target = await selectNativeSave('report.md');
  await expect(target!.save(new Blob(['x']))).rejects.toBe(writeFailure);
  const releaseFailure = new Error('release failed');
  native.invoke.mockRejectedValueOnce(releaseFailure);
  await expect(target!.release()).rejects.toBe(releaseFailure);
});
it('rejects oversized blobs before allocating their byte array', async () => {
  native.invoke.mockResolvedValueOnce(selected);
  const target = await selectNativeSave('report.md');
  const blob = {size: 100 * 1024 * 1024 + 1, arrayBuffer: vi.fn()};
  await expect(target!.save(blob as unknown as Blob)).rejects.toThrow('100MiB');
  expect(blob.arrayBuffer).not.toHaveBeenCalled();
  expect(native.invoke).toHaveBeenCalledExactlyOnceWith('select_native_save', {name: 'report.md'});
});

it('hands the dropped files over and ignores a payload it does not trust', async () => {
  let deliver: ((event: {payload?: {files?: unknown}}) => void) | undefined;
  events.listen.mockImplementation(
    async (_name: string, callback: (event: {payload?: {files?: unknown}}) => void) => {
      deliver = callback;
      return () => {};
    },
  );
  const seen: unknown[] = [];
  const unlisten = await listenNativeDrop((files) => seen.push(...files));
  deliver?.({payload: {files: [selected]}});
  expect(seen).toEqual([selected]);
  // 不认的载荷不进批次 ✓：拖进来的是别的形状时，不该凭空多出一个文档 ✓。
  deliver?.({payload: {files: [{key: 'not-a-uuid'}]}});
  expect(seen).toHaveLength(1);
  unlisten();
});

it('carries one unique ID through each command and its ordered page events', async () => {
  native.invoke.mockResolvedValue('hello');
  await Promise.all([readNativeText(selected), readNativeText(selected)]);
  await vi.waitFor(() => expect(native.logs.mock.calls).toHaveLength(4));
  const events = native.logs.mock.calls.map(
    ([args]) =>
      JSON.parse(String(args?.payload)) as {
        event: string;
        call_id?: string;
        command?: string;
        result?: string;
      },
  );
  const ids = native.calls.map((call) => call.args?.callId);
  expect(new Set(ids).size).toBe(2);
  for (const id of ids) {
    expect(id).toEqual(expect.any(String));
    expect(events.filter((event) => event.call_id === id).map((event) => event.event)).toEqual([
      'call_started',
      'call_finished',
    ]);
    expect(
      events.find((event) => event.call_id === id && event.event === 'call_finished')?.result,
    ).toBe('ok');
  }
});
it('keeps a native success separate from a page decoding failure', async () => {
  native.invoke.mockResolvedValue(42);
  await expect(readNativeText(selected)).rejects.toThrow();
  await vi.waitFor(() => expect(native.logs.mock.calls).toHaveLength(2));
  expect(JSON.parse(String(native.logs.mock.calls[1]?.[0]?.payload)).result).toBe('error');
});
it('reports denied completion without changing the business failure', async () => {
  native.invoke.mockRejectedValue({code: 'native-source-denied'});
  await expect(readNativeText(selected)).rejects.toMatchObject({code: 'native-source-denied'});
  await vi.waitFor(() => expect(native.logs.mock.calls).toHaveLength(2));
  expect(JSON.parse(String(native.logs.mock.calls[1]?.[0]?.payload)).result).toBe('denied');
});
it('does not wait for a hung logging bridge before returning the file result', async () => {
  vi.useFakeTimers();
  native.logs.mockImplementation(() => new Promise(() => {}));
  native.invoke.mockResolvedValue('ready');
  expect(await readNativeText(selected)).toBe('ready');
  await vi.advanceTimersByTimeAsync(50);
  expect(native.logs).toHaveBeenCalledTimes(2);
  vi.useRealTimers();
});
