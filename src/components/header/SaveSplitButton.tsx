import React, {useEffect, useRef, useState} from 'react';
import {Save, ChevronDown} from 'lucide-react';
import {SAVE_CONTROL_TEXTS} from '../../application/messages';
import type {SaveControlView} from '../../application/workspace/saveControl';

/**
 * 顶栏那个分裂按钮 ✓（设计 §8.2 ✓）。
 *
 * **主区 = 把这一份写到一个本地文件** ✓ ⇒ ⇒ 写回是高频动作 ✓ ⇒ ⇒ **不该多一次点击** ✓。
 * **箭头 = 菜单** ✓ ⇒ ⇒ 菜单里是**另存为…** ✓。
 *
 * **可用性由派生好的形状给** ✓ ⇒ ⇒ **组件不自己判** ✓（§8.6 ✓）。
 *
 * **三种关联状态，三个形状** ✓ ⇒ ⇒ **组件只照着渲染** ✓ ⇒ ⇒
 * 关联为空 ⇒ ⇒ 主区可用（点了会选一个目标 ✓）✓；关联有效 ⇒ ⇒ 两个都可用 ✓；
 * 关联无效 ⇒ ⇒ 主区灰掉 ✓ ⇒ ⇒ 另存为可用 ✓（§8.2 ✓）。
 */
export interface SaveSplitButtonProps {
  /** 派生好的形状 ✓ ⇒ ⇒ 界面不自己判 ✓。 */
  view: SaveControlView;
  /** 主区：把这一份写到一个本地文件 ✓。 */
  onWriteBack: () => void;
  /** 菜单里另存为 ✓。 */
  onSaveAs: () => void;
}

/**
 * **主区那一句话** ✓ ⇒ ⇒ **按关联状态给** ✓ ⇒ ⇒ **组件不自己判** ✓（§8.5 ✓）。
 *
 * **关联为空 ⇒ ⇒ 它会选一个目标** ✓ ⇒ ⇒ 那一句说清这一点 ✓；
 * **关联无效 ⇒ ⇒ 它点不动** ✓ ⇒ ⇒ 那一句说清为什么 ✓ ⇒ ⇒ **另存为是出路** ✓。
 */
function writeBackHint(view: SaveControlView): string {
  if (view.bindingState === 'invalid') return SAVE_CONTROL_TEXTS.invalidTargetHint;
  if (view.bindingState === 'none') return SAVE_CONTROL_TEXTS.pickTargetHint;
  return SAVE_CONTROL_TEXTS.writeBackHint;
}

export const SaveSplitButton: React.FC<SaveSplitButtonProps> = ({view, onWriteBack, onSaveAs}) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // **点外面收起** ✓ ⇒ ⇒ 菜单不是黏在屏幕上 ✓。
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <div className="relative flex items-stretch" ref={menuRef}>
      {/* 主区 ✓：**写回文件** ✓ ⇒ ⇒ 高频动作不必多一次点击 ✓。 */}
      <button
        type="button"
        onClick={onWriteBack}
        disabled={!view.writeBackEnabled}
        title={writeBackHint(view)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-l-lg border border-r-0 border-neutral-700/80 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer disabled:cursor-not-allowed disabled:bg-neutral-900 disabled:text-neutral-600"
      >
        <Save className="w-3.5 h-3.5" />
        <span>{SAVE_CONTROL_TEXTS.writeBack}</span>
      </button>
      {/* 箭头 ✓：菜单 ✓。 */}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={!view.menuEnabled}
        aria-haspopup="menu"
        aria-expanded={open}
        title={SAVE_CONTROL_TEXTS.writeBackHint}
        className="flex items-center px-1.5 py-1.5 rounded-r-lg border border-neutral-700/80 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs transition-colors cursor-pointer disabled:cursor-not-allowed disabled:bg-neutral-900 disabled:text-neutral-600"
      >
        <ChevronDown className="w-3.5 h-3.5" />
      </button>
      {open && view.menuEnabled ? (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-50 min-w-52 rounded-lg border border-neutral-700 bg-neutral-900 py-1 shadow-xl"
        >
          {/* **写回文件**那一项 ✓ ⇒ ⇒ 没有同步目标时它也灰 ✓ ⇒ ⇒ **另存为仍可选** ✓（§8.2 ✓）。 */}
          <button
            type="button"
            role="menuitem"
            disabled={!view.writeBackEnabled}
            onClick={() => {
              setOpen(false);
              onWriteBack();
            }}
            title={view.writeBackEnabled ? writeBackHint(view) : SAVE_CONTROL_TEXTS.noTargetHint}
            className="flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-left text-xs text-neutral-200 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:text-neutral-600 disabled:hover:bg-transparent"
          >
            <span>{SAVE_CONTROL_TEXTS.writeBackMenu}</span>
            {!view.writeBackEnabled ? (
              <span className="text-[0.625rem] text-neutral-500">
                {SAVE_CONTROL_TEXTS.noTargetHint}
              </span>
            ) : null}
          </button>
          {view.saveAsAvailable ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onSaveAs();
              }}
              className="flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-left text-xs text-neutral-200 hover:bg-neutral-800"
            >
              <span>{SAVE_CONTROL_TEXTS.saveAs}</span>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
