import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {nativeDiskPorts} from '../../src/core/platform/tauri/filePorts';
import {webDiskPorts} from '../../src/core/platform/web/filePorts';
import {sourceFormatOf} from '../../src/core/policy/sourceFormat';
import {createNewDocument} from '../../src/core/storage/storage';

/**
 * 平台层给工作区那一层的端口 ✓（设计 §6.5 ✓）。
 *
 * **两端各一套** ✓ ⇒ ⇒ 差异落在**实现**上 ✓ ⇒ ⇒ 不是落在调用点上 ✓。
 */

const native = vi.hoisted(() => ({isTauri: vi.fn(), invoke: vi.fn()}));
vi.mock('@tauri-apps/api/core', () => native);

const selected = {
  key: '123e4567-e89b-42d3-a456-426614174000',
  name: '报告.md',
  size: 3,
  reference: '987e4567-e89b-42d3-a456-426614174000',
};

beforeEach(() => {
  vi.resetAllMocks();
  native.isTauri.mockReturnValue(true);
});
afterEach(() => vi.unstubAllGlobals());

describe('桌面端的端口', () => {
  it('问的还是那一版，走原生那句问答', async () => {
    // **那句检测答的是状态** ✓ ⇒ ⇒ **"就绪"就是那一版** ✓ ⇒ ⇒ 其余都是"不是" ✓。
    native.invoke.mockResolvedValueOnce('ready');
    expect(await nativeDiskPorts.sync.detect(selected.key)).toBe('ready');
    expect(native.invoke).toHaveBeenCalledExactlyOnceWith('detect_native_target', {
      key: selected.key,
    });
  });

  it('普通写回与覆盖写回走同一条命令，基准由原生侧选', async () => {
    native.invoke.mockResolvedValue('ready');
    const bytes = new Uint8Array([104, 105]);
    await nativeDiskPorts.sync.write(selected.key, bytes, 'sync');
    await nativeDiskPorts.sync.write(selected.key, bytes, 'overwrite');
    // **同一条命令** ✓ ⇒ ⇒ 前端不能选择不复核 ✓ ⇒ ⇒ 基准不同由原生侧分 ✓（§6.1 ✓）。
    expect(native.invoke).toHaveBeenNthCalledWith(1, 'write_native_sync', {
      key: selected.key,
      bytes: [104, 105],
      overwrite: false,
      allowMissing: false,
    });
    expect(native.invoke).toHaveBeenNthCalledWith(2, 'write_native_sync', {
      key: selected.key,
      bytes: [104, 105],
      overwrite: true,
      allowMissing: false,
    });
  });

  it('原生侧答一个状态，应用侧按那个状态选处理', async () => {
    // **它答的就是那个集合里的一个** ✓ ⇒ ⇒ **应用侧不再自己判断** ✓ ⇒ ⇒
    // **检测与写回共用这一个集合** ✓ ⇒ ⇒ **一处定义** ✓（§6.1 ✓）。
    native.invoke.mockResolvedValueOnce('changed');
    expect(await nativeDiskPorts.sync.write(selected.key, new Uint8Array(), 'sync')).toBe(
      'changed',
    );
    native.invoke.mockResolvedValueOnce('missing');
    expect(await nativeDiskPorts.sync.write(selected.key, new Uint8Array(), 'sync')).toBe(
      'missing',
    );
    native.invoke.mockResolvedValueOnce('unwritable');
    expect(await nativeDiskPorts.sync.write(selected.key, new Uint8Array(), 'sync')).toBe(
      'unwritable',
    );
    native.invoke.mockResolvedValueOnce('invalid');
    expect(await nativeDiskPorts.sync.write(selected.key, new Uint8Array(), 'sync')).toBe(
      'invalid',
    );
    // **写不成就是抛** ✓ ⇒ ⇒ **机器码不出这一层** ✓ ⇒ ⇒ 应用层接住就是失败 ✓（§9 ✓）。
    native.invoke.mockRejectedValueOnce({code: 'native-io-failed'});
    await expect(
      nativeDiskPorts.sync.write(selected.key, new Uint8Array(), 'sync'),
    ).rejects.toThrow();
  });

  it('说继续的那一次写，目标允许不存在', async () => {
    native.invoke.mockResolvedValue('ready');
    await nativeDiskPorts.sync.write(selected.key, new Uint8Array(), 'continue');
    // **用户说了继续** ✓ ⇒ ⇒ 目标允许不存在 ✓ ⇒ ⇒ **其余复核照旧** ✓（§6.1 ✓）。
    expect(native.invoke).toHaveBeenCalledExactlyOnceWith('write_native_sync', {
      key: selected.key,
      bytes: [],
      overwrite: false,
      allowMissing: true,
    });
  });

  it('读回磁盘上那份，走读文本那条', async () => {
    native.invoke.mockResolvedValueOnce('# 标题');
    expect(await nativeDiskPorts.sync.read(selected.key, 'markdown')).toBe('# 标题');
    expect(native.invoke).toHaveBeenCalledExactlyOnceWith('read_native_text', {key: selected.key});
  });

  it('问那个目标还在吗，走原生那句问答', async () => {
    native.invoke.mockResolvedValueOnce(false);
    // **目标没了 ⇒ ⇒ 答"否"** ✓ ⇒ ⇒ 那不是失败 ✓ ⇒ ⇒ 关联的有效性归它答 ✓（§8.2 ✓）。
    expect(await nativeDiskPorts.sync.targetPresent(selected.key)).toBe(false);
    expect(native.invoke).toHaveBeenCalledExactlyOnceWith('is_native_target_present', {
      key: selected.key,
    });
  });

  it('可编辑 HTML 读回来的是源快照，不是那段 HTML', async () => {
    const source = {...createNewDocument('报告'), markdown: '# 载荷里的正文'};
    const payload = Buffer.from(encodeURIComponent(JSON.stringify(source))).toString('base64');
    native.invoke.mockResolvedValueOnce(
      '<html><body><script id="markflow-source-payload" type="application/json">' +
        payload +
        '</script></body></html>',
    );
    // **读回来的是源快照** ✓ ⇒ ⇒ **草稿里是正文不是 HTML** ✓ ⇒ ⇒ 反向同步不会把 HTML 塞进编辑器 ✓（§6.1 ✓）。
    expect(await nativeDiskPorts.sync.read(selected.key, 'editable-html')).toBe('# 载荷里的正文');
  });

  it('可编辑 HTML 里没有载荷，读不出来就报错', async () => {
    native.invoke.mockResolvedValueOnce('<html><body>手写的 HTML</body></html>');
    await expect(nativeDiskPorts.sync.read(selected.key, 'editable-html')).rejects.toThrow(
      '没有可编辑 HTML 的源载荷',
    );
  });

  it('另存为选目标，拿到的是文件引用', async () => {
    native.invoke.mockResolvedValueOnce(selected);
    const target = await nativeDiskPorts.saveAs.selectTarget('报告.md');
    expect(native.invoke).toHaveBeenCalledExactlyOnceWith('select_native_save', {name: '报告.md'});
    // **新文档绑的是那个文件** ✓ ⇒ ⇒ 引用、句柄、名字、载荷类型都在 ✓（M5-5 ✓）。
    expect(target).toEqual({
      reference: selected.reference,
      handle: selected.key,
      displayName: selected.name,
      sourceFormat: 'markdown',
    });
  });

  it('用户取消选目标，没有目标', async () => {
    native.invoke.mockResolvedValueOnce(null);
    expect(await nativeDiskPorts.saveAs.selectTarget('报告.md')).toBeUndefined();
  });

  it('另存为写字节走通用入口，不走写回原文件那条', async () => {
    native.invoke.mockResolvedValueOnce(undefined);
    await nativeDiskPorts.saveAs.write(selected.key, new Uint8Array([104, 105]));
    // **通用字节写入** ✓ ⇒ ⇒ 那里没有基线 ✓ ⇒ ⇒ 无从复核 ✓（§6.2 ✓）。
    expect(native.invoke).toHaveBeenCalledExactlyOnceWith('write_native_bytes', {
      key: selected.key,
      bytes: [104, 105],
    });
  });

  it('放掉句柄，原生侧不留无主的凭据', async () => {
    native.invoke.mockResolvedValueOnce(undefined);
    await nativeDiskPorts.saveAs.releaseHandle(selected.key);
    expect(native.invoke).toHaveBeenCalledExactlyOnceWith('release_native_file', {
      key: selected.key,
    });
  });
});

