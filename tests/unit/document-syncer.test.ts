import {describe, expect, it} from 'vitest';
import {DocumentSyncer} from '../../src/application/workspace/documentSyncer';
import type {
  ConflictChoice,
  ConflictRequest,
  DocumentSyncPorts,
  WriteIntent,
  WriteOutcome,
} from '../../src/application/workspace/documentSyncer';
import {
  DocumentFileContexts,
  syncStatus,
  type FileReference,
} from '../../src/application/workspace/documentFileContext';
import {createNewDocument} from '../../src/core/storage/storage';

/**
 * 应用层同步 ✓（设计 §6.5 ✓、§17 的 M5-b1 ✓）。
 *
 * **规则在这儿** ✓ ⇒ ⇒ 不必起浏览器、不必开桌面外壳 ✓ ⇒ ⇒ 每一项结果都能被单独盯住 ✓。
 */

const binding = (reference: string, handle = reference): FileReference => ({
  reference,
  handle,
  displayName: `${reference}.md`,
  sourceFormat: 'markdown',
});

interface Harness {
  contexts: DocumentFileContexts;
  syncer: DocumentSyncer;
  calls: string[];
  writes: {handle: string; intent: WriteIntent}[];
  decided: ConflictRequest[];
}

/** 端口的替身 ✓：**每个都记下自己被叫过** ✓ ⇒ ⇒ 断言的是"问了哪个" ✓。 */
function setup(
  options: {
    sameVersion?: () => Promise<boolean>;
    write?: () => Promise<WriteOutcome>;
    read?: () => Promise<string>;
    decide?: () => Promise<ConflictChoice>;
    persistDraft?: () => Promise<void>;
    applyPulled?: () => Promise<number>;
  } = {},
): Harness {
  const contexts = new DocumentFileContexts();
  const calls: string[] = [],
    writes: {handle: string; intent: WriteIntent}[] = [],
    decided: ConflictRequest[] = [];
  const ports: DocumentSyncPorts = {
    persistDraft: async () => {
      calls.push('persistDraft');
      await options.persistDraft?.();
    },
    sameVersion: async (handle) => {
      calls.push('sameVersion:' + handle);
      return options.sameVersion ? options.sameVersion() : true;
    },
    write: async (handle, _bytes, intent) => {
      calls.push('write:' + intent);
      writes.push({handle, intent});
      return options.write ? options.write() : {kind: 'written'};
    },
    read: async (handle) => {
      calls.push('read:' + handle);
      return options.read ? options.read() : '文件上的内容';
    },
    decide: async (request) => {
      calls.push('decide');
      decided.push(request);
      return options.decide ? options.decide() : 'overwrite';
    },
    applyPulled: async (documentId, markdown) => {
      calls.push('applyPulled:' + markdown);
      return options.applyPulled ? options.applyPulled() : documentId.length;
    },
  };
  return {contexts, syncer: new DocumentSyncer(contexts, ports), calls, writes, decided};
}

const bytes = new Uint8Array([1, 2, 3]);

