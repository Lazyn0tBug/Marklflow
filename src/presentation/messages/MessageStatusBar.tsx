import type {ReactNode, RefObject} from 'react';
import {MessagePanel} from './MessagePanel';
import type {MessageAction, MessageTone, Optional} from './types';

/**
 * 持续状态条 ✓：**纯呈现** ✓（设计 §5、§8 ✓）。
 *
 * **它长在条件还成立的时候** ✓ ⇒ ⇒ 与瞬时那条的区别不是样式，是**消失的条件** ✓
 * ⇒ ⇒ 谁来收走它由外面决定 ✓ ⇒ ⇒ 组件自己不定时、不消失 ✓。
 *
 * **确认是它自己的动作** ✓：`onAcknowledge` ✓ ⇒ ⇒ 与瞬时那条的"关闭"不是一回事 ✓
 * ⇒ ⇒ 一条要人确认的消息，等的就是这个动作 ✓。
 *
 * **消息上不挂重试** ✓：重试是用户再点一次保存 ⇒ ⇒ 同一条路 ✓ ⇒ ⇒ 不新创路径 ✓。
 */

export interface MessageStatusBarProps {
  /** Optional element handle for an external lifecycle adapter. */
  elementRef?: Optional<RefObject<HTMLDivElement | null>>;
  /** 视觉语气 ✓（只改颜色 ✓ ⇒ ⇒ 不管播报紧急度 ✓）。 */
  tone?: Optional<MessageTone>;
  /** 标题 ✓（持续的那条总得说清是什么 ✓）。 */
  title: string;
  /** 正文 ✓（可有可无 ✓）。 */
  body?: Optional<string>;
  /** 详情 ✓（有详情才给展开 ✓）。 */
  detail?: Optional<string>;
  /** 详情展开没有 ✓：**由外面给** ✓。 */
  expanded?: Optional<boolean>;
  /** 展开/收起 ✓：**由外面给** ✓。 */
  onToggleDetail?: Optional<() => void>;
  /** 别的动作 ✓（比如"另存为" ✓）。 */
  actions?: Optional<readonly MessageAction[]>;
  /** 确认 ✓：**由外面给** ✓ ⇒ ⇒ 用户认了它才收 ✓。 */
  onAcknowledge?: Optional<() => void>;
  /** 确认按钮的字 ✓（默认"知道了" ✓）。 */
  acknowledgeLabel?: Optional<string>;
  /** 播报语义 ✓（不给就不播报 ✓）。 */
  role?: Optional<'status' | 'alert'>;
  /** 播报语气 ✓（不给就不播报 ✓）。 */
  live?: Optional<'polite' | 'assertive' | 'off'>;
  /** 宿主给的额外类名 ✓。 */
  className?: Optional<string>;
  /** 这一条的无障碍名 ✓（不给就没有名字 ✓）。 */
  ariaLabel?: Optional<string>;
  /** 正在退场 ✓（渐隐往下沉 ✓ ⇒ ⇒ 组件不决定它什么时候没 ✓）。 */
  leaving?: Optional<boolean>;
}

export function MessageStatusBar(props: MessageStatusBarProps): ReactNode {
  const {
    tone = 'info',
    title,
    body,
    detail,
    actions = [],
    onAcknowledge,
    acknowledgeLabel = '知道了',
    expanded = false,
    onToggleDetail,
    role,
    live,
    className,
    ariaLabel,
    leaving,
    elementRef,
  } = props;
  const list: MessageAction[] = [
    ...actions,
    ...(onAcknowledge ? [{label: acknowledgeLabel, onClick: onAcknowledge, primary: true}] : []),
  ];
  return (
    <div
      ref={elementRef}
      inert={leaving || undefined}
      className={className ? `mf-message-card ${className}` : 'mf-message-card'}
      data-shape="persistent"
      data-tone={tone}
      {...(role ? {role} : {})}
      {...(live ? {'aria-live': live} : {})}
      {...(ariaLabel ? {'aria-label': ariaLabel} : {})}
      {...(leaving ? {'data-leaving': 'true'} : {})}
    >
      <MessagePanel
        title={title}
        body={body}
        detail={detail}
        expanded={expanded}
        onToggleDetail={onToggleDetail}
        actions={list}
      />
    </div>
  );
}
