import {useCallback,useEffect,useRef,useSyncExternalStore,type ReactNode,type RefObject} from 'react';
import {needsAcknowledgement,noticeStore,type Notice} from '../../application/notices';
import {MessageCard,MessageStatusBar,MESSAGE_LEAVE_MS} from '../../presentation/messages';

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
 * **关闭分两段** ✓：先标记退场 ✓ ⇒ ⇒ 渐隐往下沉 ✓ ⇒ ⇒ 动画走完才真的收走 ✓
 * ⇒ ⇒ 定时消失的那条也是这么走的 ✓ ⇒ ⇒ 不是"啪"地没了 ✓。
 *
 * **关掉之后焦点要落到还留着的东西上** ✓（设计 §9 ✓）⇒ ⇒ 那个按钮没了之后
 * ⇒ ⇒ 焦点会掉回 body ⇒ ⇒ 键盘的人就丢了位置 ⇒ ⇒ 这里把它接回去 ✓。
 *
 * **两条消失的路都走这里** ✓：手动关 ✓ 与定时走 ✓ ⇒ ⇒ 定时走的那条也要接住焦点 ✓
 * ⇒ ⇒ 否则键盘的人放着不动的消息也会把位置丢掉 ✓。
 */

/**
 * 退场动画有多长 ✓ ⇒ ⇒ **与 `messages.css` 里那个 transition 一样长** ✓。
 *
 * 两处各写一个数字会漂 ✓ ⇒ ⇒ 那个数字在消息模块里有一份 ✓（`MESSAGE_LEAVE_MS` ✓）
 * ⇒ ⇒ 这里与视觉页都用它 ✓ ⇒ ⇒ 样式那边改了就对不上 ⇒ ⇒ 改的时候两边一起改 ✓。
 */

/** 一条通知 ✓。 */
function NoticeItem({notice,onDismiss}:{notice:Notice;onDismiss:(notice:Notice)=>void}):ReactNode{
 const manual=needsAcknowledgement(notice.category);
 const code=notice.category?`（${notice.category} · ${notice.diagnosticId??notice.id}）`:'';
 useEffect(()=>{
  // 等确认的那条不自己走 ✓ ⇒ ⇒ 只有一次告知才定时 ✓。
  if(manual)return;
  // **定时走的那条也走同一条路** ✓ ⇒ ⇒ 焦点由外面接住 ✓ ⇒ ⇒ 这里不自己动存储 ✓。
  const timer=setTimeout(()=>onDismiss(notice),10000);
  return()=>clearTimeout(timer);
 },[notice.id,manual,onDismiss]);
 useEffect(()=>{
  // 退场完了才真的收走 ✓ ⇒ ⇒ 退场动画期间它还在列表里 ✓。
  if(!notice.leaving)return;
  const timer=setTimeout(()=>noticeStore.remove(notice.id),MESSAGE_LEAVE_MS);
  return()=>clearTimeout(timer);
 },[notice.id,notice.leaving]);
 if(manual){
  return <MessageStatusBar
   tone={notice.tone}
   title={notice.message}
   body={code}
   role="status"
   ariaLabel="通知"
   leaving={notice.leaving}
   acknowledgeLabel="知道了"
   onAcknowledge={()=>onDismiss(notice)}/>;
 }
 return <MessageCard
  tone={notice.tone}
  body={notice.message+code}
  role="status"
  ariaLabel="通知"
  leaving={notice.leaving}
  actions={[{label:'关闭',ariaLabel:'关闭通知',onClick:()=>onDismiss(notice)}]}/>;
}

export function NoticeList({regionRef}:{regionRef:RefObject<HTMLDivElement|null>}):ReactNode{
 const notices=useSyncExternalStore(noticeStore.subscribe,noticeStore.list,noticeStore.list);
 /*
  * 关掉的时候只记住**是哪一条** ✓。
  *
  * **区域不在这儿抓** ✓ ⇒ ⇒ 区域是外层那个一直都在的元素 ✓ ⇒ ⇒ 事后也能拿到 ✓
  * ⇒ ⇒ **不从焦点反推区域** ✓ ⇒ ⇒ 平台在点击后不聚焦按钮时（macOS 的 WebKit ✓）
  * ⇒ ⇒ 焦点仍是 body ✓ ⇒ ⇒ 那样就找不到区域 ✓ ⇒ ⇒ 焦点接不住 ✓。
  */
 const closing=useRef<{id:string}|null>(null);
 useEffect(()=>{
  const pending=closing.current;
  if(!pending)return;
  // 还在退场 ⇒ ⇒ 等它走完再说 ✓ ⇒ ⇒ 焦点先留在它身上 ✓。
  if(notices.some(item=>item.id===pending.id))return;
  closing.current=null;
  // 焦点还在别处（用户已经自己移走了）⇒ ⇒ 不抢 ✓。
  if(document.activeElement&&document.activeElement!==document.body)return;
  const region=regionRef.current;
  const next=region?.querySelector<HTMLElement>('.mf-message-button');
  // 还有控件就落到控件上 ✓ ⇒ ⇒ 没有就落到区域本身 ✓（它可编程聚焦 ✓）。
  (next??region)?.focus();
 },[notices,regionRef]);
 /*
  * **引用要稳** ✓ ⇒ ⇒ 计时器依赖它 ✓ ⇒ ⇒ 引用一变，计时器就重置 ✓
  * ⇒ ⇒ 通知一来，那条就永远不走 ✓ ⇒ ⇒ 所以这里不带依赖 ✓。
  */
 const dismiss=useCallback((notice:Notice):void=>{
  closing.current={id:notice.id};
  noticeStore.dismiss(notice.id);
 },[]);
 return <>{notices.map(notice=><NoticeItem key={notice.id} notice={notice} onDismiss={dismiss}/>)}</>;
}
