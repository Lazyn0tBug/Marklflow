import React, {useEffect, useRef} from 'react';

/**
 * 一次确认 ✓：**应用内的对话框** ✓ ⇒ ⇒ 不靠宿主的 `confirm` ✓ ⇒ ⇒
 * 每一处都长一个样 ✓ ⇒ ⇒ 用户知道自己在答应什么 ✓。
 *
 * **它是"决定"不是"告知"** ✓ ⇒ ⇒ 决定留在原地 ✓ ⇒ ⇒ 通知不打断手头的事 ✓。
 *
 * **打开就落在"取消"上** ✓ ⇒ ⇒ 回车不会顺手删掉东西 ✓。
 */
export interface ConfirmDialogProps {
  /** 这道题问的是什么 ✓。 */
  title: string;
  /** 说清答应之后会怎样 ✓。 */
  description: string;
  /** 说的是哪一份 ✓ ⇒ ⇒ 用户知道自己在决定哪一件事 ✓。 */
  subject: string | undefined;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  title,
  description,
  subject,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}) => {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // **默认落在"取消"上** ✓ ⇒ ⇒ 键盘用户不用先找一遍 ✓ ⇒ ⇒ 回车不会删东西 ✓。
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 no-print animate-in fade-in duration-200">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
        className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 p-5 text-neutral-100 shadow-2xl"
      >
        <h2 id="confirm-dialog-title" className="text-base font-semibold mb-1">
          {title}
        </h2>
        <p id="confirm-dialog-description" className="text-xs text-neutral-400 mb-1">
          {description}
        </p>
        {subject ? <p className="text-xs text-neutral-300 mb-4 wrap-anywhere">{subject}</p> : null}
        <div className="flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-neutral-700 px-3 py-2 text-xs text-neutral-200 hover:bg-neutral-800"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg border border-red-900/70 bg-red-950/40 px-3 py-2 text-xs text-red-200 hover:bg-red-900/40"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
