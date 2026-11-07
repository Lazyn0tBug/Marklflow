import {useEffect,useSyncExternalStore,type ReactNode} from 'react';
import {needsAcknowledgement,noticeStore,type Notice} from '../../application/notices';
import {MessageCard,MessageStatusBar} from '../../presentation/messages';

/**
 * 通知列表 ✓：**只画与转发** ✓（设计 §6 ✓）。
 *
 * **计时在这里** ✓ ⇒ ⇒ 卡片只画内容与转发关闭 ✓ ⇒ ⇒ 呈现组件不碰计时 ✓。
 *
 * **等确认的那条不定时** ✓ ⇒ ⇒ 它一直留着，直到用户认了它 ✓（设计 §8 ✓）
 * ⇒ ⇒ 形状也跟着换 ✓（持续的那条 ✓ ⇒ ⇒ 瞬时的那条 ✓）
 * ⇒ ⇒ **形状由消失的条件分** ✓ ⇒ ⇒ 不是由语气分 ✓。
 *
 * **播报语义照旧** ✓：还是 `status` ✓ ⇒ ⇒ 迁移不改它说了什么 ✓。
 */

/** 一条通知 ✓。 */
function NoticeItem({notice}:{notice:Notice}):ReactNode{
 const manual=needsAcknowledgement(notice.category);
 const code=notice.category?`（${notice.category} · ${notice.diagnosticId??notice.id}）`:'';
 useEffect(()=>{
  // 等确认的那条不自己走 ✓ ⇒ ⇒ 只有一次告知才定时 ✓。
  if(manual)return;
  const timer=setTimeout(()=>noticeStore.dismiss(notice.id),10000);
  return()=>clearTimeout(timer);
 },[notice.id,manual]);
 if(manual){
  return <MessageStatusBar
   tone={notice.tone}
   title={notice.message}
   body={code}
   role="status"
   ariaLabel="通知"
   acknowledgeLabel="知道了"
   onAcknowledge={()=>noticeStore.dismiss(notice.id)}/>;
 }
 return <MessageCard
  tone={notice.tone}
  body={notice.message+code}
  role="status"
  ariaLabel="通知"
  actions={[{label:'关闭',ariaLabel:'关闭通知',onClick:()=>noticeStore.dismiss(notice.id)}]}/>;
}

export function NoticeList():ReactNode{
 const notices=useSyncExternalStore(noticeStore.subscribe,noticeStore.list,noticeStore.list);
 return <>{notices.map(notice=><NoticeItem key={notice.id} notice={notice}/>)}</>;
}
