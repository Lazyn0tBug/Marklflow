import type {ReactNode, RefObject} from 'react';
import {createPortal} from 'react-dom';

/** One app-owned message surface, outside workspace stacking and inert boundaries. */
export function MessageViewport({
  id,
  elementRef,
  colorScheme,
  children,
}: {
  id: string;
  elementRef: RefObject<HTMLDivElement | null>;
  colorScheme: 'light' | 'dark';
  children: ReactNode;
}): ReactNode {
  return createPortal(
    <div
      id={id}
      ref={elementRef}
      className="mf-message no-print"
      data-message-portal
      role="region"
      aria-label="工作台消息"
      tabIndex={-1}
      style={{colorScheme}}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}
