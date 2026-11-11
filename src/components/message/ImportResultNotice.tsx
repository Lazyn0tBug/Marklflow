import {useRef, useState} from 'react';
import {
  importResultsAutoHide,
  type ImportItemResult,
} from '../../application/workspace/sourceImport';
import {NOTICE_AUTO_HIDE_MS} from '../../application/notices';
import {MessageResult, useMessageLifecycle} from '../../presentation/messages';

/** One result batch; its owner decides when to remove the data. */
export function ImportResultNotice({
  items,
  onClose,
}: {
  items: readonly ImportItemResult[];
  onClose: () => void;
}) {
  const elementRef = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);
  const dismiss = useMessageLifecycle({
    elementRef,
    leaving,
    autoHideMs: importResultsAutoHide(items) ? NOTICE_AUTO_HIDE_MS : undefined,
    onHide: () => setLeaving(true),
    onExited: onClose,
  });
  return (
    <MessageResult
      elementRef={elementRef}
      leaving={leaving}
      title="导入结果"
      items={items.map((item) => ({
        label: item.name,
        detail: item.message,
        failed: item.status === 'failed',
      }))}
      role={items.some((item) => item.status === 'failed') ? 'alert' : 'status'}
      closeLabel="关闭导入结果"
      onClose={dismiss}
    />
  );
}
