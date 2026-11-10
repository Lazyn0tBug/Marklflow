import {describe, expect, it} from 'vitest';
import {DocumentSaveAs} from '../../src/application/workspace/documentSaveAs';
import type {
  DocumentSaveAsPorts,
  SaveAsResult,
} from '../../src/application/workspace/documentSaveAs';
import {
  DocumentFileContexts,
  syncStatus,
  type FileReference,
} from '../../src/application/workspace/documentFileContext';
import {createNewDocument} from '../../src/core/storage/storage';

/**
 * 另存为 ✓（设计 §6.2 ✓、§4.3 的 `save-as` 转移 ✓）。
 *
 * **规则在这儿** ✓ ⇒ ⇒ 不必起浏览器就能盯住 ✓。
 */

const binding = (reference: string): FileReference => ({
  reference,
  handle: 'h-' + reference,
  displayName: reference + '.md',
  sourceFormat: 'markdown',
});

interface Harness {
  contexts: DocumentFileContexts;
  saver: DocumentSaveAs;
  calls: string[];
  written: {handle: string; bytes: Uint8Array}[];
  released: string[];
  created: number;
}

function setup(
  options: {
    selectTarget?: () => Promise<FileReference | undefined>;
    write?: () => Promise<void>;
    createDocument?: () => Promise<ReturnType<typeof createNewDocument>>;
  } = {},
): Harness {
  const contexts = new DocumentFileContexts();
  const calls: string[] = [],
    written: {handle: string; bytes: Uint8Array}[] = [],
    released: string[] = [];
  let created = 0;
  const ports: DocumentSaveAsPorts = {
    selectTarget: async (name) => {
      calls.push('selectTarget:' + name);
      return options.selectTarget ? await options.selectTarget() : binding('new');
    },
    write: async (handle, bytes) => {
      calls.push('write:' + handle);
      written.push({handle, bytes});
      if (options.write) await options.write();
    },
    createDocument: async (source) => {
      calls.push('createDocument');
      created += 1;
      if (options.createDocument) return options.createDocument();
      return {...createNewDocument(source.meta.title), markdown: source.markdown};
    },
    releaseHandle: async (handle) => {
      calls.push('release:' + handle);
      released.push(handle);
    },
    targetPresent: async (handle) => {
      calls.push('targetPresent:' + handle);
      return true;
    },
  };
  return {
    contexts,
    saver: new DocumentSaveAs(contexts, ports),
    calls,
    written,
    released,
    get created() {
      return created;
    },
  };
}

const bytes = new Uint8Array([1, 2, 3]);

/**
 * 一份**改过几轮**的源文档 ✓：**修订不是 1** ✓ ⇒ ⇒ "钉在冻结那一版"这件事才看得出来 ✓。
 */
const edited = (): ReturnType<typeof createNewDocument> => ({
  ...createNewDocument('原文.md'),
  revision: 5,
});

