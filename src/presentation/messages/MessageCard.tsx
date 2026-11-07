import type {ReactNode} from 'react';
import {MessagePanel} from './MessagePanel';
import type {MessageAction,MessageTone,Optional} from './types';

/**
 * 瞬时通知卡片 ✓：**纯呈现** ✓（设计 §5 ✓）。
 *
 * **它不持有任何消息状态** ✓ ⇒ ⇒ 没有计时 ✓、没有队列 ✓、没有通知存储 ✓
 * ⇒ ⇒ 关掉、展开、播报都**由外面给** ✓ ⇒ ⇒ 组件只画与转发 ✓。
 *
 * **它不主动播报** ✓ ⇒ ⇒ 默认不设 `role` / `aria-live` ✓ ⇒ ⇒ 播报入口只有一个 ✓
 * ⇒ ⇒ 调用方要 assertive 就显式给 `role="alert"` ✓ ⇒ ⇒ 要沿用外层播报区就不给 ✓。
 *
 * **语气不管紧急度** ✓：语气只改颜色 ✓ ⇒ ⇒ 播报紧急度是调用方的事 ✓。
 */

export interface MessageCardProps{
 /** 视觉语气 ✓（四种 ✓ ⇒ ⇒ 只改颜色 ✓）。 */
 tone?:Optional<MessageTone>;
 /** 标题 ✓（可有可无 ✓ ⇒ ⇒ 有才画 ✓）。 */
 title?:Optional<string>;
 /** 正文 ✓。 */
 body:string;
 /** 详情 ✓（有详情才给展开 ✓）。 */
 detail?:Optional<string>;
 /** 需要的动作 ✓（不画按钮就一条都不画 ✓）。 */
 actions?:Optional<readonly MessageAction[]>;
 /** 关掉 ✓：**由外面给** ✓ ⇒ ⇒ 组件不决定它什么时候没 ✓。 */
 onClose?:Optional<()=>void>;
 /** 关闭按钮的名字 ✓（默认"关闭" ✓）。 */
 closeLabel?:Optional<string>;
 /** 详情展开没有 ✓：**由外面给** ✓ ⇒ ⇒ 组件只画展开后的样子 ✓。 */
 expanded?:Optional<boolean>;
 /** 展开/收起 ✓：**由外面给** ✓。 */
 onToggleDetail?:Optional<()=>void>;
 /** 播报语义 ✓（不给就不播报 ✓ ⇒ ⇒ 同一消息只有一个播报入口 ✓）。 */
 role?:Optional<'status'|'alert'>;
 /** 播报语气 ✓（不给就不播报 ✓）。 */
 live?:Optional<'polite'|'assertive'|'off'>;
 /** 宿主给的额外类名 ✓。 */
 className?:Optional<string>;
}

export function MessageCard(props:MessageCardProps):ReactNode{
 const {tone='info',title,body,detail,actions=[],onClose,closeLabel='关闭',expanded=false,onToggleDetail,role,live,className}=props;
 const list:MessageAction[]=[
  ...actions,
  ...(onClose?[{label:closeLabel,onClick:onClose}]:[]),
 ];
 return <div
  className={className?`mf-message-card ${className}`:'mf-message-card'}
  data-shape="transient"
  data-tone={tone}
  {...(role?{role}:{})}
  {...(live?{'aria-live':live}:{})}>
  <MessagePanel title={title} body={body} detail={detail} expanded={expanded} onToggleDetail={onToggleDetail} actions={list}/>
 </div>;
}
