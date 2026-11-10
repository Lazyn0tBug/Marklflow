import {describe, expect, it} from 'vitest';
import {
  DocumentFileContexts,
  releaseDocumentFileContext,
  syncStatus,
  type FileReference,
} from '../../src/application/workspace/documentFileContext';

/**
 * 上下文与它的转移 ✓（设计 §12.4 ✓）。
 *
 * **这里是纯应用层** ✓ ⇒ ⇒ 不起浏览器 ✓ ⇒ ⇒ 不碰原生 ✓ ⇒ ⇒ 规则本身被盯住 ✓。
 */

const binding = (reference: string, handle = reference): FileReference => ({
  reference,
  handle,
  displayName: `${reference}.md`,
  sourceFormat: 'markdown',
});

describe('文档-文件上下文', () => {
  it('打开就位，刚打开不显示未同步', () => {
    const contexts = new DocumentFileContexts();
    const outcome = contexts.open('d1', binding('f1'), 7);
    expect(outcome.kind).toBe('bound');
    const context = contexts.read('d1');
    // **绑定就位** ✓ ⇒ ⇒ `lastSyncedRevision = document.revision` ✓（M4-1 ✓）。
    expect(context?.file.reference).toBe('f1');
    expect(context?.sync.lastSyncedRevision).toBe(7);
    // **刚打开不显示未同步** ✓ ⇒ ⇒ 状态是"已同步" ✓（§2.3 ✓）。
    expect(syncStatus(context, 7)).toBe('synced');
    // **没有同步目标的文档** ⇒ ⇒ 状态是"无" ✓（§2.2 ✓）。
    expect(syncStatus(undefined, 7)).toBe('none');
    // **改了就是未同步** ✓ ⇒ ⇒ 与会话里那份 dirty 同形 ✓。
    expect(syncStatus(context, 8)).toBe('unsynced');
  });

  it('同一个文件再来一次是聚焦，不是新建', () => {
    const contexts = new DocumentFileContexts();
    contexts.open('d1', binding('f1'), 1);
    const again = contexts.open('d2', binding('f1'), 1);
    // **归属按文件引用** ✓ ⇒ ⇒ 命中的既有标签页 ✓ ⇒ ⇒ 不新建 ✓（§5.3 ✓、M4-4 ✓）。
    expect(again.kind).toBe('already-bound');
    expect(again.kind === 'already-bound' && again.documentId).toBe('d1');
    expect(contexts.read('d2')).toBeUndefined();
    expect(contexts.documentFor('f1')).toBe('d1');
  });

  it('没有"改绑"这个动作', () => {
    const contexts = new DocumentFileContexts();
    contexts.open('d1', binding('f1'), 3);
    // **重新关联那个概念没有了** ✓ ⇒ ⇒ **不是"本期不做"** ✓ ⇒ ⇒
    // **想让这份草稿落到另一个文件 ⇒ ⇒ 那是一次写** ✓ ⇒ ⇒ 由另存为承担 ✓（§4.1 ✓、§16 ✓）。
    // ⇒ ⇒ 上下文上**没有那个方法** ✓ ⇒ ⇒ 用不上的概念不留着 ✓（《概念裁剪》§1 ✓）。
    expect('reAssociate' in contexts).toBe(false);
    expect(Object.getOwnPropertyNames(DocumentFileContexts.prototype)).not.toContain('reAssociate');
  });

  it('关掉文档，句柄跟着放掉', async () => {
    const contexts = new DocumentFileContexts();
    contexts.open('d1', binding('f1', 'grant-1'), 1);
    const released: string[] = [];
    await releaseDocumentFileContext(contexts, 'd1', async (handle) => {
      released.push(handle);
    });
    // **句柄被放掉** ✓ ⇒ ⇒ 走的是这次打开的那一个 ✓（M4-8 ✓、M4-10 ✓）。
    expect(released).toEqual(['grant-1']);
    // **上下文与文件索引一起收走** ✓ ⇒ ⇒ 同一个文件还能再打开 ✓。
    expect(contexts.read('d1')).toBeUndefined();
    expect(contexts.documentFor('f1')).toBeUndefined();
    // **关一个没有上下文的文档** ⇒ ⇒ 不放掉任何东西 ✓。
    await releaseDocumentFileContext(contexts, 'd1', async (handle) => {
      released.push(handle);
    });
    expect(released).toEqual(['grant-1']);
  });

  it('上下文里不留摘要副本', () => {
    const contexts = new DocumentFileContexts();
    contexts.open('d1', binding('f1'), 1);
    const context = contexts.read('d1');
    // **磁盘内容的摘要由原生侧回答** ✓ ⇒ ⇒ 应用侧不留值 ✓（§3.4 ✓、M5-14 ✓）。
    const text = JSON.stringify(context);
    expect(text).not.toMatch(/digest|sha|hash|摘要/i);
  });

  it('写回失败优先于基线：基线相等也说失败', () => {
    const contexts = new DocumentFileContexts();
    contexts.open('d1', binding('f1'), 7);
    // **还没失败** ⇒ ⇒ 基线相等就是已同步 ✓。
    expect(syncStatus(contexts.read('d1'), 7)).toBe('synced');
    contexts.markFailed('d1');
    // **失败优先于基线** ✓ ⇒ ⇒ 基线恰好相等也不说"已同步" ✓（§2.3 ✓、M5-17 ✓）。
    expect(syncStatus(contexts.read('d1'), 7)).toBe('failed');
    // **失败不改基线** ✓ ⇒ ⇒ 草稿不动 ✓ ⇒ ⇒ 绑定不变 ✓。
    expect(contexts.read('d1')?.sync.lastSyncedRevision).toBe(7);
  });

  it('写回成功或反向同步都把失败清掉', () => {
    const contexts = new DocumentFileContexts();
    contexts.open('d1', binding('f1'), 7);
    contexts.markFailed('d1');
    contexts.markWritten('d1', 9);
    // **成功 ⇒ ⇒ 没有失败** ✓ ⇒ ⇒ 基线走到写出的那一版 ✓。
    expect(contexts.read('d1')?.sync.failure).toBeNull();
    expect(contexts.read('d1')?.sync.lastSyncedRevision).toBe(9);
    expect(syncStatus(contexts.read('d1'), 9)).toBe('synced');
    contexts.markFailed('d1');
    contexts.markPulled('d1', 11);
    // **反向同步 ⇒ ⇒ 也清掉失败** ✓ ⇒ ⇒ 基线跟着那一版 ✓。
    expect(contexts.read('d1')?.sync.failure).toBeNull();
    expect(contexts.read('d1')?.sync.lastSyncedRevision).toBe(11);
  });

  it('另存为：新文档绑新文件，旧文档一个字不动', () => {
    const contexts = new DocumentFileContexts();
    contexts.open('d1', binding('f1'), 3);
    // **另存为是一次转移** ✓ ⇒ ⇒ 产生**另一个文档** ✓ ⇒ ⇒ 旧文档不受影响 ✓（§4.3 ✓、§6.2 ✓）。
    // **关联基于读成功** ✓ ⇒ ⇒ 那个答案由调用方给 ✓ ⇒ ⇒ **写成功不是关联** ✓（§4.1 ✓）。
    const created = contexts.saveAs('d2', binding('f2'), 9, true);
    expect(created.documentId).toBe('d2');
    expect(created.file.reference).toBe('f2');
    // **新文档初始即已同步** ✓ ⇒ ⇒ 基线 = 写出的修订 ✓ ⇒ ⇒ 那一行说"已同步" ✓（§6.2 ✓）。
    expect(created.sync.lastSyncedRevision).toBe(9);
    expect(syncStatus(created, 9)).toBe('synced');
    // **有效性就是那次读的答案** ✓ ⇒ ⇒ 不是"写成功了所以它在" ✓（§8.2 ✓）。
    expect(created.file.targetPresent).toBe(true);
    // **旧文档继续同步它自己的文件** ✓ ⇒ ⇒ 两边互不相关 ✓。
    expect(contexts.read('d1')?.file.reference).toBe('f1');
    expect(contexts.read('d1')?.sync.lastSyncedRevision).toBe(3);
    // **两个文档两个文件** ✓ ⇒ ⇒ 索引各归各的 ✓。
    expect(contexts.documentFor('f1')).toBe('d1');
    expect(contexts.documentFor('f2')).toBe('d2');
  });

  it('上下文里没有"冲突待决定"', () => {
    const contexts = new DocumentFileContexts();
    contexts.open('d1', binding('f1'), 7);
    // **冲突不是状态** ✓ ⇒ ⇒ sync 面只有基线与失败两样 ✓（§4.1 ✓、M5-16 ✓）。
    expect(Object.keys(contexts.read('d1')?.sync ?? {}).sort()).toEqual([
      'failure',
      'lastSyncedRevision',
    ]);
    expect(contexts.read('d1')?.sync.failure).toBeNull();
  });
});
