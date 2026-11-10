import type {TargetStatus} from '../../src/application/workspace/targetStatus';
import {describe, expect, it} from 'vitest';
import {DocumentOpener} from '../../src/application/workspace/documentOpen';
import {
  DocumentFileContexts,
  syncStatus,
} from '../../src/application/workspace/documentFileContext';
import {createNewDocument} from '../../src/core/storage/storage';
import type {ImportFile} from '../../src/application/workspace/sourceImport';

/**
 * **打开与绑定是同一件事** ✓（设计 §4.3 ✓）。
 *
 * **规则在这里被盯住** ✓ ⇒ ⇒ 不必起浏览器、不必开桌面外壳 ✓。
 */

const file = (name: string, fileIdentity = 'f1'): ImportFile & {fileIdentity: string} => ({
  name,
  size: 3,
  fileIdentity,
});

function setup(options: {sameVersion?: () => Promise<TargetStatus>} = {}) {
  const contexts = new DocumentFileContexts();
  const opened: string[] = [];
  const released: string[] = [];
  const opener = new DocumentOpener<ImportFile & {fileIdentity: string}>(contexts, {
    open: async (doc) => {
      opened.push(doc.id);
      return {status: 'opened'};
    },
    reference: (input) => ({
      reference: input.fileIdentity,
      handle: 'grant-' + input.fileIdentity,
      displayName: input.name,
      sourceFormat: 'markdown',
    }),
    boundDocument: (reference) => contexts.documentFor(reference),
    detect: options.sameVersion ?? (async () => 'ready'),
    releaseHandle: async (handle) => {
      released.push(handle);
    },
  });
  return {contexts, opener, opened, released};
}

