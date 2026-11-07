import {useEffect,useSyncExternalStore,type ReactElement} from 'react';
import {noticeStore,type Notice} from '../../application/notices';

/**
 * 通知面：**多条并存 · 可关闭 · 四种语气** ✓（设计 §4 ✓）。
 *
 * **不是一个状态** ✓：后一条不盖掉前一条 ✓ ⇒ ⇒ 每条各自可关 ✓
 * ⇒ ⇒ 不打断正在做的事 ✓ ⇒ ⇒ `alert()` 那种模态退场了 ✓。
 *
 * **失败那条给出类别与诊断 id** ✓ ⇒ ⇒ 不给原始堆栈 ✓ ⇒ ⇒ 用户能念出来 ✓
 * ⇒ ⇒ 拿它对得上控制台那一条 ✓。
 *
 * **语气四种** ✓：成功与失败都在这一类里 ✓ ⇒ ⇒ 用语气区分 ✓。
 */

const TONE_CLASS:Record<Notice['tone'],string>={
 success:'bg-teal-950/95 border-teal-700 text-teal-100',
 info:'bg-neutral-900/95 border-neutral-700 text-neutral-100',
 warning:'bg-amber-950/95 border-amber-700 text-amber-100',
 error:'bg-red-950/95 border-red-700 text-red-100',
};

/** 一条通知 ✓：**自己管自己的定时** ✓ ⇒ ⇒ 关掉就是关掉 ✓。 */
function NoticeItem({notice}:{notice:Notice}):ReactElement{
 useEffect(()=>{
  const timer=setTimeout(()=>noticeStore.dismiss(notice.id),10000);
  return()=>clearTimeout(timer);
 },[notice.id]);
 const code=notice.category?`（${notice.category} · ${notice.diagnosticId??notice.id}）`:'';
 return <div role="status" aria-label="通知" className={`flex max-w-sm items-start gap-3 rounded-lg border px-3 py-2 text-xs shadow-xl no-print ${TONE_CLASS[notice.tone]}`}>
  <span className="wrap-anywhere">{notice.message}{code}</span>
  <button aria-label="关闭通知" className="ml-auto shrink-0 underline" onClick={()=>noticeStore.dismiss(notice.id)}>关闭</button>
 </div>;
}

export function NoticeSurface():ReactElement|null{
 const notices=useSyncExternalStore(noticeStore.subscribe,noticeStore.list,noticeStore.list);
 if(notices.length===0)return null;
 return <div className="fixed bottom-10 right-4 z-[60] flex flex-col items-end gap-2 no-print" aria-label="通知列表">
  {notices.map(notice=><NoticeItem key={notice.id} notice={notice}/>)}
 </div>;
}
