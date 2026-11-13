import React, {useEffect, useRef} from 'react';
import {CONFLICT_TEXTS} from '../../application/messages';
import type {ConflictChoice} from '../../application/workspace/documentSyncer';

/**
 * 冲突那三个选择 ✓（设计 §8.6 ✓）。
 *
 * **走对话框不走通知** ✓ ⇒ ⇒ 通知是"告知" ✓ ⇒ ⇒ 决定要留在原地 ✓。
 *
 * **三个选择** ✓：覆盖 ✓ / 重载 ✓ / 取消 ✓ ⇒ ⇒ 三个答案各落到一项写回结果上 ✓（§6.5 ✓）。
 *
 * **每个选择都写明它做什么** ✓ ⇒ ⇒ **"重载"写清本地改动不保留** ✓ ⇒ ⇒
 * 用户点之前就知道会失去什么 ✓（§6.5 ✓）。
 */
export interface ConflictDialogProps {
  /** 这个文件的名字 ✓：让用户知道在决定哪一份 ✓。 */
  displayName: string;
  /** 用户选的那个 ✓ ⇒ ⇒ 三个答案各落到一项写回结果上 ✓。 */
  onChoose: (choice: ConflictChoice) => void;
}

export const ConflictDialog: React.FC<ConflictDialogProps> = ({displayName, onChoose}) => {
  const panelRef = useRef<HTMLDivElement>(null);

  // **打开就落在第一个选择上** ✓ ⇒ ⇒ 键盘用户不用先找一遍 ✓。
  useEffect(() => {
    panelRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, []);

  const choose = (choice: ConflictChoice) => () => onChoose(choice);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 no-print animate-in fade-in duration-200">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="conflict-dialog-title"
        aria-describedby="conflict-dialog-description"
        className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 p-5 text-neutral-100 shadow-2xl"
      >
        <h2 id="conflict-dialog-title" className="text-base font-semibold mb-1">
          {CONFLICT_TEXTS.title}
        </h2>
        <p id="conflict-dialog-description" className="text-xs text-neutral-400 mb-1">
          {CONFLICT_TEXTS.description}
        </p>
        <p className="text-xs text-neutral-300 mb-4 wrap-anywhere">{displayName}</p>
        <div className="flex flex-col gap-2">
          {/* **覆盖** ✓：草稿胜出 ✓。 */}
          <button
            type="button"
            onClick={choose('overwrite')}
            className="flex flex-col items-start gap-0.5 rounded-lg border border-neutral-700 px-3 py-2 text-left text-xs hover:bg-neutral-800"
          >
            <span className="font-medium">{CONFLICT_TEXTS.overwrite}</span>
            <span className="text-[0.625rem] text-neutral-400">{CONFLICT_TEXTS.overwriteHint}</span>
          </button>
          {/* **重载** ✓：文件胜出 ✓ ⇒ ⇒ **本地改动不保留** ✓ ⇒ ⇒ 说清它 ✓。 */}
          <button
            type="button"
            onClick={choose('reload')}
            className="flex flex-col items-start gap-0.5 rounded-lg border border-neutral-700 px-3 py-2 text-left text-xs hover:bg-neutral-800"
          >
            <span className="font-medium">{CONFLICT_TEXTS.reload}</span>
            <span className="text-[0.625rem] text-amber-400">{CONFLICT_TEXTS.reloadHint}</span>
          </button>
          {/* **取消** ✓：两边都不动 ✓ ⇒ ⇒ 下次还会再问 ✓。 */}
          <button
            type="button"
            onClick={choose('cancel')}
            className="flex flex-col items-start gap-0.5 rounded-lg border border-neutral-700 px-3 py-2 text-left text-xs hover:bg-neutral-800"
          >
            <span className="font-medium">{CONFLICT_TEXTS.cancel}</span>
            <span className="text-[0.625rem] text-neutral-400">{CONFLICT_TEXTS.cancelHint}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
