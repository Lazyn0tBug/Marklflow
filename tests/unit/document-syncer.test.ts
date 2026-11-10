import {describe, expect, it} from 'vitest';
import {DocumentSyncer} from '../../src/application/workspace/documentSyncer';
import type {
  ConflictChoice,
  ConflictRequest,
  DocumentSyncPorts,
  WriteBackResult,
  WriteIntent,
} from '../../src/application/workspace/documentSyncer';
import type {TargetStatus} from '../../src/application/workspace/targetStatus';
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
  writes: {handle: string; intent: WriteIntent; bytes: Uint8Array}[];
  decided: ConflictRequest[];
}

/** 端口的替身 ✓：**每个都记下自己被叫过** ✓ ⇒ ⇒ 断言的是"问了哪个" ✓。 */
function setup(
  options: {
    detect?: () => Promise<TargetStatus>;
    targetPresent?: () => Promise<boolean>;
    write?: () => Promise<TargetStatus>;
    read?: () => Promise<string>;
    decide?: () => Promise<ConflictChoice>;
    applyPulled?: () => Promise<number>;
    askGate?: () => Promise<boolean>;
    saveElsewhere?: () => Promise<WriteBackResult>;
  } = {},
): Harness {
  const contexts = new DocumentFileContexts();
  const calls: string[] = [],
    writes: {handle: string; intent: WriteIntent; bytes: Uint8Array}[] = [],
    decided: ConflictRequest[] = [];
  const ports: DocumentSyncPorts = {
    detect: async (handle) => {
      calls.push('detect:' + handle);
      return options.detect ? options.detect() : 'ready';
    },
    targetPresent: async (handle) => {
      calls.push('targetPresent:' + handle);
      return options.targetPresent ? options.targetPresent() : true;
    },
    write: async (handle, sent, intent) => {
      calls.push('write:' + intent);
      writes.push({handle, intent, bytes: sent});
      return options.write ? options.write() : 'ready';
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
    askGate: async (reason) => {
      calls.push('askGate:' + reason);
      return options.askGate ? options.askGate() : true;
    },
    saveElsewhere: async () => {
      calls.push('saveElsewhere');
      return options.saveElsewhere ? options.saveElsewhere() : {kind: 'written', revision: 1};
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
    expect(calls).toEqual([]);
    // **没有同步目标 ⇒ ⇒ 写回不适用** ✓ ⇒ ⇒ 报"不适用" ✓ ⇒ ⇒ **入口已经灰掉** ✓（§8.2 ✓）
    // ⇒ ⇒ **走不到这一步** ✓ ⇒ ⇒ **不提示要不要另存** ✓ ⇒ ⇒ 这里不问、也不自动做 ✓。
    expect(outcome.writeBack).toEqual({kind: 'not-applicable'});
    expect(outcome.conflict).toBeUndefined();
    expect(contexts.read(doc.id)).toBeUndefined();
  });

  it('写出去的就是冻结的那一批字节', async () => {
    const {syncer, writes, contexts} = setup();
    const doc = createNewDocument('冻结.md');
    contexts.open(doc.id, binding('f1'), doc.revision);
    await syncer.save({document: doc, bytes});
    // **写回去的是被冻结的那一份** ✓ ⇒ ⇒ **草稿与文件不会差一个按键** ✓（§6.1 ✓）
    // ⇒ ⇒ **磁盘上就是那一份** ✓ ⇒ ⇒ **别的东西没有混进去** ✓。
    expect(writes).toEqual([{handle: 'f1', intent: 'sync', bytes}]);
    expect(Array.from(writes[0]!.bytes)).toEqual(Array.from(bytes));
  });

  it('写回结果只有五种，没有"未尝试"', async () => {
    const {syncer, contexts} = setup();
    const doc = createNewDocument('五种.md');
    contexts.open(doc.id, binding('f1'), doc.revision);
    const outcome = await syncer.save({document: doc, bytes});
    // **草稿与写回不接成一个流程** ✓ ⇒ ⇒ 草稿那边**自己报它自己** ✓ ⇒ ⇒
    // **写回不保证草稿已落盘** ✓ ⇒ ⇒ **没有"草稿没存住所以没试"这种结果** ✓（§6.1 ✓、§6.5 ✓）。
    expect(outcome.writeBack.kind).toBe('written');
    // **结果里只有文件那一句** ✓ ⇒ ⇒ 没有草稿那一栏 ✓。
    expect(Object.keys(outcome).sort()).toEqual([
      'conflict',
      'documentId',
      'revision',
      'writeBack',
    ]);
  });

  it('文件还是那一版时写回，基线跟着走到写出的那一版', async () => {
    const {syncer, calls, contexts} = setup();
    const doc = createNewDocument('原文件.md');
    contexts.open(doc.id, binding('f1'), doc.revision);
    const outcome = await syncer.save({document: doc, bytes});
    expect(outcome.writeBack).toEqual({kind: 'written', revision: doc.revision});
    // **写完之后跟一次验证读** ✓ ⇒ ⇒ **写完成的定义里含着它** ✓（§6.1 ✓、§8.2 ✓）。
    expect(calls).toEqual(['detect:f1', 'write:sync', 'targetPresent:f1']);
    // **写回成功 ⇒ ⇒ 基线 = 写出的冻结修订** ✓（§6.5 ✓）。
    expect(contexts.read(doc.id)?.sync.lastSyncedRevision).toBe(doc.revision);
    // **成功 ⇒ ⇒ 没有失败** ✓。
    expect(contexts.read(doc.id)?.sync.failure).toBeNull();
    expect(syncStatus(contexts.read(doc.id), doc.revision)).toBe('synced');
  });

  it('文件被改过而草稿没改时走自动反向同步，不算冲突', async () => {
    const {syncer, calls, contexts} = setup({
      detect: async () => 'changed',
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
    expect(calls).toEqual(['detect:f1', 'read:f1', 'applyPulled:磁盘上的新内容']);
    // **没有人在场 ⇒ ⇒ 没有 conflict** ✓ ⇒ ⇒ 反馈**不说"本地改动不保留"** ✓。
    expect(outcome.conflict).toBeUndefined();
    // **草稿取文件的版本 ⇒ ⇒ 基线跟着更新** ✓。
    expect(contexts.read(doc.id)?.sync.lastSyncedRevision).toBe(9);
  });

  it('两边都改过时问用户，覆盖落成已写回', async () => {
    const {syncer, calls, writes, decided, contexts} = setup({
      detect: async () => 'changed',
      decide: async () => 'overwrite',
    });
    const doc = createNewDocument('两边都改.md');
    contexts.open(doc.id, binding('f1'), doc.revision - 1);
    const outcome = await syncer.save({document: doc, bytes});
    // **问一次** ✓ ⇒ ⇒ 三个选择 ✓（§6.1 ✓）。
    expect(decided).toEqual([{documentId: doc.id, revision: doc.revision, displayName: 'f1.md'}]);
    // **覆盖 = 正向写回** ✓ ⇒ ⇒ 端口说"这次是覆盖" ✓ ⇒ ⇒ 基准由原生侧选 ✓（§6.1 ✓）。
    expect(writes).toEqual([{handle: 'f1', intent: 'overwrite', bytes}]);
    // **覆盖落在已写回** ✓ ⇒ ⇒ 三个选择各落到一项结果上 ✓。
    expect(outcome.writeBack).toEqual({kind: 'written', revision: doc.revision});
    // **问过 ⇒ ⇒ 带 conflict** ✓ ⇒ ⇒ 反馈知道是用户做的决定 ✓。
    expect(outcome.conflict).toBe('overwrite');
    expect(contexts.read(doc.id)?.sync.lastSyncedRevision).toBe(doc.revision);
    expect(calls).not.toContain('read:f1');
  });

  it('两边都改过时用户选重载，落在重载而不是已写回', async () => {
    const {syncer, contexts} = setup({
      detect: async () => 'changed',
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
      detect: async () => 'changed',
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
    const {syncer, contexts, calls} = setup({
      // **写不成就是抛** ✓ ⇒ ⇒ 应用层接住就是失败 ✓（§9 ✓）。
      write: async () => {
        throw new Error('IO 失败');
      },
    });
    const doc = createNewDocument('写不进.md');
    contexts.open(doc.id, binding('f1'), doc.revision);
    const outcome = await syncer.save({document: doc, bytes});
    expect(outcome.writeBack.kind).toBe('failed');
    // **草稿不动** ✓ ⇒ ⇒ **绑定不变** ✓ ⇒ ⇒ 基线不变 ✓（§6.5 ✓）。
    expect(contexts.read(doc.id)?.sync.lastSyncedRevision).toBe(doc.revision);
    // **写不进去 ⇒ ⇒ 也要有那一次读** ✓ ⇒ ⇒ 有效性不来自失败 ✓（§8.2 ✓）。
    expect(calls).toContain('targetPresent:f1');
    // **失败记下来** ✓ ⇒ ⇒ 失败优先于基线 ✓ ⇒ ⇒ 界面说失败，不说"已同步" ✓（§2.3 ✓）。
    expect(contexts.read(doc.id)?.sync.failure).toEqual({kind: 'write-failed'});
    expect(syncStatus(contexts.read(doc.id), doc.revision)).toBe('failed');
  });

  it('目标没了就问要不要继续，说继续就再进一次门', async () => {
    let attempts = 0;
    const {syncer, calls, writes, contexts} = setup({
      write: async () => {
        attempts += 1;
        // **第一次答"不在"** ✓ ⇒ ⇒ **用户说继续之后那一次才写进去** ✓。
        return attempts === 1 ? 'missing' : 'ready';
      },
    });
    const doc = createNewDocument('没了.md');
    contexts.open(doc.id, binding('f1'), doc.revision);
    const outcome = await syncer.save({document: doc, bytes});
    // **问一次** ✓ ⇒ ⇒ 问的是"目标没了"那一句 ✓（§6.1 ✓）。
    expect(calls).toContain('askGate:missing');
    // **再进一次门** ✓ ⇒ ⇒ 那一次**允许目标不存在** ✓ ⇒ ⇒ 其余复核照旧 ✓。
    expect(writes.map((w) => w.intent)).toEqual(['sync', 'continue']);
    expect(outcome.writeBack).toEqual({kind: 'written', revision: doc.revision});
  });

  it('目标没了而用户说不，就放弃', async () => {
    const {syncer, calls, contexts} = setup({
      write: async () => 'missing',
      askGate: async () => false,
    });
    const doc = createNewDocument('没了.md');
    contexts.open(doc.id, binding('f1'), doc.revision);
    const outcome = await syncer.save({document: doc, bytes});
    // **放弃 ⇒ ⇒ 两边都不动** ✓ ⇒ ⇒ **取消不算失败** ✓ ⇒ ⇒ 结果是**取消** ✓（§6.5 ✓）
    // ⇒ ⇒ **`failure` 不写** ✓ ⇒ ⇒ 仍是未同步 ✓ ⇒ ⇒ **不再重进** ✓。
    expect(outcome.writeBack).toEqual({kind: 'cancelled'});
    expect(contexts.read(doc.id)?.sync.failure).toBeNull();
    expect(calls).toEqual(['detect:f1', 'write:sync', 'askGate:missing', 'targetPresent:f1']);
  });

  it('检测那一句答"写不进去"，就走另存那一条分支', async () => {
    const {syncer, calls, contexts} = setup({
      detect: async () => 'unwritable',
    });
    const doc = createNewDocument('写不进.md');
    contexts.open(doc.id, binding('f1'), doc.revision);
    const outcome = await syncer.save({document: doc, bytes});
    // **那一条因此走得到** ✓ ⇒ ⇒ **问的是"写不进去"** ✓ ⇒ ⇒ **不是失败** ✓（§6.1 ✓）。
    expect(calls).toContain('askGate:unwritable');
    // **用户说是 ⇒ ⇒ 换目标** ✓ ⇒ ⇒ **那边再过一次门** ✓。
    expect(calls).toContain('saveElsewhere');
    expect(outcome.writeBack).toEqual({kind: 'written', revision: 1});
  });

  it('写不进去就问要不要另存，说是就换目标', async () => {
    const {syncer, calls, contexts} = setup({
      write: async () => 'unwritable',
    });
    const doc = createNewDocument('写不进.md');
    contexts.open(doc.id, binding('f1'), doc.revision);
    const outcome = await syncer.save({document: doc, bytes});
    // **问的是"写不进去"那一句** ✓ ⇒ ⇒ **是 ⇒ ⇒ 换目标** ✓（§6.1 ✓）。
    expect(calls).toContain('askGate:unwritable');
    expect(calls).toContain('saveElsewhere');
    expect(outcome.writeBack).toEqual({kind: 'written', revision: 1});
  });

  it('写不进去而用户说不，就放弃', async () => {
    const {syncer, calls, contexts} = setup({
      write: async () => 'unwritable',
      askGate: async () => false,
    });
    const doc = createNewDocument('写不进.md');
    contexts.open(doc.id, binding('f1'), doc.revision);
    const outcome = await syncer.save({document: doc, bytes});
    // **放弃 ⇒ ⇒ 两边都不动** ✓ ⇒ ⇒ **取消不算失败** ✓ ⇒ ⇒ 结果是**取消** ✓ ⇒ ⇒ **不换目标** ✓。
    expect(outcome.writeBack).toEqual({kind: 'cancelled'});
    expect(contexts.read(doc.id)?.sync.failure).toBeNull();
    expect(calls).not.toContain('saveElsewhere');
  });

  it('换目标时用户取消了那个对话框，也是取消不是失败', async () => {
    const {syncer, calls, contexts} = setup({
      write: async () => 'unwritable',
      saveElsewhere: async () => ({kind: 'cancelled'}),
    });
    const doc = createNewDocument('写不进.md');
    contexts.open(doc.id, binding('f1'), doc.revision);
    const outcome = await syncer.save({document: doc, bytes});
    // **用户取消 ⇒ ⇒ 那边没成** ✓ ⇒ ⇒ **取消不算失败** ✓ ⇒ ⇒ 两边都不动 ✓（§6.5 ✓、§9 ✓）。
    expect(outcome.writeBack).toEqual({kind: 'cancelled'});
    expect(contexts.read(doc.id)?.sync.failure).toBeNull();
    expect(calls).toContain('saveElsewhere');
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

  it('写完之后跟一次验证读，答案就是关联的有效性', async () => {
    const {syncer, calls, contexts} = setup({targetPresent: async () => false});
    const doc = createNewDocument('目标没了.md');
    contexts.open(doc.id, binding('f1'), doc.revision);
    await syncer.save({document: doc, bytes});
    // **每一次写之后都跟一次读** ✓ ⇒ ⇒ **写完成的定义里含着它** ✓（§6.1 ✓）。
    expect(calls).toEqual(['detect:f1', 'write:sync', 'targetPresent:f1']);
    // **答案写进上下文** ✓ ⇒ ⇒ **关联的有效性由读判断给** ✓ ⇒ ⇒ **不是写的结果** ✓（§8.2 ✓）。
    expect(contexts.read(doc.id)?.file.targetPresent).toBe(false);
  });

  it('答不上那一句时按失败算，但也要有那一次读', async () => {
    const {syncer, calls, contexts} = setup({
      detect: async () => {
        throw new Error('原生侧答不了');
      },
      targetPresent: async () => false,
    });
    const doc = createNewDocument('答不上.md');
    contexts.open(doc.id, binding('f1'), doc.revision);
    await syncer.save({document: doc, bytes});
    // **答不上 ⇒ ⇒ 写没开始** ✓ ⇒ ⇒ **也要有那一次读** ✓ ⇒ ⇒
    // ⇒ ⇒ 关联的有效性因此由读判断给 ✓ ⇒ ⇒ **不是失败推出来的** ✓（§8.2 ✓）。
    expect(calls).toContain('targetPresent:f1');
    expect(contexts.read(doc.id)?.file.targetPresent).toBe(false);
  });

  it('检测那一句答"不在了"，就走那一条分支而不是当失败', async () => {
    const {syncer, calls, contexts} = setup({
      detect: async () => 'missing',
      write: async () => 'ready',
    });
    const doc = createNewDocument('真没了.md');
    contexts.open(doc.id, binding('f1'), doc.revision);
    const outcome = await syncer.save({document: doc, bytes});
    // **那一条因此走得到** ✓ ⇒ ⇒ **问的是"目标没了"** ✓ ⇒ ⇒ **不是失败** ✓（§6.1 ✓）。
    expect(calls).toContain('askGate:missing');
    // **用户说继续 ⇒ ⇒ 再进一次门** ✓ ⇒ ⇒ 这一次允许目标不存在 ✓。
    expect(calls).toContain('write:continue');
    expect(outcome.writeBack).toEqual({kind: 'written', revision: doc.revision});
  });

  it('答不了那个目标还在吗时不猜，留着上一次读到的判断', async () => {
    const {syncer, contexts} = setup({
      targetPresent: async () => {
        throw new Error('原生侧答不了');
      },
    });
    const doc = createNewDocument('答不了目标.md');
    contexts.open(doc.id, binding('f1'), doc.revision);
    const outcome = await syncer.save({document: doc, bytes});
    // **答不了 ⇒ ⇒ 不知道** ✓ ⇒ ⇒ **不猜** ✓ ⇒ ⇒ **不让这次写因此失败** ✓。
    expect(outcome.writeBack).toEqual({kind: 'written', revision: doc.revision});
    // **上一次读到的判断留着** ✓ ⇒ ⇒ 它是**点时事实** ✓（§8.2 ✓）。
    expect(contexts.read(doc.id)?.file.targetPresent).toBe(true);
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
      detect: async () => {
        questions += 1;
        return questions === 1 ? 'ready' : 'changed';
      },
      // **写的时候目标又变了** ✓ ⇒ ⇒ 报"目标又变了" ✓ ⇒ ⇒ 重新分流 ✓（§8.6 ✓）。
      write: async () => {
        writes += 1;
        return writes === 1 ? 'changed' : 'ready';
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
      detect: async () => 'changed',
      decide: async () => 'overwrite',
      write: async () => {
        writes += 1;
        return writes === 1 ? 'changed' : 'ready';
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

  it('另存为之后那次还在飞行的写回只更新原上下文', async () => {
    const {syncer, contexts} = setup();
    const doc = createNewDocument('原文档.md');
    contexts.open(doc.id, binding('f1'), doc.revision);
    const pending = syncer.save({document: doc, bytes});
    // **另存为 ⇒ ⇒ 这一份绑到新文件** ✓ ⇒ ⇒ **在飞的那次是对旧文件的那次** ✓。
    // **基线给一个不一样的修订** ✓ ⇒ ⇒ 迟到的那次若串过来就看得出来 ✓。
    contexts.bindTo(doc.id, binding('f2'), doc.revision + 5, true);
    const outcome = await pending;
    // **结果仍然只对原目标成立** ✓ ⇒ ⇒ 报告它 ✓。
    expect(outcome.writeBack).toEqual({kind: 'written', revision: doc.revision});
    // **当前上下文不动** ✓ ⇒ ⇒ **新绑定的基线不变** ✓ ⇒ ⇒ **迟到的那次不串过来** ✓（M5-11 ✓）。
    expect(contexts.read(doc.id)?.file.reference).toBe('f2');
    expect(contexts.read(doc.id)?.sync.lastSyncedRevision).toBe(doc.revision + 5);
  });

  it('标签页关掉之后那次还在飞行的写回不更新任何上下文', async () => {
    const {syncer, contexts} = setup();
    const doc = createNewDocument('关掉了.md');
    contexts.open(doc.id, binding('f1'), doc.revision);
    const pending = syncer.save({document: doc, bytes});
    // **标签页关掉 ⇒ ⇒ 上下文连同句柄一起收走** ✓（§4.1 ✓）。
    contexts.release(doc.id);
    const outcome = await pending;
    // **结果仍然只对原目标成立** ✓ ⇒ ⇒ 报告它 ✓。
    expect(outcome.writeBack).toEqual({kind: 'written', revision: doc.revision});
    // **当前上下文不动** ✓ ⇒ ⇒ **失效结果只报告原目标的实际结果** ✓ ⇒ ⇒ 不更新任何东西 ✓（§6.1 ✓）。
    expect(contexts.read(doc.id)).toBeUndefined();
  });

  it('对同一目标的两次保存不交错', async () => {
    const order: string[] = [];
    const contexts = new DocumentFileContexts();
    const syncer = new DocumentSyncer(contexts, {
      detect: async () => 'ready',
      targetPresent: async () => true,
      write: async (handle) => {
        order.push('write:' + handle);
        await new Promise((resolve) => setTimeout(resolve, 10));
        order.push('done:' + handle);
        return 'ready';
      },
      read: async () => '',
      decide: async () => 'cancel',
      applyPulled: async () => 0,
      askGate: async () => true,
      saveElsewhere: async () => ({kind: 'written', revision: 1}),
    });
    const doc = createNewDocument('串行.md');
    contexts.open(doc.id, binding('f1'), doc.revision);
    await Promise.all([syncer.save({document: doc, bytes}), syncer.save({document: doc, bytes})]);
    // **两个保存不会交错写同一个文件** ✓ ⇒ ⇒ 一次写完再一次 ✓（§6.5 ✓）。
    expect(order).toEqual(['write:f1', 'done:f1', 'write:f1', 'done:f1']);
  });
});
