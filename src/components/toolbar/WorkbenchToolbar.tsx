/**
 * MarkFlow (墨流) 全局统一工作台工具栏组件
 * 贯穿编辑器与 HTML 渲染视窗，解决单栏宽度限制与截断问题
 * 全部按钮采用纯图标 + 悬浮 Tips（含快捷键/Markdown语法提示）
 */

import React, { createContext, useContext, useRef, useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  ChevronDown,
  Bold,
  Italic,
  Strikethrough,
  Code,
  Quote,
  List,
  ListOrdered,
  CheckSquare,
  Sigma,
  Table as TableIcon,
  GitFork,
  FileCode,
  Scissors,
  Link,
  RotateCcw,
  RotateCw,
  ArrowUpDown,
} from 'lucide-react';
import { generateMarkdownTable } from '../../core/parser/markdownParser';

interface TooltipInfo {
  rect: DOMRect;
  title: string;
  shortcut?: string;
  syntax?: string;
}

const TooltipContext = createContext<{
  showTooltip: (info: TooltipInfo) => void;
  hideTooltip: () => void;
} | null>(null);

interface ToolbarButtonProps {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  shortcut?: string;
  syntax?: string;
  active?: boolean;
  accent?: 'default' | 'teal' | 'sky' | 'indigo' | 'amber';
  className?: string;
  children: React.ReactNode;
}

