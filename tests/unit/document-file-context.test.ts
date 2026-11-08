import {describe,expect,it} from 'vitest';
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

const binding=(reference:string,handle=reference):FileReference=>({
 reference,
 handle,
 displayName:`${reference}.md`,
 sourceFormat:'markdown',
});

describe('文档-文件上下文',()=>{
 it('打开就位，刚打开不显示未同步',()=>{
  const contexts=new DocumentFileContexts();
  const outcome=contexts.open('d1',binding('f1'),7);
  expect(outcome.kind).toBe('bound');
  const context=contexts.read('d1');
  // **绑定就位** ✓ ⇒ ⇒ `lastSyncedRevision = document.revision` ✓（M4-1 ✓）。
  expect(context?.file.reference).toBe('f1');
  expect(context?.sync.lastSyncedRevision).toBe(7);
  // **刚打开不显示未同步** ✓ ⇒ ⇒ 状态是"已同步" ✓（§2.3 ✓）。
  expect(syncStatus(context,7)).toBe('synced');
  // **没有同步目标的文档** ⇒ ⇒ 状态是"无" ✓（§2.2 ✓）。
  expect(syncStatus(undefined,7)).toBe('none');
  // **改了就是未同步** ✓ ⇒ ⇒ 与会话里那份 dirty 同形 ✓。
  expect(syncStatus(context,8)).toBe('unsynced');
 });

 it('同一个文件再来一次是聚焦，不是新建',()=>{
  const contexts=new DocumentFileContexts();
  contexts.open('d1',binding('f1'),1);
  const again=contexts.open('d2',binding('f1'),1);
  // **归属按文件引用** ✓ ⇒ ⇒ 命中的既有标签页 ✓ ⇒ ⇒ 不新建 ✓（§5.3 ✓、M4-4 ✓）。
  expect(again.kind).toBe('already-bound');
  expect(again.kind==='already-bound'&&again.documentId).toBe('d1');
  expect(contexts.read('d2')).toBeUndefined();
  expect(contexts.documentFor('f1')).toBe('d1');
 });

 it('重新关联换文件，且无法证明一致',()=>{
  const contexts=new DocumentFileContexts();
  contexts.open('d1',binding('f1'),3);
  const context=contexts.reAssociate('d1',binding('f2'));
  // **file 更新** ✓ ⇒ ⇒ 旧的索引让位 ✓。
  expect(context.file.reference).toBe('f2');
  expect(contexts.documentFor('f1')).toBeUndefined();
  expect(contexts.documentFor('f2')).toBe('d1');
  // **无法证明一致 ⇒ ⇒ 记 null ⇒ ⇒ 按未同步显示** ✓（§2.3 ✓、§5.5 ✓）。
  expect(context.sync.lastSyncedRevision).toBeNull();
  expect(syncStatus(context,3)).toBe('unsynced');
  // **关联不算同步** ✓ ⇒ ⇒ 草稿那份修订一个字没动 ✓ ⇒ ⇒ 这里管不到 ✓。
 });

 it('关掉文档，句柄跟着放掉',async()=>{
  const contexts=new DocumentFileContexts();
  contexts.open('d1',binding('f1','grant-1'),1);
  const released:string[]=[];
  await releaseDocumentFileContext(contexts,'d1',async handle=>{released.push(handle)});
  // **句柄被放掉** ✓ ⇒ ⇒ 走的是这次打开的那一个 ✓（M4-8 ✓、M4-10 ✓）。
  expect(released).toEqual(['grant-1']);
  // **上下文与文件索引一起收走** ✓ ⇒ ⇒ 同一个文件还能再打开 ✓。
  expect(contexts.read('d1')).toBeUndefined();
  expect(contexts.documentFor('f1')).toBeUndefined();
  // **关一个没有上下文的文档** ⇒ ⇒ 不放掉任何东西 ✓。
  await releaseDocumentFileContext(contexts,'d1',async handle=>{released.push(handle)});
  expect(released).toEqual(['grant-1']);
 });

 it('上下文里不留摘要副本',()=>{
  const contexts=new DocumentFileContexts();
  contexts.open('d1',binding('f1'),1);
  const context=contexts.read('d1');
  // **磁盘内容的摘要由原生侧回答** ✓ ⇒ ⇒ 应用侧不留值 ✓（§3.4 ✓、M5-14 ✓）。
  const text=JSON.stringify(context);
  expect(text).not.toMatch(/digest|sha|hash|摘要/i);
 });
});
