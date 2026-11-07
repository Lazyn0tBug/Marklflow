import {it,expect,vi,beforeEach} from 'vitest';
import {reportFailure} from '../../src/core/platform/failures';
import {noticeStore} from '../../src/application/notices';

/**
 * The failure outlet: one report ⇒ the log, the console and (when the user has to know it) a
 * notice that carries the category and a diagnostic id, but never the raw text.
 */

const native=vi.hoisted(()=>({isTauri:vi.fn(),invoke:vi.fn()}));
vi.mock('@tauri-apps/api/core',()=>native);

beforeEach(()=>{
  vi.resetAllMocks();
  native.isTauri.mockReturnValue(false);
  native.invoke.mockResolvedValue(undefined);
  noticeStore.clear();
});

it('reports the failure and tells the user about it',async()=>{
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
  const id=await reportFailure({category:'save-failed',detail:'磁盘满了',cause:new Error('磁盘满了')});
  // 用户面：类别 ＋ 诊断 id ＋ 一句可行动的话 ✓，**没有原文** ✓。
  const notices=noticeStore.list();
  expect(notices).toHaveLength(1);
  expect(notices[0]?.message).toBe('保存失败，内容仍在工作区');
  expect(notices[0]?.category).toBe('save-failed');
  expect(notices[0]?.diagnosticId).toBe(id);
  expect(notices[0]?.message).not.toContain('磁盘满了');
  // 控制台：原文在 ✓（开发者看得到 ✓）。
  expect(spy.mock.calls[0]?.[1]).toBe('save-failed');
  expect(String(spy.mock.calls[0]?.[3])).toContain('磁盘满了');
  spy.mockRestore();
});

it('keeps a surface failure on its own surface',async()=>{
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
  await reportFailure({category:'preview-unavailable',detail:'预览起不来'});
  // 预览那块自己显示 ⇒ ⇒ 不进通知面 ✓（设计 §2.1 ✓）。
  expect(noticeStore.list()).toHaveLength(0);
  expect(spy).toHaveBeenCalledOnce();
  spy.mockRestore();
});

it('lets the caller say more than the category does',async()=>{
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
  await reportFailure({category:'save-failed',message:'保存失败（未命名），内容仍在工作区'});
  expect(noticeStore.list()[0]?.message).toBe('保存失败（未命名），内容仍在工作区');
  spy.mockRestore();
});

it('does not take the application down when the channel fails',async()=>{
  native.isTauri.mockReturnValue(true);
  native.invoke.mockRejectedValue(new Error('通道挂了'));
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
  await expect(reportFailure({category:'save-failed'})).resolves.toBeTruthy();
  spy.mockRestore();
});