describe('打开本地文件', () => {
  it('binds the file to the document it opened', async () => {
    const {contexts, opener, opened} = setup();
    const doc = createNewDocument('本地.md');
    expect(await opener.open(doc, file('本地.md'))).toEqual({status: 'opened'});
    expect(opened).toEqual([doc.id]);
    // **绑定就位** ✓ ⇒ ⇒ 引用与句柄都在 ✓ ⇒ ⇒ 刚打开不显示未同步 ✓。
    const context = contexts.read(doc.id);
    expect(context?.file.reference).toBe('f1');
    expect(context?.file.handle).toBe('grant-f1');
    expect(context?.sync.lastSyncedRevision).toBe(doc.revision);
  });

  it('binds the file again when the content it belongs to is already in the workspace', async () => {
    const {contexts} = setup();
    const doc = createNewDocument('本地.md');
    const opener = new DocumentOpener<ImportFile & {fileIdentity: string}>(contexts, {
      // **归属命中** ✓ ⇒ ⇒ 聚焦工作区里那一份 ✓ ⇒ ⇒ 不新建 ✓。
      open: async () => ({status: 'focused', existing: doc}),
      reference: (input) => ({
        reference: input.fileIdentity,
        handle: 'grant-f1',
        displayName: input.name,
        sourceFormat: 'markdown',
      }),
      boundDocument: (reference) => contexts.documentFor(reference),
      detect: async () => 'ready',
      releaseHandle: async () => {},
    });
    await opener.open(doc, file('本地.md'));
    // **绑定指回那一份** ✓ ⇒ ⇒ 这份内容仍是这份文件的 ✓ ⇒ ⇒ 打开本地文件就有同步目标 ✓。
    const context = contexts.read(doc.id);
    expect(context?.file.reference).toBe('f1');
    // **草稿与文件当前内容相同 ⇒ ⇒ 基线 = 草稿修订 ⇒ ⇒ 已同步 ✓**（§2.3 ✓）。
    expect(context?.sync.lastSyncedRevision).toBe(doc.revision);
  });

  it('marks it unsynced when the draft and the file no longer agree', async () => {
    const {contexts} = setup();
    const doc = createNewDocument('本地.md');
    const opener = new DocumentOpener<ImportFile & {fileIdentity: string}>(contexts, {
      // **草稿已经改过** ✓ ⇒ ⇒ 与文件当前内容不同 ✓。
      open: async () => ({
        status: 'focused',
        existing: {...doc, markdown: '改过的内容', revision: doc.revision + 1},
      }),
      reference: (input) => ({
        reference: input.fileIdentity,
        handle: 'grant-f1',
        displayName: input.name,
        sourceFormat: 'markdown',
      }),
      boundDocument: (reference) => contexts.documentFor(reference),
      detect: async () => 'ready',
      releaseHandle: async () => {},
    });
    await opener.open(doc, file('本地.md'));
    // **不同 ⇒ ⇒ 基线 null ⇒ ⇒ 按未同步显示 ✓ ⇒ ⇒ 不静默覆盖草稿 ✓**（§2.3 ✓）。
    expect(contexts.read(doc.id)?.sync.lastSyncedRevision).toBeNull();
    // **基线 null ⇒ ⇒ 状态就是未同步** ✓ ⇒ ⇒ **不说已同步** ✓ ⇒ ⇒ 不骗用户 ✓（§2.3 ✓）。
    expect(syncStatus(contexts.read(doc.id), doc.revision)).toBe('unsynced');
    // **草稿一个字没动** ✓ ⇒ ⇒ 不静默覆盖草稿 ✓（§2.3 ✓）。
    expect(contexts.read(doc.id)?.sync.failure).toBeNull();
  });

  it('treats a CRLF file as the same content', async () => {
    const {contexts} = setup();
    const doc = createNewDocument('本地.md');
    const opener = new DocumentOpener<ImportFile & {fileIdentity: string}>(contexts, {
      // **编辑器的值是 LF** ✓ ⇒ ⇒ CRLF 的文件不该平白判成"不同" ✓。
      open: async () => ({status: 'focused', existing: {...doc, markdown: '一行\n两行'}}),
      reference: (input) => ({
        reference: input.fileIdentity,
        handle: 'grant-f1',
        displayName: input.name,
        sourceFormat: 'markdown',
      }),
      boundDocument: (reference) => contexts.documentFor(reference),
      detect: async () => 'ready',
      releaseHandle: async () => {},
    });
    await opener.open({...doc, markdown: '一行\r\n两行'}, file('本地.md'));
    expect(contexts.read(doc.id)?.sync.lastSyncedRevision).toBe(doc.revision);
  });

  it('releases the handle when the file is already bound to another document', async () => {
    const {contexts, released} = setup();
    const first = createNewDocument('先开的.md');
    const opener = new DocumentOpener<ImportFile & {fileIdentity: string}>(contexts, {
      open: async () => ({status: 'opened'}),
      reference: (input) => ({
        reference: input.fileIdentity,
        handle: 'grant-f1',
        displayName: input.name,
        sourceFormat: 'markdown',
      }),
      boundDocument: (reference) => contexts.documentFor(reference),
      detect: async () => 'ready',
      releaseHandle: async (handle) => {
        released.push(handle);
      },
    });
    await opener.open(first, file('先开的.md'));
    const second = createNewDocument('后开的.md');
    const opener2 = new DocumentOpener<ImportFile & {fileIdentity: string}>(contexts, {
      open: async () => ({status: 'opened'}),
      reference: (input) => ({
        reference: input.fileIdentity,
        handle: 'grant-f2',
        displayName: input.name,
        sourceFormat: 'markdown',
      }),
      boundDocument: (reference) => contexts.documentFor(reference),
      detect: async () => 'ready',
      releaseHandle: async (handle) => {
        released.push(handle);
      },
    });
    await opener2.open(second, file('后开的.md', 'f1'));
    // **同一个文件只能绑一份内容** ✓ ⇒ ⇒ 这次没有成为绑定的凭据 ✓ ⇒ ⇒ 放掉 ✓（§5.1 ✓）。
    expect(contexts.read(second.id)).toBeUndefined();
    expect(released).toEqual(['grant-f2']);
  });

  it('finds the bound document and says the file did not change', async () => {
    const {contexts, opener} = setup();
    const doc = createNewDocument('本地.md');
    await opener.open(doc, file('本地.md'));
    // **命中既有绑定** ✓ ⇒ ⇒ 聚焦那个标签页 ✓ ⇒ ⇒ 不新建 ✓。
    expect(await opener.bound(file('本地.md'))).toEqual({documentId: doc.id, target: 'ready'});
    // **没绑过的文件** ⇒ ⇒ 没有 ✓ ⇒ ⇒ 走正常打开 ✓。
    expect(await opener.bound(file('别的.md', 'f2'))).toBeUndefined();
  });

  it('says the file changed when the disk no longer holds that version', async () => {
    const contexts = new DocumentFileContexts();
    const doc = createNewDocument('本地.md');
    const opener = new DocumentOpener<ImportFile & {fileIdentity: string}>(contexts, {
      open: async () => ({status: 'opened'}),
      reference: (input) => ({
        reference: input.fileIdentity,
        handle: 'grant-f1',
        displayName: input.name,
        sourceFormat: 'markdown',
      }),
      boundDocument: (reference) => contexts.documentFor(reference),
      detect: async () => 'changed',
      releaseHandle: async () => {},
    });
    await opener.open(doc, file('本地.md'));
    // **磁盘变了** ✓ ⇒ ⇒ 交给用户决定 ✓ ⇒ ⇒ 不静默覆盖 ✓（M4-9 ✓）。
    expect(await opener.bound(file('本地.md'))).toEqual({documentId: doc.id, target: 'changed'});
  });

  it('treats a question the native side cannot answer as changed', async () => {
    const contexts = new DocumentFileContexts();
    const doc = createNewDocument('本地.md');
    const opener = new DocumentOpener<ImportFile & {fileIdentity: string}>(contexts, {
      open: async () => ({status: 'opened'}),
      reference: (input) => ({
        reference: input.fileIdentity,
        handle: 'grant-f1',
        displayName: input.name,
        sourceFormat: 'markdown',
      }),
      boundDocument: (reference) => contexts.documentFor(reference),
      // **答不了** ✓ ⇒ ⇒ 那是"无法证明" ✓ ⇒ ⇒ 按变了处理 ✓ ⇒ ⇒ 问用户 ✓（§2.3 ✓）。
      detect: async () => {
        throw new Error('native state unavailable');
      },
      releaseHandle: async () => {},
    });
    await opener.open(doc, file('本地.md'));
    expect(await opener.bound(file('本地.md'))).toEqual({documentId: doc.id, target: 'changed'});
  });
});
