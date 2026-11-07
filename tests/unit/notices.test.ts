import {it,expect,vi,beforeEach} from 'vitest';
import {NoticeStore,notifiesUser} from '../../src/application/notices';

/**
 * The notice surface: many entries at once, each dismissible, and the ones that belong to a
 * surface (or to an operation) never come here.
 */
it('keeps several notices at once',()=>{
  const store=new NoticeStore();
  store.push({tone:'success',message:'导出完成'});
  store.push({tone:'error',message:'保存失败',category:'save-failed',diagnosticId:'e-1'});
  expect(store.list()).toHaveLength(2);
  // 后一条不盖掉前一条 ✓（那正是"单个状态"的病 ✓）。
  expect(store.list().map(notice=>notice.message)).toEqual(['导出完成','保存失败']);
});

it('dismisses one notice without touching the others',()=>{
  const store=new NoticeStore();
  const first=store.push({tone:'info',message:'一'});
  store.push({tone:'info',message:'二'});
  store.dismiss(first);
  expect(store.list()).toHaveLength(1);
  expect(store.list()[0]?.message).toBe('二');
});

it('tells its subscribers when something changes',()=>{
  const store=new NoticeStore();
  const listener=vi.fn();
  const unsubscribe=store.subscribe(listener);
  store.push({tone:'info',message:'一'});
  expect(listener).toHaveBeenCalledOnce();
  unsubscribe();
  store.push({tone:'info',message:'二'});
  expect(listener).toHaveBeenCalledOnce();
});

it('gives every failure a short diagnostic id',()=>{
  const store=new NoticeStore();
  expect(store.nextDiagnosticId()).toBe('e-1');
  expect(store.nextDiagnosticId()).toBe('e-2');
  expect(store.nextDiagnosticId()).toMatch(/^e-\d+$/);
});

it('tells the failures the user has to know from the ones that stay on their surface',()=>{
  // 用户不点破就会一直不知道的 ⇒ 该说一声 ✓。
  expect(notifiesUser('unhandled')).toBe(true);
  expect(notifiesUser('save-failed')).toBe(true);
  expect(notifiesUser('export-failed')).toBe(true);
  // 表面状态与回执不进通知面 ✓（设计 §2.1 ✓）。
  expect(notifiesUser('render')).toBe(false);
  expect(notifiesUser('storage-corrupted')).toBe(false);
  expect(notifiesUser('preview-unavailable')).toBe(false);
  expect(notifiesUser('import-rejected')).toBe(false);
});
