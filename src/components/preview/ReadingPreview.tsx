/**
 * MarkFlow (墨流) 流式阅读预览组件
 * 对应设计方案第 4.5.4 节与第 7 章
 * 支持：流式舒适排版、MathML/SVG 双模式公式、Mermaid 与 Graphviz 实时渲染、复制与交互
 * 支持双向精准同步滚动联动
 */

import React, { useEffect, useRef, useState } from 'react';
import { parseMarkdownToHtml } from '../../core/parser/markdownParser';
import { renderMermaidDiagram } from '../../core/render/mermaidRender';
import { ensureMathJaxReady } from '../../core/render/mathRender';

interface ReadingPreviewProps {
  markdown: string;
  mathMode: 'mathml' | 'svg';
  isDark: boolean;
  fontSize: number;
  lineHeight: number;
  containerRef?: React.RefObject<HTMLDivElement | null>;
  onScroll?: (ratio: number, scrollTop: number) => void;
  maxWidth?: number | 'full';
}

export const ReadingPreview: React.FC<ReadingPreviewProps> = ({
  markdown,
  mathMode,
  isDark,
  fontSize,
  lineHeight,
  containerRef: externalContainerRef,
  onScroll,
  maxWidth = 1024,
}) => {
  const internalContainerRef = useRef<HTMLDivElement | null>(null);
  const activeContainerRef = externalContainerRef || internalContainerRef;
  const [renderedHtml, setRenderedHtml] = useState<string>('');

  useEffect(() => {
    // 立即执行一次基础解析
    const baseHtml = parseMarkdownToHtml(markdown, { mathMode, isDark });
    setRenderedHtml(baseHtml);

    // 确保 MathJax 准备好后执行完整公式渲染
    ensureMathJaxReady().then((ready) => {
      if (ready) {
        setRenderedHtml(parseMarkdownToHtml(markdown, { mathMode, isDark }));
      }
    });
  }, [markdown, mathMode, isDark]);

  useEffect(() => {
    // 异步补全 Mermaid 图表容器
    const container = activeContainerRef.current;
    if (!container) return;
    const mermaidContainers = container.querySelectorAll('.mermaid-diagram-container');

    mermaidContainers.forEach(async (el) => {
      const codeEnc = el.getAttribute('data-mermaid-code');
      if (!codeEnc) return;
      const code = decodeURIComponent(codeEnc);
      const svgHtml = await renderMermaidDiagram(code, isDark);
      el.innerHTML = svgHtml;
    });
  }, [renderedHtml, isDark, activeContainerRef]);

  const handleScroll = () => {
    const el = activeContainerRef.current;
    if (el && onScroll) {
      const maxScroll = el.scrollHeight - el.clientHeight;
      const ratio = maxScroll > 0 ? el.scrollTop / maxScroll : 0;
      onScroll(ratio, el.scrollTop);
    }
  };

  return (
    <div
      ref={activeContainerRef as React.RefObject<HTMLDivElement>}
      onScroll={handleScroll}
      className="flex-1 h-full overflow-y-auto px-8 py-10 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 transition-colors select-text"
    >
      <div
        className="mx-auto doc-rendered w-full"
        style={{
          maxWidth: maxWidth === 'full' ? '100%' : `${maxWidth}px`,
          fontSize: `${fontSize}px`,
          lineHeight: lineHeight,
        }}
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
      />
    </div>
  );
};