describe('Web 形态的端口', () => {
  it('答不了的就抛，整条同步逻辑不跑', async () => {
    await expect(webDiskPorts.sync.detect('k')).rejects.toThrow();
    await expect(webDiskPorts.sync.write('k', new Uint8Array(), 'sync')).rejects.toThrow();
    await expect(webDiskPorts.sync.read('k', 'markdown')).rejects.toThrow();
    // **"那个目标还在吗"也答不了** ✓ ⇒ ⇒ 浏览器没有本地文件 ✓ ⇒ ⇒ 抛 ✓。
    await expect(webDiskPorts.sync.targetPresent('k')).rejects.toThrow();
  });

  it('同目录也答不了，浏览器没有目录可比', async () => {
    await expect(webDiskPorts.sameDirectory('a', 'b')).rejects.toThrow();
  });

  it('另存为同样答不了，那一条走导出下载', async () => {
    await expect(webDiskPorts.saveAs.selectTarget('报告.md')).rejects.toThrow();
    await expect(webDiskPorts.saveAs.write('k', new Uint8Array())).rejects.toThrow();
    await expect(webDiskPorts.saveAs.releaseHandle('k')).rejects.toThrow();
  });
});

describe('载荷类型', () => {
  it('扩展名说了算，一处决定', () => {
    expect(sourceFormatOf('报告.html')).toBe('editable-html');
    expect(sourceFormatOf('报告.htm')).toBe('editable-html');
    expect(sourceFormatOf('报告.markflow.html')).toBe('editable-html');
    expect(sourceFormatOf('报告.md')).toBe('markdown');
    expect(sourceFormatOf('报告.txt')).toBe('markdown');
  });
});
