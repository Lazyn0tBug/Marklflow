import {useId,type ReactNode} from 'react';
import './messages.css';

/**
 * 消息卡片：**纯呈现** ✓（设计 §5 ✓）。
 *
 * **它不持有任何消息状态** ✓ ⇒ ⇒ 没有计时 ✓、没有队列 ✓、没有通知存储 ✓
 * ⇒ ⇒ 关掉、展开、播报都**由外面给** ✓ ⇒ ⇒ 组件只画与转发 ✓。
 *
 * **它不主动播报** ✓ ⇒ ⇒ 默认不设 `role` / `aria-live` ✓ ⇒ ⇒ 播报入口只有一个 ✓
 * ⇒ ⇒ 调用方要 assertive 就显式给 `role="alert"` ✓ ⇒ ⇒ 要沿用外层播报区就不给 ✓。
 *
 * **语气不管紧急度** ✓：语气只改颜色 ✓ ⇒ ⇒ 播报紧急度是调用方的事 ✓。
 *
 * **样式在 `messages.css`** ✓：那份 CSS 自己站得住 ✓ ⇒ ⇒ 这一页加载它就能看全 ✓。
 */

export type MessageTone='success'|'info'|'warning'|'error';

export interface MessageAction{
 /** 动作上的字 ✓。 */
 label:string;
 /** 动作做什么 ✓：由外面给 ✓ ⇒ ⇒ 组件不替业务决定 ✓。 */
 onClick:()=>void;
 /** 是不是主动作 ✓（主动作视觉上更重 ✓）。 */
 primary?:boolean;
}

export interface MessageCardProps{
 /** 视觉语气 ✓（四种 ✓ ⇒ ⇒ 只改颜色 ✓）。 */
 tone?:MessageTone;
 /** 标题 ✓（可有可无 ✓ ⇒ ⇒ 有才画 ✓）。 */
 title?:string;
 /** 正文 ✓。 */
 body:string;
 /** 详情 ✓（有详情才给展开 ✓）。 */
 detail?:string;
 /** 需要的动作 ✓（不画按钮就一条都不画 ✓）。 */
 actions?:readonly MessageAction[];
 /** 关掉 ✓：**由外面给** ✓ ⇒ ⇒ 组件不决定它什么时候没 ✓。 */
 onClose?:()=>void;
 /** 关闭按钮的名字 ✓（默认"关闭" ✓）。 */
 closeLabel?:string;
 /** 详情展开没有 ✓：**由外面给** ✓ ⇒ ⇒ 组件只画展开后的样子 ✓。 */
 expanded?:boolean;
 /** 展开/收起 ✓：**由外面给** ✓。 */
 onToggleDetail?:()=>void;
 /** 播报语义 ✓（不给就不播报 ✓ ⇒ ⇒ 同一消息只有一个播报入口 ✓）。 */
 role?:'status'|'alert';
 /** 播报语气 ✓（不给就不播报 ✓）。 */
 live?:'polite'|'assertive'|'off';
 /** 宿主给的额外类名 ✓。 */
 className?:string;
}

export function MessageCard(props:MessageCardProps):ReactNode{
 const {tone='info',title,body,detail,actions,onClose,closeLabel='关闭',expanded=false,onToggleDetail,role,live,className}=props;
 const open=expanded===true;
 const detailId=useId();
 const hasActions=Boolean(onClose||onToggleDetail||(actions&&actions.length>0));
 return <div
  className={className?`mf-message-card ${className}`:'mf-message-card'}
  data-shape="transient"
  data-tone={tone}
  {...(role?{role}:{})}
  {...(live?{'aria-live':live}:{})}>
  <div className="mf-message-card__content">
   {title?<p className="mf-message-card__title">{title}</p>:null}
   <p className="mf-message-card__text">{body}</p>
   {detail?
    <div className="mf-message-card__detail" id={detailId} hidden={!open}>
     <p className="mf-message-card__detail-text">{detail}</p>
    </div>:null}
  </div>
  {hasActions?
   <div className="mf-message-card__actions">
    {detail&&onToggleDetail?
     <button type="button" className="mf-message-button" aria-expanded={open} aria-controls={detailId} onClick={onToggleDetail}>{open?'收起':'详情'}</button>:null}
    {actions?.map(action=>
     <button key={action.label} type="button" className={action.primary?'mf-message-button mf-message-button--primary':'mf-message-button'} onClick={action.onClick}>{action.label}</button>)}
    {onClose?
     <button type="button" className="mf-message-button mf-message-card__close" aria-label={closeLabel} onClick={onClose}>{closeLabel}</button>:null}
   </div>:null}
 </div>;
}
