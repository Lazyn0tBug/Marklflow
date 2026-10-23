/**
 * MarkFlow (墨流) 核心 Markdown 解析器
 * 支持大纲提取、MathJax 公式提取 (MathML/SVG)、图表围栏 (Mermaid/DOT)、表格、显式分页符
 * 采用占位符隔离机制，避免 LaTeX 内部的 *、_、<、> 被 Markdown 格式化破坏
 */

import { latexToMathML, latexToSVG } from '../render/mathRender';
import { renderDotToSVG } from '../render/graphvizRender';

export interface HeadingItem {
  id: string;
  level: number;
  text: string;
  line: number;
}

export function createHeadingId(lineIndex: number, text: string): string {
  const clean = text.replace(/[*_`~[\]]/g, '').replace(/\$(.*?)\$/g, '$1');
  return 'heading_' + lineIndex + '_' + encodeURIComponent(clean.slice(0, 24).toLowerCase().replace(/\s+/g, '-'));
}

/**
 * 提取文档大纲结构
 */
export function extractOutline(markdown: string): HeadingItem[] {
  const headings: HeadingItem[] = [];
  const lines = markdown.split('\n');

  lines.forEach((line, index) => {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      const rawText = match[2].trim();
      const cleanText = rawText.replace(/[*_`~[\]]/g, '').replace(/\$(.*?)\$/g, '$1');
      const id = createHeadingId(index, cleanText);
      headings.push({
        id,
        level,
        text: cleanText,
        line: index + 1,
      });
    }
  });

  return headings;
}

export interface ParseOptions {
  mathMode?: 'mathml' | 'svg';
  isDark?: boolean;
  startLineIndex?: number;
}

/**
 * 解析并转换为渲染 HTML
 */