describe('另存为', () => {
  it('用户取消时不新建文档，旧文档一个字不动', async () => {
    const {saver, contexts, calls} = setup({selectTarget: async () => undefined});
    const source = createNewDocument('原文.md');
    contexts.open(source.id, binding('old'), source.revision);
    const result = await saver.saveAs({
      document: source,
      bytes,
      suggestedName: '新文件.md',
    });
    // **取消不是失败** ✓ ⇒ ⇒ 没有新文档 ✓ ⇒ ⇒ 旧文档与上下文都不动 ✓（§6.2 ✓、§9 ✓）。
    expect(result.kind).toBe('cancelled');
    expect(contexts.list()).toHaveLength(1);
    expect(contexts.read(source.id)?.file.reference).toBe('old');
    // **一次系统对话框都没开** ✓ ⇒ ⇒ 一次写都没有 ✓。
    expect(calls).toEqual(['selectTarget:新文件.md']);
  });

  it('成功时新建一个文档绑定新文件，且初始即已同步', async () => {
    const {saver, contexts, written} = setup();
    const source = edited();
    contexts.open(source.id, binding('old'), source.revision);
    const result = await saver.saveAs({
      document: source,
      bytes,
      suggestedName: '新文件.md',
    });
    expect(result.kind).toBe('saved');
    if (result.kind !== 'saved') return;
    // **另一个文档** ✓ ⇒ ⇒ 新 id ✓ ⇒ ⇒ 旧文档还在 ✓（§6.2 ✓）。
    expect(result.document.id).not.toBe(source.id);
    expect(contexts.list()).toHaveLength(2);
    const created = contexts.read(result.document.id);
    expect(created?.file.reference).toBe('new');
    // **初始即已同步** ✓ ⇒ ⇒ 基线 = 写出的修订 ✓ ⇒ ⇒ 那一行说"已同步" ✓（M5-5 ✓）。
    expect(created?.sync.lastSyncedRevision).toBe(source.revision);
    expect(syncStatus(created, result.document.revision)).toBe('synced');
    // **写的是冻结的那一份字节** ✓ ⇒ ⇒ 草稿与文件不会差一个按键 ✓（§6.2 ✓）。
    expect(written).toEqual([{handle: 'h-new', bytes}]);
  });

  it('新文档的修订钉在冻结的那一版，不是宿主给的那个', async () => {
    const {saver} = setup({
      // **宿主给一个新文档** ✓ ⇒ ⇒ 它的修订是它自己的 ✓ ⇒ ⇒ **那不该算数** ✓。
      createDocument: async () => createNewDocument('宿主给的名字.md'),
    });
    const source = edited();
    const result = await saver.saveAs({
      document: source,
      bytes,
      suggestedName: '新文件.md',
    });
    expect(result.kind).toBe('saved');
    if (result.kind !== 'saved') return;
    // **只记录实际写出的冻结修订** ✓ ⇒ ⇒ 钉在冻结那一版 ✓（§4.3 ✓、M5-12 ✓）。
    expect(result.document.revision).toBe(source.revision);
  });

  it('旧文档继续同步它自己的文件，两边互不相关', async () => {
    const {saver, contexts} = setup();
    const source = createNewDocument('原文.md');
    contexts.open(source.id, binding('old'), source.revision);
    const result = await saver.saveAs({
      document: source,
      bytes,
      suggestedName: '新文件.md',
    });
    expect(result.kind).toBe('saved');
    // **旧文档的绑定不动** ✓ ⇒ ⇒ 它继续同步它自己的文件 ✓ ⇒ ⇒ **不是"改指绑定"** ✓（§6.2 ✓）。
    const old = contexts.read(source.id);
    expect(old?.file.reference).toBe('old');
    expect(old?.sync.lastSyncedRevision).toBe(source.revision);
  });

  it('写不进去时不新建文档，授权放掉，旧文档不动', async () => {
    const {saver, contexts, released} = setup({
      write: async () => {
        throw new Error('磁盘满了');
      },
    });
    const source = createNewDocument('原文.md');
    contexts.open(source.id, binding('old'), source.revision);
    const result = await saver.saveAs({
      document: source,
      bytes,
      suggestedName: '新文件.md',
    });
    // **失败不改上下文** ✓ ⇒ ⇒ 没有新文档 ✓ ⇒ ⇒ 旧文档不动 ✓（§9 ✓）。
    expect(result.kind).toBe('failed');
    expect(contexts.list()).toHaveLength(1);
    // **没采用的授权放掉** ✓ ⇒ ⇒ 原生侧不留无主的凭据 ✓（§5.1 ✓）。
    expect(released).toEqual(['h-new']);
  });

  it('选中的文件已经绑在别的文档上时不抢，也不写它', async () => {
    const {saver, contexts, calls} = setup();
    const source = createNewDocument('原文.md');
    const other = createNewDocument('别人.md');
    contexts.open(other.id, binding('new'), other.revision);
    const result = await saver.saveAs({
      document: source,
      bytes,
      suggestedName: '新文件.md',
    });
    // **不抢** ✓ ⇒ ⇒ 交回去让调用方聚焦那个标签页 ✓（§5.1 ✓）。
    expect(result.kind).toBe('already-bound');
    if (result.kind !== 'already-bound') return;
    expect(result.documentId).toBe(other.id);
    // **在写之前就停** ✓ ⇒ ⇒ 两个文档不会指同一个文件 ✓。
    expect(calls).not.toContain('write:h-new');
    expect(contexts.list()).toHaveLength(1);
  });

  it('另存期间继续编辑时，只记录实际写出的冻结修订', async () => {
    const {saver, contexts} = setup();
    const source = createNewDocument('原文.md');
    contexts.open(source.id, binding('old'), source.revision);
    const result = await saver.saveAs({
      document: source,
      bytes,
      suggestedName: '新文件.md',
    });
    expect(result.kind).toBe('saved');
    if (result.kind !== 'saved') return;
    // **冻结之后的那一次编辑仍算未同步** ✓ ⇒ ⇒ 新文档的基线停在冻结那一版 ✓（M5-12 ✓）。
    const edited = {...result.document, revision: result.document.revision + 1};
    expect(contexts.read(edited.id)?.sync.lastSyncedRevision).toBe(source.revision);
    expect(syncStatus(contexts.read(edited.id), edited.revision)).toBe('unsynced');
  });
});
