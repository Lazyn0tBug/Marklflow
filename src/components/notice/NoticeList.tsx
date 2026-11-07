import {useEffect,useRef,useSyncExternalStore,type ReactNode} from 'react';
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
 *
 * **关掉之后焦点要落到还留着的东西上** ✓（设计 §9 ✓）⇒ ⇒ 那个按钮没了之后
 * ⇒ ⇒ 焦点会掉回 body ⇒ ⇒ 键盘的人就丢了位置 ⇒ ⇒ 这里把它接回去 ✓。
 */

/** 一条通知 ✓。 */
function NoticeItem({notice,onDismiss}:{notice:Notice;onDismiss:(notice:Notice)=>void}):ReactNode{
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
   onAcknowledge={()=>onDismiss(notice)}/>;
 }
 return <MessageCard
  tone={notice.tone}
  body={notice.message+code}
  role="status"
  ariaLabel="通知"
  actions={[{label:'关闭',ariaLabel:'关闭通知',onClick:()=>onDismiss(notice)}]}/>;
}

export function NoticeList():ReactNode{
 const notices=useSyncExternalStore(noticeStore.subscribe,noticeStore.list,noticeStore.list);
 /*
  * 关掉的时候把两样东西抓住 ✓：**焦点所在的那个按钮** ✓ 与 **它所在的区域** ✓。
  * 区域要**在按钮还在的时候**抓 ✓ ⇒ ⇒ 按钮被移除之后它就找不到了 ✓。
  */
 const closing=useRef<{button:HTMLElement;region:HTMLElement|null}|null>(null);
 useEffect(()=>{
  const previous=closing.current;
  closing.current=null;
  if(!previous)return;
  // 焦点还在别处（用户已经自己移走了）⇒ ⇒ 不抢 ✓。
  if(document.activeElement&&document.activeElement!==document.body)return;
  const next=previous.region?.querySelector<HTMLElement>('.mf-message-button');
  // 还有控件就落到控件上 ✓ ⇒ ⇒ 没有就落到区域本身 ✓（它可编程聚焦 ✓）。
  (next??previous.region)?.focus();
 },[notices]);
 const dismiss=(notice:Notice):void=>{
  const active=document.activeElement instanceof HTMLElement?document.activeElement:null;
  closing.current=active?{button:active,region:active.closest<HTMLElement>('.mf-message')}:null;
  noticeStore.dismiss(notice.id);
 };
 return <>{notices.map(notice=><NoticeItem key={notice.id} notice={notice} onDismiss={dismiss}/>)}</>;
}
