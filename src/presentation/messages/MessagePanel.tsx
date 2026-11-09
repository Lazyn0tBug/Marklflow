import {useId, type ReactNode} from 'react';
import type {MessageAction, Optional} from './types';

/**
 * 消息的内里 ✓：**三种形状共用** ✓（标题、正文、详情、动作 ✓）。
 *
 * **它不持有任何状态** ✓ ⇒ ⇒ 展开与否由外面给 ✓ ⇒ ⇒ 组件只画 ✓。
 *
 * **动作就是动作** ✓：给什么画什么 ✓ ⇒ ⇒ 组件不替业务决定哪一步 ✓。
 */

/** 动作行 ✓：三种形状共用 ✓ ⇒ ⇒ 形状之间不重复写 ✓。 */
export function MessageActions({
  actions,
  label,
  before,
}: {
  actions: readonly MessageAction[];
  label?: string;
  before?: ReactNode;
}): ReactNode {
  if (actions.length === 0 && !before) return null;
  return (
    <div className="mf-message-actions" {...(label ? {'aria-label': label} : {})}>
      {before}
      {actions.map((action, index) => (
        <button
          key={`${index}-${action.label}`}
          type="button"
          className={
            action.primary ? 'mf-message-button mf-message-button--primary' : 'mf-message-button'
          }
          {...(action.ariaLabel ? {'aria-label': action.ariaLabel} : {})}
          onClick={action.onClick}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}

export interface MessagePanelProps {
  /** 标题 ✓（可有可无 ✓）。 */
  title?: Optional<string>;
  /** 正文 ✓。 */
  body?: Optional<string>;
  /** 详情 ✓（有详情才给展开 ✓）。 */
  detail?: Optional<string>;
  /** 详情展开没有 ✓：**由外面给** ✓。 */
  expanded?: Optional<boolean>;
  /** 展开/收起 ✓：**由外面给** ✓。 */
  onToggleDetail?: Optional<() => void>;
  /** 动作 ✓。 */
  actions?: Optional<readonly MessageAction[]>;
}

export function MessagePanel(props: MessagePanelProps): ReactNode {
  const {title, body, detail, expanded = false, onToggleDetail, actions = []} = props;
  const detailId = useId();
  const open = expanded === true;
  const hasDetail = Boolean(detail);
  /*
   * 详情的开关**自己画** ✓ ⇒ ⇒ 它才带得上 `aria-expanded` 与 `aria-controls` ✓
   * ⇒ ⇒ 混进动作列表里就没有了 ✓。
   */
  const toggle =
    hasDetail && onToggleDetail ? (
      <button
        type="button"
        className="mf-message-button"
        aria-expanded={open}
        aria-controls={detailId}
        onClick={onToggleDetail}
      >
        {open ? '收起' : '详情'}
      </button>
    ) : null;
  return (
    <>
      <div className="mf-message-card__content">
        {title ? <p className="mf-message-card__title">{title}</p> : null}
        {body ? <p className="mf-message-card__text">{body}</p> : null}
        {hasDetail ? (
          <div className="mf-message-card__detail" id={detailId} hidden={!open}>
            <p className="mf-message-card__detail-text">{detail}</p>
          </div>
        ) : null}
      </div>
      <MessageActions actions={actions} before={toggle} />
    </>
  );
}