export function parseMarkdownToHtml(markdown: string, options: ParseOptions = {}): string {
  const mathMode = options.mathMode || 'mathml';
  const startLineIndex = options.startLineIndex || 0;
  const lines = markdown.split('\n');
  const output: string[] = [];
  let inCodeBlock = false;
  let codeLang = '';
  let codeContent: string[] = [];
  let inBlockMath = false;
  let mathContent: string[] = [];
  let inTable = false;
  let tableRows: string[][] = [];
  let tableAligns: ('left' | 'center' | 'right')[] = [];
  let inList: 'ul' | 'ol' | null = null;

  const flushList = () => {
    if (inList) {
      output.push(`</${inList}>`);
      inList = null;
    }
  };

  const flushTable = () => {
    if (inTable && tableRows.length > 0) {
      let tableHtml = '<div class="overflow-x-auto my-4"><table class="min-w-full divide-y divide-neutral-200 dark:divide-neutral-700">';
      // Header
      const headerRow = tableRows[0];
      tableHtml += '<thead><tr>';
      headerRow.forEach((cell, idx) => {
        const align = tableAligns[idx] || 'left';
        tableHtml += `<th class="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-${align}">${parseInline(cell, mathMode)}</th>`;
      });
      tableHtml += '</tr></thead><tbody class="divide-y divide-neutral-200 dark:divide-neutral-700/50">';
      // Body
      for (let i = 1; i < tableRows.length; i++) {
        tableHtml += '<tr class="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30 transition-colors">';
        tableRows[i].forEach((cell, idx) => {
          const align = tableAligns[idx] || 'left';
          tableHtml += `<td class="px-4 py-2.5 text-sm text-${align}">${parseInline(cell, mathMode)}</td>`;
        });
        tableHtml += '</tr>';
      }
      tableHtml += '</tbody></table></div>';
      output.push(tableHtml);
      tableRows = [];
      tableAligns = [];
      inTable = false;
    }
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    // 1. 显式物理分页符
    if (trimmed === '---pagebreak---' || trimmed === '<div class="page-break"></div>') {
      flushList();
      flushTable();
      output.push('<div class="markflow-page-break-indicator my-6 py-2 border-t-2 border-dashed border-teal-500/40 text-center text-xs text-teal-600 dark:text-teal-400 no-print">✦ A4 物理分页断点 ✦</div><div class="print-only" style="page-break-after: always; break-after: page;"></div>');
      return;
    }

    // 2. 单行独立公式块 $$ ... $$
    if (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length > 4) {
      flushList();
      flushTable();
      const latex = trimmed.slice(2, -2).trim();
      const renderedMath = mathMode === 'svg' ? latexToSVG(latex, true) : latexToMathML(latex, true);
      output.push(`<div class="markflow-math-block my-4 overflow-x-auto text-center">${renderedMath}</div>`);
      return;
    }

    // 3. 多行独立公式块 $$
    if (trimmed === '$$') {
      flushList();
      flushTable();
      if (inBlockMath) {
        // 结束公式块
        const latex = mathContent.join('\n');
        const renderedMath = mathMode === 'svg' ? latexToSVG(latex, true) : latexToMathML(latex, true);
        output.push(`<div class="markflow-math-block my-4 overflow-x-auto text-center">${renderedMath}</div>`);
        mathContent = [];
        inBlockMath = false;
      } else {
        inBlockMath = true;
      }
      return;
    }

    if (inBlockMath) {
      mathContent.push(line);
      return;
    }

    // 4. 代码块围栏 ```
    if (trimmed.startsWith('```')) {
      flushList();
      flushTable();
      if (inCodeBlock) {
        // 结束代码块
        const codeText = codeContent.join('\n');
        if (codeLang === 'mermaid') {
          output.push(`<div class="mermaid-diagram-container" data-mermaid-code="${encodeURIComponent(codeText)}"><div class="p-4 my-2 rounded bg-neutral-100 dark:bg-neutral-800/50 text-xs font-mono animate-pulse">正在渲染 Mermaid 矢量图表...</div></div>`);
        } else if (codeLang === 'dot' || codeLang === 'graphviz') {
          output.push(renderDotToSVG(codeText));
        } else {
          output.push(`<div class="my-4 rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-800 bg-neutral-900 text-neutral-100"><div class="px-3 py-1.5 bg-neutral-800/80 text-[11px] font-mono text-neutral-400 border-b border-neutral-700/50 flex justify-between"><span>${codeLang || 'plaintext'}</span><span class="text-[10px]">MarkFlow Syntax</span></div><pre class="p-3 text-xs font-mono overflow-x-auto leading-relaxed"><code>${escapeHtml(codeText)}</code></pre></div>`);
        }
        codeContent = [];
        codeLang = '';
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        codeLang = trimmed.slice(3).trim().toLowerCase();
      }
      return;
    }

    if (inCodeBlock) {
      codeContent.push(line);
      return;
    }

    // 5. 表格行判断 | col1 | col2 |
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      flushList();
      const cells = trimmed.slice(1, -1).split('|').map((c) => c.trim());
      const isAlignRow = cells.every((c) => /^:?-+:?$/.test(c));
      if (isAlignRow) {
        tableAligns = cells.map((c) => {
          if (c.startsWith(':') && c.endsWith(':')) return 'center';
          if (c.endsWith(':')) return 'right';
          return 'left';
        });
      } else {
        inTable = true;
        tableRows.push(cells);
      }
      return;
    } else if (inTable) {
      flushTable();
    }

    // 6. 标题 # ~ ######
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushList();
      flushTable();
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();
      const absoluteLine = startLineIndex + index;
      const id = createHeadingId(absoluteLine, text);
      output.push(`<h${level} id="${id}" data-heading-id="${id}" data-line="${absoluteLine + 1}" class="scroll-mt-6">${parseInline(text, mathMode)}</h${level}>`);
      return;
    }

    // 7. 引用块 >
    if (trimmed.startsWith('>')) {
      flushList();
      flushTable();
      const quoteText = line.replace(/^\s*>\s?/, '');
      output.push(`<blockquote>${parseInline(quoteText, mathMode)}</blockquote>`);
      return;
    }

    // 8. 无序列表 - 或 *
    const ulMatch = line.match(/^(\s*)([-*+])\s+(.+)$/);
    if (ulMatch) {
      flushTable();
      if (inList !== 'ul') {
        flushList();
        output.push('<ul>');
        inList = 'ul';
      }
      const itemText = ulMatch[3];
      output.push(`<li>${parseInline(itemText, mathMode)}</li>`);
      return;
    }

    // 9. 有序列表 1.
    const olMatch = line.match(/^(\s*)(\d+)\.\s+(.+)$/);
    if (olMatch) {
      flushTable();
      if (inList !== 'ol') {
        flushList();
        output.push('<ol>');
        inList = 'ol';
      }
      const itemText = olMatch[3];
      output.push(`<li>${parseInline(itemText, mathMode)}</li>`);
      return;
    }

    // 10. 分割线 ---
    if (/^[-*_]{3,}$/.test(trimmed)) {
      flushList();
      flushTable();
      output.push('<hr />');
      return;
    }

    // 11. 空行
    if (!trimmed) {
      flushList();
      flushTable();
      return;
    }

    // 12. 普通段落
    flushList();
    flushTable();
    output.push(`<p>${parseInline(line, mathMode)}</p>`);
  });

  flushList();
  flushTable();

  return output.join('\n');
}

