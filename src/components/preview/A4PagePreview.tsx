import { documentStyle } from '../../core/render/documentPresentation';
import { DEFAULT_THEME, type ThemeSpec } from '../../core/model/document';
/**
 * MarkFlow (墨流) A4 物理分页排版预览组件
 * 对应设计方案第 7.3 节与第 4.5.4 节
 * 真实 210mm × 297mm 纸张、边距、页眉、动态“第 X 页 / 共 Y 页”与物理分页断点
 * 支持同步滚动定位
 */

import React, { useEffect, useRef, useState } from 'react';
import { parseMarkdownToHtml } from '../../core/parser/markdownParser';
import { renderMermaidDiagram } from '../../core/render/mermaidRender';
import { ensureMathJaxReady } from '../../core/render/mathRender';
import { DocumentMeta } from '../../core/model/document';

interface A4PagePreviewProps {
  markdown: string;
  mathMode: 'mathml' | 'svg';
  meta: DocumentMeta;
  fontSize: number;
  lineHeight: number;
  theme?: ThemeSpec;
  containerRef?: React.RefObject<HTMLDivElement | null>;
  onScroll?: (ratio: number, scrollTop: number) => void;
}

export const A4PagePreview: React.FC<A4PagePreviewProps> = ({
  markdown,
  mathMode,
  meta,
  fontSize,
  lineHeight,
  theme,
  containerRef: externalContainerRef,
  onScroll,
}) => {
  const internalContainerRef = useRef<HTMLDivElement | null>(null);
  const activeContainerRef = externalContainerRef || internalContainerRef;
  const [pagesHtml, setPagesHtml] = useState<string[]>([]);

  useEffect(() => {
    const renderAll = () => {
      const allLines = markdown.split('\n');
      const sections: { content: string; startLine: number }[] = [];
      let currentSecLines: string[] = [];
      let currentStartLine = 0;

      for (let i = 0; i < allLines.length; i++) {
        const line = allLines[i];
        if (line.trim() === '---pagebreak---' || line.includes('<div class="page-break"></div>')) {
          sections.push({
            content: currentSecLines.join('\n'),
            startLine: currentStartLine,
          });
          currentSecLines = [];
          currentStartLine = i + 1;
        } else {
          currentSecLines.push(line);
        }
      }
      sections.push({
        content: currentSecLines.join('\n'),
        startLine: currentStartLine,
      });

      const renderedSections = sections.map((sec) =>
        parseMarkdownToHtml(sec.content.trim(), {
          mathMode,
          isDark: false,
          startLineIndex: sec.startLine,
        })
      );
      setPagesHtml(renderedSections);
    };

    renderAll();

    ensureMathJaxReady().then((ready) => {
      if (ready) renderAll();
    });
  }, [markdown, mathMode]);

  useEffect(() => {
    // 异步加载所有 A4 页面内部的 Mermaid 容器
    const container = activeContainerRef.current;
    if (!container) return;
    const mermaidContainers = container.querySelectorAll('.mermaid-diagram-container');

    mermaidContainers.forEach(async (el) => {
      const codeEnc = el.getAttribute('data-mermaid-code');
      if (!codeEnc) return;
      const code = decodeURIComponent(codeEnc);
      const svgHtml = await renderMermaidDiagram(code, false); // A4 纸张使用浅色打印主题
      el.innerHTML = svgHtml;
    });
  }, [pagesHtml, activeContainerRef]);

  const handleScroll = () => {
    const el = activeContainerRef.current;
    if (el && onScroll) {
      const maxScroll = el.scrollHeight - el.clientHeight;
      const ratio = maxScroll > 0 ? el.scrollTop / maxScroll : 0;
      onScroll(ratio, el.scrollTop);
    }
  };

  const totalPages = Math.max(pagesHtml.length, 1);

  return (
    <div
      ref={activeContainerRef as React.RefObject<HTMLDivElement>}
      onScroll={handleScroll}
      className="flex-1 h-full overflow-y-auto p-8 bg-neutral-800/80 dark:bg-neutral-950 flex flex-col items-center select-text"
    >
      {/* 顶部 A4 纸张状态提示 */}
      <div className="w-[210mm] max-w-full flex items-center justify-between mb-4 text-xs text-neutral-400 no-print">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-neutral-300">A4 物理规格预览</span>
          <span>(210mm × 297mm · 边距 20mm)</span>
        </div>
        <div className="font-mono text-teal-400">共 {totalPages} 页</div>
      </div>

      {/* A4 独立纸张渲染列表 */}
      {pagesHtml.map((htmlContent, index) => {
        const pageNum = index + 1;
        return (
          <div key={pageNum} className="a4-sheet flex flex-col justify-between">
            {/* 页眉 */}
            <div className="flex items-center justify-between pb-3 mb-6 border-b border-neutral-300/80 text-[11px] text-neutral-500 font-sans">
              <span className="font-medium text-neutral-700">{meta.title || 'MarkFlow 技术文档'}</span>
              <span>MarkFlow 0.9 物理排版输出</span>
            </div>

            {/* 正文区域 */}
            <div
              className="flex-1 mf-document-shell mf-doc"
              style={{
          ...documentStyle(theme || {...DEFAULT_THEME,fontSize,lineHeight}),
                fontSize: `${fontSize}px`,
                lineHeight: lineHeight,
              }}
              dangerouslySetInnerHTML={{ __html: htmlContent }}
            />

            {/* 页脚 */}
            <div className="flex items-center justify-between pt-4 mt-8 border-t border-neutral-200 text-[11px] text-neutral-400 font-mono">
              <span>{meta.author ? `编制：${meta.author}` : 'MarkFlow Document'}</span>
              <span className="font-semibold text-neutral-600">
                第 {pageNum} 页 / 共 {totalPages} 页
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
