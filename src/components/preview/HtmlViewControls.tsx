/**
 * MarkFlow (墨流) HTML 视图的控件条
 *
 * 流式 / A4 分页是**同一文档的两种查看方式** ✓ ⇒ ⇒ 只改查看模式 ✓（设计 §2 ✓）。
 * 同步滚动是编辑器与预览之间的联动 ✓ ⇒ ⇒ 没有编辑器就没有可跟随的对象 ✓（设计 §2 ✓）。
 * 控件归它控制的那一侧 ✓ ⇒ ⇒ 随该视图显隐 ✓（设计 §2 ✓）。
 */
import React from 'react';
import {ArrowUpDown, FileCheck} from 'lucide-react';

interface HtmlViewControlsProps {
  previewMode: 'flow' | 'a4';
  onPreviewModeChange: (mode: 'flow' | 'a4') => void;
  syncScroll: boolean;
  onToggleSyncScroll: () => void;
  /** 同步有对象才成立 ✓：编辑器隐藏时这一组不出现 ✓（设计 §2 ✓）。 */
  showSync: boolean;
}

export const HtmlViewControls: React.FC<HtmlViewControlsProps> = ({
  previewMode,
  onPreviewModeChange,
  syncScroll,
  onToggleSyncScroll,
  showSync,
}) => {
  return (
    <div className="flex items-center gap-2 px-3 py-1 bg-neutral-900/95 border-b border-neutral-800 text-neutral-200 select-none shrink-0 no-print">
      {/* 模式分段：选中态同时给底色与 aria-pressed ✓ ⇒ ⇒ 不只靠颜色区分 ✓。 */}
      <div className="flex items-center p-0.5 rounded-lg bg-neutral-950/80 border border-neutral-800 text-xs shrink-0">
        <button
          type="button"
          onClick={() => onPreviewModeChange('flow')}
          aria-pressed={previewMode === 'flow'}
          className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
            previewMode === 'flow'
              ? 'bg-neutral-800 text-neutral-100 font-medium'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
          title="流式排版舒适阅读"
        >
          流式
        </button>
        <button
          type="button"
          onClick={() => onPreviewModeChange('a4')}
          aria-pressed={previewMode === 'a4'}
          className={`px-2 py-0.5 rounded text-[11px] transition-colors flex items-center gap-1 ${
            previewMode === 'a4'
              ? 'bg-neutral-800 text-teal-300 font-medium'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
          title="A4 纸张物理规格分页仿真"
        >
          <FileCheck className="w-3 h-3" />
          A4 分页
        </button>
      </div>

      {/* 同步滚动：**编辑器 ⇋ 预览** ✓ ⇒ ⇒ 与模式组同属这条控件条 ✓。 */}
      {showSync && (
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onToggleSyncScroll}
            aria-label={syncScroll ? '双向同步滚动：已开启' : '双向同步滚动：已暂停'}
            title={syncScroll ? '双向同步滚动：已开启' : '双向同步滚动：已暂停'}
            className={`w-7 h-7 flex items-center justify-center rounded border transition-colors ${
              syncScroll
                ? 'bg-teal-950/80 text-teal-300 border border-teal-700/60 shadow-xs'
                : 'border-transparent text-neutral-500 hover:text-neutral-100 hover:bg-neutral-800'
            }`}
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
          </button>
          <div className="hidden lg:flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-neutral-950/80 border border-neutral-800 text-[11px] text-neutral-400">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                syncScroll ? 'bg-teal-400 animate-pulse' : 'bg-neutral-600'
              }`}
            />
            <span className="font-mono text-[10px]">
              {syncScroll ? '编辑器 ⇋ 预览 同步' : '视图独立滚动'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
