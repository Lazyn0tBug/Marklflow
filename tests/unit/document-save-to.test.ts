import {describe, expect, it} from 'vitest';
import {DocumentSaveTo} from '../../src/application/workspace/documentSaveTo';
import type {DocumentSaveToPorts} from '../../src/application/workspace/documentSaveTo';
import {
  DocumentFileContexts,
  syncStatus,
  type FileReference,
} from '../../src/application/workspace/documentFileContext';
import {createNewDocument} from '../../src/core/storage/storage';

/**
 * **写到新目标** ✓（设计 §6.2 ✓、§8.2 ✓）。
 *
 * **它是"关联为空时那一次保存"** ✓ ⇒ ⇒ **写成功即建立关联** ✓ ⇒ ⇒
 * **这一份还是这一份** ✓ ⇒ ⇒ 草稿一个字不动 ✓。
 */

const binding = (reference: string): FileReference => ({
  reference,
  handle: 'h-' + reference,
  displayName: reference + '.md',
  sourceFormat: 'markdown',
});

interface Harness {
  contexts: DocumentFileContexts;
  saveTo: DocumentSaveTo;
  calls: string[];
  released: string[];
}

function setup(
  options: {
    selectTarget?: () => Promise<FileReference | undefined>;
    write?: () => Promise<void>;
    targetPresent?: () => Promise<boolean>;
  } = {},
): Harness {
  const contexts = new DocumentFileContexts();
  const calls: string[] = [],
    released: string[] = [];
  const ports: DocumentSaveToPorts = {
    selectTarget: async (name) => {
      calls.push('selectTarget:' + name);
      return options.selectTarget ? await options.selectTarget() : binding('new');
    },
    write: async (handle) => {
      calls.push('write:' + handle);
      if (options.write) await options.write();
    },
    releaseHandle: async (handle) => {
      calls.push('release:' + handle);
      released.push(handle);
    },
    targetPresent: async (handle) => {
      calls.push('targetPresent:' + handle);
      return options.targetPresent ? await options.targetPresent() : true;
    },
  };
  return {contexts, saveTo: new DocumentSaveTo(contexts, ports), calls, released};
}

const bytes = new Uint8Array([1, 2, 3]);

describe('写到新目标', () => {
  it('写成功就把这一份绑上那个文件', async () => {
    const {contexts, saveTo, calls} = setup();
    const doc = createNewDocument('新的.md');
    const result = await saveTo.saveTo({document: doc, bytes, suggestedName: '新的.md'});
    expect(result).toEqual({kind: 'saved', revision: doc.revision});
    // **绑定是写的副效应** ✓ ⇒ ⇒ 写成功才有绑定 ✓（§4.1 ✓、§8.2 ✓）。
    expect(contexts.read(doc.id)?.file.reference).toBe('new');
    expect(contexts.documentFor('new')).toBe(doc.id);
    // **初始即已同步** ✓ ⇒ ⇒ 基线 = 写出的那一版 ✓（§6.2 ✓）。
    expect(contexts.read(doc.id)?.sync.lastSyncedRevision).toBe(doc.revision);
    expect(syncStatus(contexts.read(doc.id), doc.revision)).toBe('synced');
    // **写完跟一次验证读** ✓ ⇒ ⇒ **写完成的定义里含着它** ✓（§6.1 ✓）。
    expect(calls).toEqual(['selectTarget:新的.md', 'write:h-new', 'targetPresent:h-new']);
  });

  it('用户取消时不写也不建立关联', async () => {
    const {contexts, saveTo, calls} = setup({selectTarget: async () => undefined});
    const doc = createNewDocument('新的.md');
    const result = await saveTo.saveTo({document: doc, bytes, suggestedName: '新的.md'});
    // **取消不是失败** ✓ ⇒ ⇒ 什么都没变 ✓（§6.2 ✓、§9 ✓）。
    expect(result).toEqual({kind: 'cancelled'});
    expect(contexts.read(doc.id)).toBeUndefined();
    expect(calls).toEqual(['selectTarget:新的.md']);
  });

  it('那个文件已经开着时不抢', async () => {
    const {contexts, saveTo, released} = setup();
    const other = createNewDocument('别的.md');
    contexts.open(other.id, binding('new'), other.revision);
    const doc = createNewDocument('新的.md');
    const result = await saveTo.saveTo({document: doc, bytes, suggestedName: '新的.md'});
    // **不抢** ✓ ⇒ ⇒ **不写它** ✓ ⇒ ⇒ 放掉这次的句柄 ✓（§5.1 ✓）。
    expect(result).toEqual({kind: 'already-bound', documentId: other.id});
    expect(contexts.read(doc.id)).toBeUndefined();
    expect(released).toEqual(['h-new']);
  });

  it('写不进去就不建立关联', async () => {
    const {contexts, saveTo, released} = setup({
      write: async () => {
        throw new Error('写不进去');
      },
    });
    const doc = createNewDocument('新的.md');
    const result = await saveTo.saveTo({document: doc, bytes, suggestedName: '新的.md'});
    expect(result.kind).toBe('failed');
    // **写不进去 ⇒ ⇒ 没有绑定可建** ✓ ⇒ ⇒ 这一份还在原地 ✓（§6.2 ✓）。
    expect(contexts.read(doc.id)).toBeUndefined();
    expect(released).toEqual(['h-new']);
  });

  it('读答不在就不建立关联', async () => {
    const {contexts, saveTo} = setup({targetPresent: async () => false});
    const doc = createNewDocument('新的.md');
    const result = await saveTo.saveTo({document: doc, bytes, suggestedName: '新的.md'});
    // **关联始终基于读成功** ✓ ⇒ ⇒ **写成功不是关联** ✓ ⇒ ⇒ **读没有确认 ⇒ ⇒ 没有关联** ✓（§4.1 ✓）。
    expect(result).toEqual({kind: 'unconfirmed'});
    // **这一份还在原地** ✓ ⇒ ⇒ 草稿一个字不动 ✓。
    expect(contexts.read(doc.id)).toBeUndefined();
  });

  it('答不了那次读也不建立关联', async () => {
    const {contexts, saveTo} = setup({
      targetPresent: async () => {
        throw new Error('原生侧答不了');
      },
    });
    const doc = createNewDocument('新的.md');
    const result = await saveTo.saveTo({document: doc, bytes, suggestedName: '新的.md'});
    // **答不了 ⇒ ⇒ 不知道** ✓ ⇒ ⇒ **不猜** ✓ ⇒ ⇒ **没有读成功 ⇒ ⇒ 没有关联** ✓（§4.1 ✓）。
    expect(result).toEqual({kind: 'unconfirmed'});
    expect(contexts.read(doc.id)).toBeUndefined();
  });
});
