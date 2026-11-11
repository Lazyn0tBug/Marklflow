import type {ReactNode, RefObject} from 'react';
import {MessageActions} from './MessagePanel';
import type {MessageAction, MessageTone, Optional} from './types';

/**
 * 操作结果区 ✓：**纯呈现** ✓（设计 §5 ✓）。
 *
 * **它是一批结果** ✓ ⇒ ⇒ 一次给全 ⇒ ⇒ 细节自己内部滚动 ✓（§9 ✓）。
 *
 * **哪一条失败由数据说** ✓：`failed` ✓ ⇒ ⇒ 语气是**逐条**的 ✓
 * ⇒ ⇒ 整块的语气另给 ✓（`tone` ✓）⇒ ⇒ 两层不混 ✓。
 */

export interface MessageResultItem {
  /** 这一条是什么 ✓（文件名、步骤名 ✓）。 */
  label: string;
  /** 这一条怎么了 ✓（可有可无 ✓ ⇒ ⇒ 没有就只显示名字 ✓）。 */
  detail?: Optional<string>;
  /** 这一条是不是失败 ✓（决定这一条的语气 ✓）。 */
  failed?: Optional<boolean>;
}

export interface MessageResultProps {
  /** Optional element handle for an external lifecycle adapter. */
  elementRef?: Optional<RefObject<HTMLDivElement | null>>;
  /** 这批结果是什么 ✓。 */
  title: string;
  /** 结果 ✓。 */
  items: readonly MessageResultItem[];
  /** 整块的语气 ✓（比如有一条失败就整块偏警告 ✓）。 */
  tone?: Optional<MessageTone>;
  /** 收走这批结果 ✓：**由外面给** ✓。 */
  onClose?: Optional<() => void>;
  /** 收走按钮的字 ✓（默认"关闭" ✓）。 */
  closeLabel?: Optional<string>;
  /** 别的动作 ✓。 */
  actions?: Optional<readonly MessageAction[]>;
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

export function MessageResult(props: MessageResultProps): ReactNode {
  const {
    title,
    items,
    tone = 'info',
    onClose,
    closeLabel = '关闭',
    actions = [],
    role,
    live,
    className,
    ariaLabel,
    leaving,
    elementRef,
  } = props;
  const list: MessageAction[] = [
    ...actions,
    ...(onClose ? [{label: closeLabel, onClick: onClose}] : []),
  ];
  return (
    <div
      ref={elementRef}
      inert={leaving || undefined}
      className={className ? `mf-message-result ${className}` : 'mf-message-result'}
      data-shape="result"
      data-tone={tone}
      {...(role ? {role} : {})}
      {...(live ? {'aria-live': live} : {})}
      {...(ariaLabel ? {'aria-label': ariaLabel} : {})}
      {...(leaving ? {'data-leaving': 'true'} : {})}
    >
      <p className="mf-message-result__title">{title}</p>
      <ul className="mf-message-result__list">
        {items.map((item, index) => (
          <li key={index} {...(item.failed ? {'data-failed': 'true'} : {})}>
            {item.label}
            {item.detail ? `：${item.detail}` : ''}
          </li>
        ))}
      </ul>
      <MessageActions actions={list} />
    </div>
  );
}