/**
 * 解析行内语法：加粗、倾斜、行内代码、行内公式、链接、图片
 * 采用占位符隔离保护数学公式与代码
 */
export function parseInline(text: string, mathMode: 'mathml' | 'svg' = 'mathml'): string {
  let str = text;

  // 1. 保护并抽取所有行内数学公式 $...$
  const mathPlaceholders: string[] = [];
  str = str.replace(/\$([^\$\n]+?)\$/g, (_, latex) => {
    const idx = mathPlaceholders.length;
    mathPlaceholders.push(latex);
    return `%%MFMATH_${idx}%%`;
  });

  // 2. 保护行内代码 `...`
  const codePlaceholders: string[] = [];
  str = str.replace(/`([^`]+)`/g, (_, code) => {
    const idx = codePlaceholders.length;
    codePlaceholders.push(code);
    return `%%MFCODE_${idx}%%`;
  });

  // 3. 图片 ![alt](url)
  str = str.replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1" class="rounded border border-neutral-200 dark:border-neutral-800 max-h-96 my-2" />');

  // 4. 链接 [text](url)
  str = str.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-teal-600 dark:text-teal-400 underline hover:text-teal-700 transition-colors">$1</a>');

  // 5. 加粗 **text**
  str = str.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  // 6. 斜体 *text*
  str = str.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // 7. 删除线 ~~text~~
  str = str.replace(/~~(.*?)~~/g, '<del>$1</del>');

  // 8. 恢复代码
  str = str.replace(/%%MFCODE_(\d+)%%/g, (_, idx) => {
    const code = codePlaceholders[Number(idx)];
    return `<code class="px-1.5 py-0.5 rounded text-[13px] bg-neutral-200/60 dark:bg-neutral-800 text-teal-700 dark:text-teal-300 font-mono">${escapeHtml(code)}</code>`;
  });

  // 9. 恢复由 MathJax 渲染的数学公式
  str = str.replace(/%%MFMATH_(\d+)%%/g, (_, idx) => {
    const latex = mathPlaceholders[Number(idx)];
    return mathMode === 'svg' ? latexToSVG(latex, false) : latexToMathML(latex, false);
  });

  return str;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * 快速生成指定行数与列数的标准 Markdown 表格
 */
export function generateMarkdownTable(cols: number = 3, rows: number = 3): string {
  const safeCols = Math.max(1, Math.min(cols, 12));
  const safeRows = Math.max(1, Math.min(rows, 20));

  const headerCols = Array.from({ length: safeCols }, (_, i) => `表头 ${i + 1}`);
  const alignCols = Array.from({ length: safeCols }, () => ':---');
  const headerLine = `| ${headerCols.join(' | ')} |`;
  const alignLine = `| ${alignCols.join(' | ')} |`;
  const dataLines = Array.from({ length: Math.max(1, safeRows - 1) }, (_, r) => {
    const rowCols = Array.from({ length: safeCols }, (_, c) => `数据 ${r + 1}-${c + 1}`);
    return `| ${rowCols.join(' | ')} |`;
  });

  return `\n${headerLine}\n${alignLine}\n${dataLines.join('\n')}\n`;
}