describe('应用层同步', () => {
  it('没有同步目标时不问原生侧，结果是不适用', async () => {
    const {syncer, calls, contexts} = setup();
    const doc = createNewDocument('没有目标.md');
    const outcome = await syncer.save({document: doc, bytes});
    // **一个磁盘端口都不问** ✓ ⇒ ⇒ Web 形态就是这样 ✓ ⇒ ⇒ 整条同步逻辑不跑 ✓（§6.5 ✓）。
    expect(calls).toEqual(['persistDraft']);
    // **没有同步目标 ⇒ ⇒ 写回不适用** ✓ ⇒ ⇒ 报"不适用" ✓ ⇒ ⇒ **入口已经灰掉** ✓（§8.2 ✓）
    // ⇒ ⇒ **走不到这一步** ✓ ⇒ ⇒ **不提示要不要另存** ✓ ⇒ ⇒ 这里不问、也不自动做 ✓。
    expect(outcome.writeBack).toEqual({kind: 'not-applicable'});
    expect(outcome.conflict).toBeUndefined();
    // **草稿那一半照样落** ✓ ⇒ ⇒ 草稿与写回是分开的两件事 ✓。
    expect(outcome.draft).toEqual({kind: 'saved'});
    expect(contexts.read(doc.id)).toBeUndefined();
  });

  it('草稿没存住时写回是未尝试', async () => {
    const {syncer, calls, contexts} = setup({
      persistDraft: async () => {
        throw new Error('落盘失败');
      },
    });
    const doc = createNewDocument('草稿失败.md');
    contexts.open(doc.id, binding('f1'), doc.revision);
    const outcome = await syncer.save({document: doc, bytes});
    // **草稿失败 ⇒ ⇒ 本次保存结束** ✓ ⇒ ⇒ 不同步一份没存住的草稿 ✓（§6.5 ✓）。
    expect(outcome.draft.kind).toBe('failed');
    expect(outcome.writeBack).toEqual({kind: 'not-attempted'});
    // **一个磁盘端口都不问** ✓ ⇒ ⇒ 原文件一个字节没动 ✓。
    expect(calls).toEqual(['persistDraft']);
  });

  it('文件还是那一版时写回，基线跟着走到写出的那一版', async () => {
    const {syncer, calls, contexts} = setup();
    const doc = createNewDocument('原文件.md');
    contexts.open(doc.id, binding('f1'), doc.revision);
    const outcome = await syncer.save({document: doc, bytes});
    expect(outcome.writeBack).toEqual({kind: 'written', revision: doc.revision});
    expect(calls).toEqual(['persistDraft', 'sameVersion:f1', 'write:sync']);
    // **写回成功 ⇒ ⇒ 基线 = 写出的冻结修订** ✓（§6.5 ✓）。
    expect(contexts.read(doc.id)?.sync.lastSyncedRevision).toBe(doc.revision);
    // **成功 ⇒ ⇒ 没有失败** ✓。
    expect(contexts.read(doc.id)?.sync.failure).toBeNull();
    expect(syncStatus(contexts.read(doc.id), doc.revision)).toBe('synced');
  });

  it('文件被改过而草稿没改时走自动反向同步，不算冲突', async () => {
    const {syncer, calls, contexts} = setup({
      sameVersion: async () => false,
      read: async () => '磁盘上的新内容',
      applyPulled: async () => 9,
    });
    const doc = createNewDocument('只改了文件.md');
    contexts.open(doc.id, binding('f1'), doc.revision);
    const outcome = await syncer.save({document: doc, bytes});
    // **草稿自上次同步后没改 ⇒ ⇒ 那不是冲突，是一次更新** ✓（§6.1 ✓、M5-13 ✓）。
    expect(outcome.writeBack).toEqual({kind: 'reloaded', revision: 9});
    // **不弹提示** ✓ ⇒ ⇒ 没有问用户 ✓。
    expect(calls).not.toContain('decide');
    expect(calls).toEqual([
      'persistDraft',
      'sameVersion:f1',
      'read:f1',
      'applyPulled:磁盘上的新内容',
    ]);
    // **没有人在场 ⇒ ⇒ 没有 conflict** ✓ ⇒ ⇒ 反馈**不说"本地改动不保留"** ✓。
    expect(outcome.conflict).toBeUndefined();
    // **草稿取文件的版本 ⇒ ⇒ 基线跟着更新** ✓。
    expect(contexts.read(doc.id)?.sync.lastSyncedRevision).toBe(9);
  });

  it('两边都改过时问用户，覆盖落成已写回', async () => {
    const {syncer, calls, writes, decided, contexts} = setup({
      sameVersion: async () => false,
      decide: async () => 'overwrite',
    });
    const doc = createNewDocument('两边都改.md');
    contexts.open(doc.id, binding('f1'), doc.revision - 1);
    const outcome = await syncer.save({document: doc, bytes});
    // **问一次** ✓ ⇒ ⇒ 三个选择 ✓（§6.1 ✓）。
    expect(decided).toEqual([{documentId: doc.id, revision: doc.revision, displayName: 'f1.md'}]);
    // **覆盖 = 正向写回** ✓ ⇒ ⇒ 端口说"这次是覆盖" ✓ ⇒ ⇒ 基准由原生侧选 ✓（§6.1 ✓）。
    expect(writes).toEqual([{handle: 'f1', intent: 'overwrite'}]);
    // **覆盖落在已写回** ✓ ⇒ ⇒ 三个选择各落到一项结果上 ✓。
    expect(outcome.writeBack).toEqual({kind: 'written', revision: doc.revision});
    // **问过 ⇒ ⇒ 带 conflict** ✓ ⇒ ⇒ 反馈知道是用户做的决定 ✓。
    expect(outcome.conflict).toBe('overwrite');
    expect(contexts.read(doc.id)?.sync.lastSyncedRevision).toBe(doc.revision);
    expect(calls).not.toContain('read:f1');
  });

  it('两边都改过时用户选重载，落在重载而不是已写回', async () => {
    const {syncer, contexts} = setup({
      sameVersion: async () => false,
      decide: async () => 'reload',
      read: async () => '磁盘上的新内容',
      applyPulled: async () => 9,
    });
    const doc = createNewDocument('选重载.md');
    contexts.open(doc.id, binding('f1'), doc.revision - 1);
    const outcome = await syncer.save({document: doc, bytes});
    // **重载 = 草稿取文件的版本** ✓ ⇒ ⇒ 结果是 `reloaded` ✓ ⇒ ⇒ **不能记作已写回** ✓（§6.1 ✓）。
    expect(outcome.writeBack).toEqual({kind: 'reloaded', revision: 9});
    // **有人交出了自己的改动** ✓ ⇒ ⇒ **带上 conflict** ✓ ⇒ ⇒ 反馈**要说"本地改动不保留"** ✓。
    expect(outcome.conflict).toBe('reload');
    expect(contexts.read(doc.id)?.sync.lastSyncedRevision).toBe(9);
  });

  it('两边都改过时用户选取消，两边都不动且不算失败', async () => {
    const {syncer, contexts} = setup({
      sameVersion: async () => false,
      decide: async () => 'cancel',
    });
    const doc = createNewDocument('选取消.md');
    contexts.open(doc.id, binding('f1'), doc.revision - 1);
    const outcome = await syncer.save({document: doc, bytes});
    // **取消 ⇒ ⇒ 两边都不动** ✓ ⇒ ⇒ 结果是取消 ✓（§6.5 ✓）。
    expect(outcome.writeBack).toEqual({kind: 'cancelled'});
    expect(outcome.conflict).toBe('cancel');
    // **基线不变** ✓ ⇒ ⇒ 仍是未同步 ✓ ⇒ ⇒ 下次保存还会问 ✓。
    expect(contexts.read(doc.id)?.sync.lastSyncedRevision).toBe(doc.revision - 1);
    // **取消不算失败** ✓ ⇒ ⇒ 不写失败字段 ✓ ⇒ ⇒ 界面说未同步，不说失败 ✓（§2.2 ✓）。
    expect(contexts.read(doc.id)?.sync.failure).toBeNull();
    expect(syncStatus(contexts.read(doc.id), doc.revision)).toBe('unsynced');
  });

  it('写不进去时草稿不动、绑定不变，并记下失败', async () => {
    const {syncer, contexts} = setup({
      write: async () => ({kind: 'failed', error: new Error('IO 失败')}),
    });
    const doc = createNewDocument('写不进.md');
    contexts.open(doc.id, binding('f1'), doc.revision);
    const outcome = await syncer.save({document: doc, bytes});
    expect(outcome.writeBack.kind).toBe('failed');
    // **草稿不动** ✓ ⇒ ⇒ **绑定不变** ✓ ⇒ ⇒ 基线不变 ✓（§6.5 ✓）。
    expect(contexts.read(doc.id)?.sync.lastSyncedRevision).toBe(doc.revision);
    // **失败记下来** ✓ ⇒ ⇒ 失败优先于基线 ✓ ⇒ ⇒ 界面说失败，不说"已同步" ✓（§2.3 ✓）。
    expect(contexts.read(doc.id)?.sync.failure).toEqual({kind: 'write-failed'});
    expect(syncStatus(contexts.read(doc.id), doc.revision)).toBe('failed');
  });

  it('端口抛了就是失败，不会甩出这次保存', async () => {
    const {syncer, contexts} = setup({
      write: async () => {
        throw new Error('通道断了');
      },
    });
    const doc = createNewDocument('端口抛了.md');
    contexts.open(doc.id, binding('f1'), doc.revision);
    // **一次失败不许甩出去** ✓ ⇒ ⇒ 保存这一趟自己收住 ✓ ⇒ ⇒ 记下失败 ✓。
    const outcome = await syncer.save({document: doc, bytes});
    expect(outcome.writeBack.kind).toBe('failed');
    expect(contexts.read(doc.id)?.sync.failure).toEqual({kind: 'write-failed'});
  });

  it('答不了"还是不是那一版"时按失败算', async () => {
    const {syncer, contexts} = setup({
      sameVersion: async () => {
        throw new Error('原生侧答不了');
      },
    });
    const doc = createNewDocument('答不了.md');
    contexts.open(doc.id, binding('f1'), doc.revision);
    const outcome = await syncer.save({document: doc, bytes});
    expect(outcome.writeBack.kind).toBe('failed');
    expect(contexts.read(doc.id)?.sync.failure).toEqual({kind: 'write-failed'});
  });

  it('目标在问答之后又变了，重新分流到冲突而不是静默覆盖', async () => {
    let questions = 0,
      writes = 0;
    const {
      syncer,
      calls,
      writes: writeCalls,
      contexts,
    } = setup({
      // **第一次问答说还是那一版** ✓ ⇒ ⇒ 走正向写回 ✓。
      sameVersion: async () => {
        questions += 1;
        return questions === 1;
      },
      // **写的时候目标又变了** ✓ ⇒ ⇒ 报"目标又变了" ✓ ⇒ ⇒ 重新分流 ✓（§8.6 ✓）。
      write: async () => {
        writes += 1;
        return writes === 1 ? {kind: 'target-changed'} : {kind: 'written'};
      },
      decide: async () => 'overwrite',
    });
    const doc = createNewDocument('又变了.md');
    contexts.open(doc.id, binding('f1'), doc.revision - 1);
    const outcome = await syncer.save({document: doc, bytes});
    // **重新分流 ⇒ ⇒ 问过用户** ✓ ⇒ ⇒ 不是静默覆盖 ✓。
    expect(calls.filter((call) => call === 'decide')).toHaveLength(1);
    // **第一次是普通写回，第二次才是覆盖** ✓ ⇒ ⇒ 基准由原生侧按意图选 ✓（§6.1 ✓）。
    expect(writeCalls.map((call) => call.intent)).toEqual(['sync', 'overwrite']);
    expect(outcome.writeBack).toEqual({kind: 'written', revision: doc.revision});
    expect(outcome.conflict).toBe('overwrite');
    // **不是失败** ✓ ⇒ ⇒ 不写失败字段 ✓。
    expect(contexts.read(doc.id)?.sync.failure).toBeNull();
  });

  it('覆盖期间目标又变了，重新提示而不是覆盖', async () => {
    let writes = 0;
    const {syncer, calls, decided, contexts} = setup({
      sameVersion: async () => false,
      decide: async () => 'overwrite',
      write: async () => {
        writes += 1;
        return writes === 1 ? {kind: 'target-changed'} : {kind: 'written'};
      },
    });
    const doc = createNewDocument('覆盖时又变.md');
    contexts.open(doc.id, binding('f1'), doc.revision - 1);
    const outcome = await syncer.save({document: doc, bytes});
    // **覆盖期间目标又变了 ⇒ ⇒ 重新提示** ✓（M5-19 ✓）。
    expect(calls.filter((call) => call === 'decide')).toHaveLength(2);
    expect(decided).toHaveLength(2);
    expect(outcome.writeBack).toEqual({kind: 'written', revision: doc.revision});
  });

  it('切换标签页期间完成的同步按文档 ID 回填，不串到别的文档', async () => {
    const {syncer, contexts} = setup();
    const first = createNewDocument('第一个.md');
    const second = createNewDocument('第二个.md');
    contexts.open(first.id, binding('f1'), first.revision);
    contexts.open(second.id, binding('f2'), second.revision);
    await syncer.save({document: first, bytes});
    // **只更新它自己的那个文档** ✓ ⇒ ⇒ 另一个文档一个字没动 ✓（§6.5 ✓）。
    expect(contexts.read(first.id)?.sync.lastSyncedRevision).toBe(first.revision);
    expect(contexts.read(second.id)?.sync.lastSyncedRevision).toBe(second.revision);
    expect(syncStatus(contexts.read(second.id), second.revision + 1)).toBe('unsynced');
  });

  it('重新关联之后的那次写回不更新当前上下文', async () => {
    const {syncer, contexts} = setup();
    const doc = createNewDocument('换文件.md');
    contexts.open(doc.id, binding('f1'), doc.revision);
    const pending = syncer.save({document: doc, bytes});
    // **重新关联** ✓ ⇒ ⇒ 绑定换了 ✓。
    contexts.reAssociate(doc.id, binding('f2'));
    const outcome = await pending;
    // **结果仍然只对原目标成立** ✓ ⇒ ⇒ 报告它 ✓。
    expect(outcome.writeBack).toEqual({kind: 'written', revision: doc.revision});
    // **当前上下文不动** ✓ ⇒ ⇒ 新绑定的基线仍是 null ✓ ⇒ ⇒ 按未同步显示 ✓（§6.1 ✓）。
    expect(contexts.read(doc.id)?.sync.lastSyncedRevision).toBeNull();
    expect(contexts.read(doc.id)?.file.reference).toBe('f2');
  });

  it('对同一目标的两次保存不交错', async () => {
    const order: string[] = [];
    const contexts = new DocumentFileContexts();
    const syncer = new DocumentSyncer(contexts, {
      persistDraft: async () => {},
      sameVersion: async () => true,
      write: async (handle) => {
        order.push('write:' + handle);
        await new Promise((resolve) => setTimeout(resolve, 10));
        order.push('done:' + handle);
        return {kind: 'written'};
      },
      read: async () => '',
      decide: async () => 'cancel',
      applyPulled: async () => 0,
    });
    const doc = createNewDocument('串行.md');
    contexts.open(doc.id, binding('f1'), doc.revision);
    await Promise.all([syncer.save({document: doc, bytes}), syncer.save({document: doc, bytes})]);
    // **两个保存不会交错写同一个文件** ✓ ⇒ ⇒ 一次写完再一次 ✓（§6.5 ✓）。
    expect(order).toEqual(['write:f1', 'done:f1', 'write:f1', 'done:f1']);
  });
});
