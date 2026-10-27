/**
 * MarkFlow (墨流) 核心编辑器组件
 * 对应设计方案第 4 章：行号、编辑工具栏、格式快捷指令、分页断点插入与中文 IME 保护
 * 支持与 HTML 渲染视窗双向精准同步滚动与联动锁保护
 */

import React, { useRef, useState, useEffect } from 'react';
import { generateMarkdownTable } from '../../core/parser/markdownParser';

interface EditorProps {
  value: string;
  onChange: (newValue: string) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  onScroll?: (ratio: number, scrollTop: number) => void;
  syncScroll?: boolean;
  onToggleSyncScroll?: () => void;
  maxWidth?: number | 'full';
}

export const Editor: React.FC<EditorProps> = ({
  value,
  onChange,
  onUndo,
  onRedo,
  textareaRef: externalTextareaRef,
  onScroll,
  maxWidth = 1024,
}) => {
  const internalTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const activeTextareaRef = externalTextareaRef || internalTextareaRef;
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [lineHeights, setLineHeights] = useState<number[]>([]);

  const lines = value.split('\n');
  const lineCount = lines.length;

  // 测量每一行在自动折行 (wrap) 状态下的实际像素高度，保证行号与正文精确对齐
  useEffect(() => {
    const textarea = activeTextareaRef.current;
    if (!textarea) return;

    const updateHeights = () => {
      const measure = measureRef.current;
      if (!measure) return;
      const clientWidth = textarea.clientWidth;
      if (clientWidth <= 0) return;
      measure.style.width = `${clientWidth}px`;
      const children = measure.children;
      const heights: number[] = [];
      for (let i = 0; i < children.length; i++) {
        heights.push((children[i] as HTMLElement).offsetHeight || 24);
      }
      setLineHeights(heights);
    };

    updateHeights();

    const ro = new ResizeObserver(updateHeights);
    ro.observe(textarea);
    return () => ro.disconnect();
  }, [value, lineCount]);

  // 同步行号及向外通知编辑器滚动进度
  const handleScroll = () => {
    const textarea = activeTextareaRef.current;
    if (textarea && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textarea.scrollTop;
      if (onScroll) {
        const maxScroll = textarea.scrollHeight - textarea.clientHeight;
        const ratio = maxScroll > 0 ? textarea.scrollTop / maxScroll : 0;
        onScroll(ratio, textarea.scrollTop);
      }
    }
  };

  const insertTextAtCursor = (before: string, after: string = '', defaultText: string = '') => {
    const textarea = activeTextareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.substring(start, end) || defaultText;

    const replacement = before + selected + after;
    const newValue = value.substring(0, start) + replacement + value.substring(end);
    onChange(newValue);

    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + before.length + selected.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 快捷键支持: Ctrl/Cmd + B, Ctrl/Cmd + I, Ctrl/Cmd + Z
    if ((e.ctrlKey || e.metaKey) && (e.key === 'Home'||e.key === 'End')) {
      e.preventDefault();const textarea=activeTextareaRef.current;if(!textarea)return;
      const end=e.key==='End',position=end?value.length:0;textarea.setSelectionRange(position,position);textarea.scrollTo({top:end?textarea.scrollHeight:0,behavior:'instant'});
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
      e.preventDefault();
      insertTextAtCursor('**', '**', '粗体文本');
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
      e.preventDefault();
      insertTextAtCursor('*', '*', '斜体文本');
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      if (e.shiftKey) {
        e.preventDefault();
        if (onRedo) onRedo();
      } else {
        e.preventDefault();
        if (onUndo) onUndo();
      }
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      insertTextAtCursor('[', '](https://example.com)', '链接描述');
    } else if (
      ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 't' || e.key === 'T')) ||
      (e.altKey && (e.key === 't' || e.key === 'T'))
    ) {
      e.preventDefault();
      insertTextAtCursor(generateMarkdownTable(3, 3));
    } else if (e.key === 'Tab') {
      e.preventDefault();
      insertTextAtCursor('  ');
    }
  };

  return (
    <div className="flex-1 h-full flex flex-col bg-neutral-950 border-r border-neutral-800 text-neutral-100 overflow-hidden no-print">
      {/* Editor Centered Container respecting maxWidth */}
      <div className="flex-1 flex justify-center overflow-hidden bg-neutral-950">
        <div
          className="w-full h-full flex overflow-hidden relative font-mono text-sm border-x border-neutral-900/50 bg-neutral-950"
          style={{
            maxWidth: maxWidth === 'full' ? '100%' : `${maxWidth}px`,
          }}
        >
          {/* Line Numbers Bar */}
          <div
            ref={lineNumbersRef}
            className="w-12 py-3 px-1 text-right select-none bg-neutral-950 text-neutral-600 font-mono text-xs border-r border-neutral-900 overflow-hidden leading-6 shrink-0"
          >
            {Array.from({ length: lineCount }).map((_, i) => (
              <div
                key={i}
                style={{
                  height: lineHeights[i] ? `${lineHeights[i]}px` : '24px',
                  lineHeight: '24px',
                }}
              >
                {i + 1}
              </div>
            ))}
          </div>

          {/* Hidden measurement container to calculate wrapped line heights */}
          <div
            ref={measureRef}
            aria-hidden="true"
            className="absolute left-[-9999px] top-0 pointer-events-none opacity-0 select-none p-3 font-mono text-sm leading-6 box-border break-words [overflow-wrap:anywhere] whitespace-pre-wrap"
          >
            {lines.map((line, i) => (
              <div key={i}>{line || '\u00A0'}</div>
            ))}
          </div>

          {/* Text Area */}
          <textarea
            ref={activeTextareaRef as React.RefObject<HTMLTextAreaElement>}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onScroll={handleScroll}
            wrap="soft"
            aria-label="Markdown 编辑器"
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            placeholder="在此键入 Markdown 正文..."
            className="flex-1 h-full p-3 resize-none bg-transparent text-neutral-200 outline-none leading-6 font-mono overflow-y-auto break-words [overflow-wrap:anywhere] selection:bg-teal-900/60 selection:text-teal-100"
          />
        </div>
      </div>
    </div>
  );
};
