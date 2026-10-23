/**
 * MarkFlow (墨流) HTML 导出协调器
 * 支持：
 * 1. 静态阅读 HTML (双击即读、带打印样式、无编辑器冗余)
 * 2. 可编辑单文件 HTML (内嵌 Base64 JSON 源载荷，实现 100% 往返导入编辑)
 */

import { DocumentRecord } from '../model/document';
import { parseMarkdownToHtml } from '../parser/markdownParser';
import { encodeSourcePayload } from '../storage/storage';

export interface HtmlExportOptions {
  includeEditablePayload?: boolean;
  mathMode?: 'mathml' | 'svg';
  title?: string;
}

export function generateExportHtml(doc: DocumentRecord, options: HtmlExportOptions = {}): string {
  const includePayload = options.includeEditablePayload ?? false;
  const mathMode = options.mathMode || doc.options.mathMode || 'mathml';
  const renderedContent = parseMarkdownToHtml(doc.markdown, { mathMode });

  const payloadScript = includePayload
    ? `\n  <!-- MarkFlow 权威源数据载荷 (供导入重开编辑) -->\n  <script id="markflow-source-payload" type="application/json">${encodeSourcePayload(doc)}</script>\n`
    : '';

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(doc.meta.title || 'MarkFlow 文档')}</title>
  <style>
    :root {
      --color-primary: ${doc.theme.primaryColor || '#0d9488'};
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      line-height: ${doc.theme.lineHeight || 1.75};
      font-size: ${doc.theme.fontSize || 15}px;
      color: #1f2937;
      background-color: #f9fafb;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 860px;
      margin: 40px auto;
      background: #ffffff;
      padding: 48px 64px;
      border-radius: 8px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
      box-sizing: border-box;
    }
    .doc-header {
      margin-bottom: 2rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid #e5e7eb;
    }
    .doc-meta {
      font-size: 0.875rem;
      color: #6b7280;
      margin-top: 0.5rem;
    }
    h1 { font-size: 2rem; margin-top: 1.5em; margin-bottom: 0.6em; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.3em; color: #111827; }
    h2 { font-size: 1.5rem; margin-top: 1.3em; margin-bottom: 0.5em; border-bottom: 1px solid #f3f4f6; padding-bottom: 0.2em; color: #1f2937; }
    h3 { font-size: 1.25rem; margin-top: 1.2em; margin-bottom: 0.4em; color: #374151; }
    p { margin: 0.8em 0; }
    blockquote {
      border-left: 3px solid var(--color-primary);
      padding-left: 1rem;
      margin: 1.2em 0;
      color: #4b5563;
      font-style: italic;
      background: #f0fdfa;
      padding: 0.5rem 1rem;
      border-radius: 0 4px 4px 0;
    }
    ul, ol { padding-left: 1.5rem; margin: 0.8em 0; }
    li { margin: 0.3em 0; }
    table { width: 100%; border-collapse: collapse; margin: 1.4em 0; font-size: 0.9em; }
    th, td { border: 1px solid #e5e7eb; padding: 8px 12px; text-align: left; }
    th { background: #f9fafb; font-weight: 600; }
    code { font-family: "JetBrains Mono", Consolas, monospace; background: #f3f4f6; padding: 2px 5px; border-radius: 4px; font-size: 0.9em; color: #0f766e; }
    pre { background: #1e293b; color: #f8fafc; padding: 14px; border-radius: 6px; overflow-x: auto; }
    pre code { background: transparent; color: inherit; padding: 0; }
    math { font-size: 1.05em; font-family: "STIX Two Math", "Cambria Math", serif; }
    math[display="block"] { display: block; text-align: center; margin: 1.2em 0; }
    mjx-container[jax="SVG"]:not([display="true"]), mjx-container:not([display="true"]) { display: inline-block !important; vertical-align: -0.25ex !important; margin: 0 0.2em !important; line-height: normal !important; }
    mjx-container[jax="SVG"]:not([display="true"]) svg, mjx-container:not([display="true"]) svg { display: inline !important; vertical-align: -0.25ex !important; margin: 0 !important; }
    mjx-container[jax="SVG"][display="true"], mjx-container[display="true"] { display: block !important; text-align: center !important; margin: 1.2em auto !important; }
    .markflow-inline-math { display: inline !important; vertical-align: baseline !important; }
    .markflow-inline-math svg { display: inline !important; vertical-align: -0.25ex !important; }
    .markflow-inline-math-group { display: inline !important; vertical-align: baseline !important; white-space: normal !important; }
    .markflow-inline-op { display: inline-block !important; vertical-align: -0.2ex !important; margin: 0 0.08em !important; }
    mjx-assistive-mml { display: none !important; visibility: hidden !important; position: absolute !important; }
    hr { border: 0; height: 1px; background: #e5e7eb; margin: 2rem 0; }
    img { max-width: 100%; height: auto; border-radius: 4px; margin: 1em 0; }
    .markflow-watermark {
      text-align: right;
      font-size: 0.75rem;
      color: #9ca3af;
      margin-top: 3rem;
      padding-top: 1rem;
      border-top: 1px dashed #e5e7eb;
    }
    @media print {
      body { background: white; }
      .container { max-width: 100%; margin: 0; padding: 0; box-shadow: none; }
      .no-print { display: none !important; }
      @page { size: A4; margin: 15mm 20mm; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="doc-header">
      <div class="doc-meta">
        <span>作者: ${escapeHtml(doc.meta.author || 'MarkFlow 用户')}</span> · 
        <span>更新日期: ${new Date(doc.meta.updatedAt).toLocaleDateString('zh-CN')}</span> ·
        <span>模式: ${includePayload ? '可编辑双模 (含源载荷)' : '静态阅读交付'}</span>
      </div>
    </div>
    <main class="markflow-body">
      ${renderedContent}
    </main>
    <div class="markflow-watermark no-print">
      由 MarkFlow (墨流) 排版生成 · 遵循通用文档开放互操作标准
    </div>
  </div>${payloadScript}
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
