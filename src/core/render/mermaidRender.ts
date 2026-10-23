/**
 * MarkFlow (墨流) Mermaid 图表渲染适配器
 */

import mermaid from 'mermaid';
import { escapeHtml, sanitizeDocumentHtml } from './htmlPolicy';

let isInitialized = false;

export function initMermaid(isDark: boolean = false) {
  try {
    mermaid.initialize({
      startOnLoad: false,
      theme: isDark ? 'dark' : 'default',
      securityLevel: 'strict',
      flowchart: { htmlLabels: false },
      fontFamily: 'inherit',
    });
    isInitialized = true;
  } catch (err) {
    console.warn('Mermaid initialization warning:', err);
  }
}

export async function renderMermaidDiagram(code: string, isDark: boolean = false): Promise<string> {
  if (!isInitialized) {
    initMermaid(isDark);
  }

  const id = 'mermaid_' + Math.random().toString(36).substring(2, 10);
  try {
    const { svg } = await mermaid.render(id, code.trim());
    return `<div class="my-4 flex justify-center overflow-x-auto p-3 rounded-lg bg-neutral-50/50 dark:bg-neutral-800/20 border border-neutral-200 dark:border-neutral-700/50">${sanitizeDocumentHtml(svg)}</div>`;
  } catch (err) {
    return `<div class="p-3 my-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded border border-amber-200 dark:border-amber-800">
      <div class="font-semibold mb-1">Mermaid 语法解析提示</div>
      <pre class="font-mono text-[11px] whitespace-pre-wrap">${escapeHtml(code.trim())}</pre>
      <div class="text-[10px] text-amber-500 mt-1">${escapeHtml(String(err))}</div>
    </div>`;
  }
}
