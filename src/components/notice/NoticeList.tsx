import {useRef, useSyncExternalStore, type ReactNode} from 'react';
import {
  needsAcknowledgement,
  NOTICE_AUTO_HIDE_MS,
  noticeStore,
  type Notice,
} from '../../application/notices';
import {MessageCard, MessageStatusBar, useMessageLifecycle} from '../../presentation/messages';

function NoticeItem({notice}: {notice: Notice}): ReactNode {
  const elementRef = useRef<HTMLDivElement>(null);
  const manual = needsAcknowledgement(notice.category);
  const dismiss = useMessageLifecycle({
    elementRef,
    leaving: notice.leaving,
    autoHideMs: manual ? undefined : NOTICE_AUTO_HIDE_MS,
    onHide: () => noticeStore.dismiss(notice.id),
    onExited: () => noticeStore.remove(notice.id),
  });
  const code = notice.category
    ? `（${notice.category} · ${notice.diagnosticId ?? notice.id}）`
    : '';
  if (manual)
    return (
      <MessageStatusBar
        elementRef={elementRef}
        tone={notice.tone}
        title={notice.message}
        body={code}
        role="status"
        ariaLabel="通知"
        leaving={notice.leaving}
        acknowledgeLabel="知道了"
        onAcknowledge={dismiss}
      />
    );
  return (
    <MessageCard
      elementRef={elementRef}
      tone={notice.tone}
      body={notice.message + code}
      role="status"
      ariaLabel="通知"
      leaving={notice.leaving}
      actions={[{label: '关闭', ariaLabel: '关闭通知', onClick: dismiss}]}
    />
  );
}

export function NoticeList(): ReactNode {
  const notices = useSyncExternalStore(noticeStore.subscribe, noticeStore.list, noticeStore.list);
  return (
    <>
      {notices.map((notice) => (
        <NoticeItem key={notice.id} notice={notice} />
      ))}
    </>
  );
}