const ToolbarButton: React.FC<ToolbarButtonProps> = ({
  onClick,
  disabled = false,
  title,
  shortcut,
  syntax,
  active = false,
  accent = 'default',
  className,
  children,
}) => {
  const tooltipCtx = useContext(TooltipContext);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const getAccentStyles = () => {
    if (disabled) return 'text-neutral-600 opacity-40 cursor-not-allowed';
    if (active) {
      return 'bg-teal-950/80 text-teal-300 border border-teal-700/60 shadow-xs';
    }
    switch (accent) {
      case 'teal':
        return 'text-neutral-400 hover:text-teal-300 hover:bg-teal-950/40 hover:border-teal-800/50';
      case 'sky':
        return 'text-neutral-400 hover:text-sky-300 hover:bg-sky-950/40 hover:border-sky-800/50';
      case 'indigo':
        return 'text-neutral-400 hover:text-indigo-300 hover:bg-indigo-950/40 hover:border-indigo-800/50';
      case 'amber':
        return 'text-neutral-400 hover:text-amber-300 hover:bg-amber-950/40 hover:border-amber-800/50';
      default:
        return 'text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800';
    }
  };

  const handleMouseEnter = () => {
    if (disabled || !buttonRef.current || !tooltipCtx) return;
    const rect = buttonRef.current.getBoundingClientRect();
    tooltipCtx.showTooltip({
      rect,
      title,
      ...(shortcut===undefined?{}:{shortcut}),
      ...(syntax===undefined?{}:{syntax}),
    });
  };

  const handleMouseLeave = () => {
    tooltipCtx?.hideTooltip();
  };

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={() => {
        tooltipCtx?.hideTooltip();
        onClick();
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      disabled={disabled}
      className={`${className ?? 'w-7'} h-7 flex items-center justify-center rounded border border-transparent transition-colors ${getAccentStyles()}`}
      aria-label={title}
    >
      {children}
    </button>
  );
};

export interface WorkbenchToolbarProps {
  onInsertText: (before: string, after?: string, defaultText?: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  syncScroll?: boolean;
  onToggleSyncScroll?: () => void;
  viewMode: 'split' | 'edit' | 'reading' | 'a4';
}

export const WorkbenchToolbar: React.FC<WorkbenchToolbarProps> = ({
  onInsertText,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  syncScroll = true,
  onToggleSyncScroll,
  viewMode,
}) => {
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);
  const [isMoreHeadingsOpen, setIsMoreHeadingsOpen] = useState(false);
  const [moreHeadingsPos, setMoreHeadingsPos] = useState<{ top: number; left: number } | null>(null);
  const moreHeadingsBtnRef = useRef<HTMLDivElement>(null);
  const moreHeadingsRef = useRef<HTMLDivElement>(null);

  const [isTablePickerOpen, setIsTablePickerOpen] = useState(false);
  const [tablePickerPos, setTablePickerPos] = useState<{ top: number; left: number } | null>(null);
  const [hoveredGrid, setHoveredGrid] = useState<{ rows: number; cols: number }>({ rows: 3, cols: 3 });
  const tableButtonRef = useRef<HTMLDivElement>(null);
  const tablePickerRef = useRef<HTMLDivElement>(null);

  const handleToggleTablePicker = () => {
    if (isTablePickerOpen) {
      setIsTablePickerOpen(false);
    } else {
      if (tableButtonRef.current) {
        const rect = tableButtonRef.current.getBoundingClientRect();
        setTablePickerPos({
          top: rect.bottom + 5,
          left: Math.max(10, Math.min(rect.left, window.innerWidth - 275)),
        });
      }
      setIsTablePickerOpen(true);
      setIsMoreHeadingsOpen(false);
    }
  };

  const handleToggleMoreHeadings = () => {
    if (isMoreHeadingsOpen) {
      setIsMoreHeadingsOpen(false);
    } else {
      if (moreHeadingsBtnRef.current) {
        const rect = moreHeadingsBtnRef.current.getBoundingClientRect();
        setMoreHeadingsPos({
          top: rect.bottom + 5,
          left: Math.max(10, Math.min(rect.left, window.innerWidth - 170)),
        });
      }
      setIsMoreHeadingsOpen(true);
      setIsTablePickerOpen(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        tablePickerRef.current &&
        !tablePickerRef.current.contains(target) &&
        tableButtonRef.current &&
        !tableButtonRef.current.contains(target)
      ) {
        setIsTablePickerOpen(false);
      }
      if (
        moreHeadingsRef.current &&
        !moreHeadingsRef.current.contains(target) &&
        moreHeadingsBtnRef.current &&
        !moreHeadingsBtnRef.current.contains(target)
      ) {
        setIsMoreHeadingsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMoreHeadingsOpen(false);
        setIsTablePickerOpen(false);
      }
    };
    if (isMoreHeadingsOpen || isTablePickerOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isMoreHeadingsOpen, isTablePickerOpen]);

  const showTooltip = useCallback((info: TooltipInfo) => {
    setTooltip(info);
  }, []);

  const hideTooltip = useCallback(() => {
    setTooltip(null);
  }, []);

  return (
    <TooltipContext.Provider value={{ showTooltip, hideTooltip }}>
      <div className="w-full min-h-[38px] px-3 bg-neutral-900/95 border-b border-neutral-800 flex items-center justify-between text-neutral-200 select-none shrink-0 no-print z-20">
        {/* Left Formatting Tools */}
        <div className="flex items-center gap-0.5 overflow-x-auto py-1 scrollbar-none">
        {/* Headings: H1~H3 Direct + Micro Dropdown for H4~H6 */}
        <ToolbarButton
          onClick={() => onInsertText('# ', '', '一级标题')}
          title="一级标题"
          syntax="# "
        >
          <Heading1 className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => onInsertText('## ', '', '二级标题')}
          title="二级标题"
          syntax="## "
        >
          <Heading2 className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => onInsertText('### ', '', '三级标题')}
          title="三级标题"
          syntax="### "
        >
          <Heading3 className="w-3.5 h-3.5" />
        </ToolbarButton>

        {/* Micro dropdown for H4-H6 */}
        <div className="relative inline-flex items-center" ref={moreHeadingsBtnRef}>
          <ToolbarButton
            onClick={handleToggleMoreHeadings}
            title="更多标题层级 (H4 ~ H6)"
            syntax="#### ~ ######"
            active={isMoreHeadingsOpen}
            className="w-4.5 px-0.5"
          >
            <ChevronDown className={`w-3 h-3 transition-transform duration-150 ${isMoreHeadingsOpen ? 'rotate-180' : ''}`} />
          </ToolbarButton>
        </div>

        <div className="w-[1px] h-3.5 bg-neutral-800 mx-1 shrink-0" />

        {/* Inline Formatting */}
        <ToolbarButton
          onClick={() => onInsertText('**', '**', '粗体文本')}
          title="粗体"
          syntax="**文本**"
          shortcut="Ctrl+B"
        >
          <Bold className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => onInsertText('*', '*', '斜体文本')}
          title="斜体"
          syntax="*文本*"
          shortcut="Ctrl+I"
        >
          <Italic className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => onInsertText('~~', '~~', '删除线文本')}
          title="删除线"
          syntax="~~文本~~"
        >
          <Strikethrough className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => onInsertText('`', '`', 'code')}
          title="行内代码"
          syntax="`code`"
        >
          <Code className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => onInsertText('> ', '', '引用说明文字')}
          title="引用块"
          syntax="> "
        >
          <Quote className="w-3.5 h-3.5" />
        </ToolbarButton>

        <div className="w-[1px] h-3.5 bg-neutral-800 mx-1 shrink-0" />

        {/* Lists */}
        <ToolbarButton
          onClick={() => onInsertText('- ', '', '列表项')}
          title="无序列表"
          syntax="- 列表"
        >
          <List className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => onInsertText('1. ', '', '列表项')}
          title="有序列表"
          syntax="1. 列表"
        >
          <ListOrdered className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => onInsertText('- [ ] ', '', '待办任务')}
          title="任务清单"
          syntax="- [ ]"
        >
          <CheckSquare className="w-3.5 h-3.5" />
        </ToolbarButton>

        <div className="w-[1px] h-3.5 bg-neutral-800 mx-1 shrink-0" />

        {/* Math Formulas */}
        <ToolbarButton
          onClick={() =>
            onInsertText('$$\n\\frac{d\\rho}{dt} = -\\frac{i}{\\hbar}[H, \\rho]\n$$\n', '', '')
          }
          title="独立数学公式块"
          syntax="$$ ... $$"
          accent="teal"
        >
          <Sigma className="w-3.5 h-3.5 text-teal-400" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => onInsertText('$', '$', 'E = mc^2')}
          title="行内数学公式"
          syntax="$ ... $"
          accent="teal"
        >
          <span className="font-mono text-[11px] font-semibold text-teal-400 leading-none">
            $x$
          </span>
        </ToolbarButton>

        <div className="w-[1px] h-3.5 bg-neutral-800 mx-1 shrink-0" />

        {/* Diagrams & Visuals */}
        <ToolbarButton
          onClick={() =>
            onInsertText(
              '```mermaid\nsequenceDiagram\n    autonumber\n    Client->>Server: 发送请求\n    Server-->>Client: 返回响应结果\n```\n',
              '',
              ''
            )
          }
          title="Mermaid 架构/时序图"
          syntax="```mermaid"
          accent="sky"
        >
          <GitFork className="w-3.5 h-3.5 text-sky-400" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() =>
            onInsertText(
              '```dot\ndigraph Topology {\n    rankdir=LR;\n    NodeA -> NodeB [label="数据通道"];\n}\n```\n',
              '',
              ''
            )
          }
          title="Graphviz DOT 拓扑图"
          syntax="```dot"
          accent="indigo"
        >
          <FileCode className="w-3.5 h-3.5 text-indigo-400" />
        </ToolbarButton>

        {/* Interactive Table Matrix Dropdown & Link */}
        <div className="relative inline-flex items-center" ref={tableButtonRef}>
          <ToolbarButton
            onClick={handleToggleTablePicker}
            title="可视化矩阵插入表格"
            syntax="| 列1 | 列2 |"
            shortcut="Alt+T"
            active={isTablePickerOpen}
          >
            <TableIcon className="w-3.5 h-3.5" />
          </ToolbarButton>
        </div>

        <ToolbarButton
          onClick={() => onInsertText('[', '](https://example.com)', '链接描述')}
          title="插入超链接"
          syntax="[文字](url)"
        >
          <Link className="w-3.5 h-3.5" />
        </ToolbarButton>

        <div className="w-[1px] h-3.5 bg-neutral-800 mx-1 shrink-0" />

        {/* Hard Pagebreak */}
        <ToolbarButton
          onClick={() => onInsertText('\n---pagebreak---\n', '', '')}
          title="A4 纸张硬分页符"
          syntax="---pagebreak---"
          accent="amber"
        >
          <Scissors className="w-3.5 h-3.5 text-amber-400" />
        </ToolbarButton>
      </div>

      {/* Right Controls: Undo / Redo & Dual View Sync */}
      <div className="flex items-center gap-1.5 shrink-0 pl-2">
        {/* Sync Scroll Toggle */}
        {onToggleSyncScroll && (
          <ToolbarButton
            onClick={onToggleSyncScroll}
            title={syncScroll ? '双向同步滚动：已开启' : '双向同步滚动：已暂停'}
            shortcut={syncScroll ? '点击暂停联动' : '点击开启联动'}
            active={syncScroll}
          >
            <ArrowUpDown className={`w-3.5 h-3.5 ${syncScroll ? 'text-teal-300' : 'text-neutral-500'}`} />
          </ToolbarButton>
        )}

        {/* Split status badge */}
        {viewMode === 'split' && (
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
        )}

        <div className="w-[1px] h-3.5 bg-neutral-800 mx-0.5 shrink-0" />

        {/* Undo / Redo */}
        <ToolbarButton
          onClick={onUndo}
          disabled={!canUndo}
          title="撤销"
          shortcut="Ctrl+Z"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </ToolbarButton>

        <ToolbarButton
          onClick={onRedo}
          disabled={!canRedo}
          title="重做"
          shortcut="Ctrl+Shift+Z"
        >
          <RotateCw className="w-3.5 h-3.5" />
        </ToolbarButton>
      </div>
    </div>

    {/* Portal for H4-H6 Dropdown */}
    {isMoreHeadingsOpen && moreHeadingsPos && typeof document !== 'undefined' && createPortal(
      <div
        ref={moreHeadingsRef}
        className="fixed w-36 bg-neutral-900 border border-neutral-700/80 rounded-md shadow-2xl py-1 z-[99999] flex flex-col backdrop-blur-md select-none"
        style={{
          top: moreHeadingsPos.top,
          left: moreHeadingsPos.left,
        }}
      >
        <button
          type="button"
          onClick={() => {
            onInsertText('#### ', '', '四级标题');
            setIsMoreHeadingsOpen(false);
          }}
          className="w-full px-2.5 py-1.5 text-xs text-neutral-300 hover:text-white hover:bg-neutral-800/90 flex items-center gap-2 transition-colors cursor-pointer text-left"
        >
          <Heading4 className="w-3.5 h-3.5 text-teal-400 shrink-0" />
          <span className="flex-1 font-medium">四级标题</span>
          <span className="text-[10px] text-neutral-400 font-mono">####</span>
        </button>
        <button
          type="button"
          onClick={() => {
            onInsertText('##### ', '', '五级标题');
            setIsMoreHeadingsOpen(false);
          }}
          className="w-full px-2.5 py-1.5 text-xs text-neutral-300 hover:text-white hover:bg-neutral-800/90 flex items-center gap-2 transition-colors cursor-pointer text-left"
        >
          <Heading5 className="w-3.5 h-3.5 text-teal-400 shrink-0" />
          <span className="flex-1 font-medium">五级标题</span>
          <span className="text-[10px] text-neutral-400 font-mono">#####</span>
        </button>
        <button
          type="button"
          onClick={() => {
            onInsertText('###### ', '', '六级标题');
            setIsMoreHeadingsOpen(false);
          }}
          className="w-full px-2.5 py-1.5 text-xs text-neutral-300 hover:text-white hover:bg-neutral-800/90 flex items-center gap-2 transition-colors cursor-pointer text-left"
        >
          <Heading6 className="w-3.5 h-3.5 text-teal-400 shrink-0" />
          <span className="flex-1 font-medium">六级标题</span>
          <span className="text-[10px] text-neutral-400 font-mono">######</span>
        </button>
      </div>,
      document.body
    )}

    {/* Portal for Table Matrix Picker */}
    {isTablePickerOpen && tablePickerPos && typeof document !== 'undefined' && createPortal(
      <div
        ref={tablePickerRef}
        className="fixed w-64 bg-neutral-900 border border-neutral-700/90 rounded-lg shadow-2xl p-3 z-[99999] flex flex-col backdrop-blur-md select-none"
        style={{
          top: tablePickerPos.top,
          left: tablePickerPos.left,
        }}
      >
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-neutral-800 text-xs">
          <span className="font-medium text-neutral-200">插入表格</span>
          <span className="px-1.5 py-0.5 rounded bg-teal-950/90 border border-teal-700/70 text-teal-300 font-mono text-[11px] font-semibold">
            {hoveredGrid.cols} 列 × {hoveredGrid.rows} 行
          </span>
        </div>

        {/* 8 cols x 6 rows interactive matrix */}
        <div
          className="grid grid-cols-8 gap-1 p-1.5 bg-neutral-950/90 rounded border border-neutral-800/80 mb-2.5"
          onMouseLeave={() => setHoveredGrid({ rows: 3, cols: 3 })}
        >
          {Array.from({ length: 6 }).map((_, rIdx) => {
            const r = rIdx + 1;
            return Array.from({ length: 8 }).map((__, cIdx) => {
              const c = cIdx + 1;
              const isSelected = r <= hoveredGrid.rows && c <= hoveredGrid.cols;
              return (
                <button
                  key={`${r}-${c}`}
                  type="button"
                  aria-label={`${c} 列 ${r} 行`}
                  onMouseEnter={() => setHoveredGrid({ rows: r, cols: c })}
                  onClick={() => {
                    onInsertText(generateMarkdownTable(c, r));
                    setIsTablePickerOpen(false);
                  }}
                  className={`w-5 h-5 rounded-sm border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-teal-500/50 border-teal-400 scale-105'
                      : 'bg-neutral-800/70 border-neutral-700/60 hover:border-neutral-500'
                  }`}
                />
              );
            });
          })}
        </div>

        {/* Quick Presets & Shortcuts */}
        <div className="flex items-center justify-between pt-1 border-t border-neutral-800/70 text-[11px]">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                onInsertText(generateMarkdownTable(3, 3));
                setIsTablePickerOpen(false);
              }}
              className="px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-700 transition-colors cursor-pointer text-xs"
            >
              3×3 标准
            </button>
            <button
              type="button"
              onClick={() => {
                onInsertText(generateMarkdownTable(4, 4));
                setIsTablePickerOpen(false);
              }}
              className="px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-700 transition-colors cursor-pointer text-xs"
            >
              4×4 数据
            </button>
          </div>
          <span className="text-[10px] text-neutral-400 font-mono" title="快捷键">Alt+T</span>
        </div>
      </div>,
      document.body
    )}

    {/* Floating Hover Tooltip rendered cleanly via Portal directly into document.body */}
    {tooltip && typeof document !== 'undefined' && createPortal(
      <div
        className="fixed pointer-events-none flex flex-col items-center z-[99999]"
        style={{
          top: tooltip.rect.bottom + 6,
          left: Math.max(80, Math.min(tooltip.rect.left + tooltip.rect.width / 2, window.innerWidth - 80)),
          transform: 'translateX(-50%)',
        }}
      >
        {/* Subtle arrow pointer pointing up to the button */}
        <div className="w-2 h-2 -mb-1 bg-neutral-900 border-t border-l border-neutral-700/80 rotate-45 z-10" />

        {/* Tooltip Content Badge */}
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-neutral-900/98 backdrop-blur-md text-neutral-100 text-xs rounded-md shadow-2xl border border-neutral-700/90 whitespace-nowrap">
          <span className="font-medium text-neutral-200">{tooltip.title}</span>
          {tooltip.syntax && (
            <span className="font-mono text-teal-300 bg-neutral-950 px-1.5 py-0.5 rounded border border-neutral-800 text-[10px]">
              {tooltip.syntax}
            </span>
          )}
          {tooltip.shortcut && (
            <kbd className="px-1.5 py-0.5 bg-neutral-800 text-neutral-300 rounded text-[10px] font-mono border border-neutral-700">
              {tooltip.shortcut}
            </kbd>
          )}
        </div>
      </div>,
      document.body
    )}
  </TooltipContext.Provider>
  );
};
