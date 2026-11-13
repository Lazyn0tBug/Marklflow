/**
 * MarkFlow (墨流) HTML 视图的工具栏
 *
 * 左边是**工具** ✓ ⇒ ⇒ 分页形态与公式引擎是这台视图的操作 ✓。
 * 右边是**状态** ✓ ⇒ ⇒ 同步联动是编辑器与这台视图之间的关系，不是操作 ✓。
 * 与编辑器工具栏同一行高 ✓ ⇒ ⇒ 两个视图的内容起点一致 ✓。
 */
import React from 'react';
import {ArrowUpDown} from 'lucide-react';

interface HtmlToolbarProps {
  previewMode: 'flow' | 'a4';
  onPreviewModeChange: (mode: 'flow' | 'a4') => void;
  mathMode: 'mathml' | 'svg';
  onMathModeToggle: (mode: 'mathml' | 'svg') => void;
  /** 同步有对象才成立 ✓ ⇒ ⇒ 编辑器不在场时这一项不出现 ✓（设计 §2 ✓）。 */
  showSync: boolean;
  syncScroll: boolean;
  onToggleSyncScroll: () => void;
}

export const HtmlToolbar: React.FC<HtmlToolbarProps> = ({
  previewMode,
  onPreviewModeChange,
  mathMode,
  onMathModeToggle,
  showSync,
  syncScroll,
  onToggleSyncScroll,
}) => {
  return (
    <div className="w-full min-h-[2.375rem] px-3 bg-neutral-900/95 border-b border-neutral-800 flex items-center justify-between gap-2 text-neutral-200 select-none shrink-0 no-print">
      {/* 工具 ✓：分页形态与公式引擎 ✓。 */}
      <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto scrollbar-none py-1">
        {/* 模式分段：**两个都是二字，平行** ✓ ⇒ ⇒ 纯文字，不给一个选项配图标 ✓。 */}
        <div className="flex items-center p-0.5 rounded-lg bg-neutral-950/80 border border-neutral-800 text-xs shrink-0">
          <button
            type="button"
            onClick={() => onPreviewModeChange('flow')}
            aria-pressed={previewMode === 'flow'}
            className={`px-2 py-0.5 rounded text-[0.6875rem] transition-colors ${
              previewMode === 'flow'
                ? 'bg-neutral-800 text-teal-300 font-medium'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
            title="流式：连续排布，不分页"
          >
            流式
          </button>
          <button
            type="button"
            onClick={() => onPreviewModeChange('a4')}
            aria-pressed={previewMode === 'a4'}
            className={`px-2 py-0.5 rounded text-[0.6875rem] transition-colors ${
              previewMode === 'a4'
                ? 'bg-neutral-800 text-teal-300 font-medium'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
            title="分页：按文档的纸张尺寸分页仿真"
          >
            分页
          </button>
        </div>

        <div className="w-px h-3.5 bg-neutral-800 shrink-0" />

        {/* 公式引擎分段：**与模式分段同一套形态** ✓ ⇒ ⇒ 两个选项都看得见 ✓。 */}
        <div className="flex items-center p-0.5 rounded-lg bg-neutral-950/80 border border-neutral-800 text-xs shrink-0">
          <button
            type="button"
            onClick={() => onMathModeToggle('mathml')}
            aria-pressed={mathMode === 'mathml'}
            className={`px-2 py-0.5 rounded text-[0.6875rem] font-mono transition-colors ${
              mathMode === 'mathml'
                ? 'bg-neutral-800 text-teal-300 font-medium'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
            title="原生 MathML：公式直接写入文档，可被阅读器读取"
          >
            MathML
          </button>
          <button
            type="button"
            onClick={() => onMathModeToggle('svg')}
            aria-pressed={mathMode === 'svg'}
            className={`px-2 py-0.5 rounded text-[0.6875rem] font-mono transition-colors ${
              mathMode === 'svg'
                ? 'bg-neutral-800 text-teal-300 font-medium'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
            title="SVG 矢量：公式按矢量渲染"
          >
            SVG
          </button>
        </div>
      </div>

      {/* 状态 ✓：同步联动 ✓ ⇒ ⇒ 它是关系，不是操作 ✓。 */}
      <div className="flex items-center gap-1.5 shrink-0">
        {showSync && (
          <>
            <button
              type="button"
              onClick={onToggleSyncScroll}
              aria-label={syncScroll ? '双向同步滚动：已开启' : '双向同步滚动：已暂停'}
              title={syncScroll ? '双向同步滚动：已开启' : '双向同步滚动：已暂停'}
              className={`w-7 h-7 shrink-0 flex items-center justify-center rounded border transition-colors ${
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
          </>
        )}
      </div>
    </div>
  );
};
