import { printFrozenHtml } from '../../core/export/documentPrint';
import { inspectDocx } from '../../core/export/outputCapabilities';
/**
 * MarkFlow (墨流) 导出控制中心
 * 依据设计方案第 8 章与 4.5.4 节实现
 * 覆盖：静态阅读 HTML、可编辑单文件 HTML (含源载荷)、浏览器打印 A4 PDF、原生 DOCX
 */

import React, { useEffect, useState } from 'react';
import { X, Download, Printer, FileCode, FileText, CheckCircle, AlertTriangle, Layers } from 'lucide-react';
import { DocumentRecord } from '../../core/model/document';
import { generateExportHtml } from '../../core/export/htmlExporter';
import { exportDocumentToDocx } from '../../core/export/docxExporter';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: DocumentRecord;
  mathMode: 'mathml' | 'svg';
}

export type ExportFormat = 'editable-html' | 'reading-html' | 'docx' | 'print-pdf' | 'markdown';

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose, document: doc, mathMode }) => {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('editable-html');
  const [fileName, setFileName] = useState<string>(doc.meta.title || 'MarkFlow-Document');
  const [allowSourceFallback, setAllowSourceFallback] = useState(false);
  const [allowRemoteAssets, setAllowRemoteAssets] = useState(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(()=>{if(isOpen){setFileName(doc.meta.title||'MarkFlow-Document');setExportSuccess(null);setExportError(null);setAllowSourceFallback(false);setAllowRemoteAssets(false)}},[isOpen,doc.id]);
  if (!isOpen) return null;

  const handleExport = async () => {
    setIsExporting(true);
    setExportSuccess(null);
    setExportError(null);

    const safeName = fileName.trim() || 'MarkFlow-Document';

    try {
      if (selectedFormat === 'print-pdf') {
        const frozen = await generateExportHtml(doc, { mathMode, allowRemoteAssets });
        await printFrozenHtml(frozen);
        onClose();
        return;
      }

      if (selectedFormat === 'editable-html') {
        const html = await generateExportHtml(doc, { includeEditablePayload: true, mathMode, allowRemoteAssets });
        downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), `${safeName}.markflow.html`);
        setExportSuccess(`已成功下载可编辑 HTML，含全量 Markdown 载荷`);
      } else if (selectedFormat === 'reading-html') {
        const html = await generateExportHtml(doc, { includeEditablePayload: false, mathMode, allowRemoteAssets });
        downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), `${safeName}.html`);
        setExportSuccess(`已成功生成静态阅读 HTML`);
      } else if (selectedFormat === 'docx') {
        const blob = await exportDocumentToDocx(doc, { allowSourceFallback, allowRemoteAssets });
        downloadBlob(blob, `${safeName}.docx`);
        setExportSuccess(`已成功导出原生 DOCX 文档 (OpenXML)`);
      } else if (selectedFormat === 'markdown') {
        downloadBlob(new Blob([doc.markdown], { type: 'text/markdown;charset=utf-8' }), `${safeName}.md`);
        setExportSuccess(`已成功下载原始 Markdown 文件`);
      }
    } catch (err) {
      console.error('Export error:', err);
      setExportError('导出过程出错: ' + String(err));
    } finally {
      setIsExporting(false);
    }
  };

  const downloadBlob = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 no-print animate-in fade-in duration-200">
      <div className="w-full max-w-2xl max-h-[90dvh] rounded-xl bg-neutral-900 border border-neutral-700/80 shadow-2xl text-neutral-100 overflow-hidden flex flex-col">
        {selectedFormat === 'docx' && inspectDocx(doc.markdown).length > 0 && <section className="m-4 text-xs text-amber-200" aria-label="DOCX 兼容性提示"><ul>{inspectDocx(doc.markdown).map((issue,i)=><li key={i}>{issue.nodeId}：{issue.message}</li>)}</ul><label className="flex gap-2 mt-2"><input type="checkbox" checked={allowSourceFallback} onChange={e=>setAllowSourceFallback(e.target.checked)}/>接受图片静态化及语义重排</label></section>}
        <label className="m-4 flex gap-2 text-xs"><input type="checkbox" checked={allowRemoteAssets} onChange={e=>setAllowRemoteAssets(e.target.checked)}/>允许联网收集文档外部图片（受 CORS 限制）</label>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-950/40">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-neutral-100">导出与发布文档</h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                基于冻结修订快照 (Rev {doc.revision}) 输出自包含成品
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto min-h-0">
          {/* File Name */}
          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1.5">导出文件主名称</label>
            <input
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-700/80 text-sm text-neutral-100 focus:outline-none focus:border-teal-500 transition-colors"
              placeholder="输入文件名..."
            />
          </div>

          {/* Format Selection Grid */}
          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-2">选择导出目标格式</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {/* 可编辑 HTML */}
              <button
                type="button"
                onClick={() => setSelectedFormat('editable-html')}
                className={`p-3 rounded-lg border text-left transition-all flex items-start gap-3 ${
                  selectedFormat === 'editable-html'
                    ? 'bg-neutral-800 border-teal-500 ring-1 ring-teal-500/30'
                    : 'bg-neutral-950/50 border-neutral-800 hover:border-neutral-700'
                }`}
              >
                <div className="p-2 rounded bg-teal-500/10 text-teal-400 shrink-0 mt-0.5">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5 font-medium text-xs text-neutral-100">
                    可编辑单文件 HTML
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-teal-900/60 text-teal-300 font-mono">推荐</span>
                  </div>
                  <p className="text-[11px] text-neutral-400 mt-1 leading-normal">
                    独立自包含排版网页，同时内嵌 Base64 权威源载荷。双击可阅读，通过工作区导入可恢复原始 Markdown 与受支持元数据。
                  </p>
                </div>
              </button>

              {/* 打印 A4 PDF */}
              <button
                type="button"
                onClick={() => setSelectedFormat('print-pdf')}
                className={`p-3 rounded-lg border text-left transition-all flex items-start gap-3 ${
                  selectedFormat === 'print-pdf'
                    ? 'bg-neutral-800 border-teal-500 ring-1 ring-teal-500/30'
                    : 'bg-neutral-950/50 border-neutral-800 hover:border-neutral-700'
                }`}
              >
                <div className="p-2 rounded bg-sky-500/10 text-sky-400 shrink-0 mt-0.5">
                  <Printer className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-medium text-xs text-neutral-100">打印 / 保存为 A4 PDF</div>
                  <p className="text-[11px] text-neutral-400 mt-1 leading-normal">
                    准备 A4 文档后调用浏览器打印；实际分页、字体及 PDF 结果需在目标环境核对。
                  </p>
                </div>
              </button>

              {/* 原生 DOCX */}
              <button
                type="button"
                onClick={() => setSelectedFormat('docx')}
                className={`p-3 rounded-lg border text-left transition-all flex items-start gap-3 ${
                  selectedFormat === 'docx'
                    ? 'bg-neutral-800 border-teal-500 ring-1 ring-teal-500/30'
                    : 'bg-neutral-950/50 border-neutral-800 hover:border-neutral-700'
                }`}
              >
                <div className="p-2 rounded bg-blue-500/10 text-blue-400 shrink-0 mt-0.5">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-medium text-xs text-neutral-100">Word 原生文档 (.docx)</div>
                  <p className="text-[11px] text-neutral-400 mt-1 leading-normal">
                    利用 docx 引擎生成真正 OpenXML 格式，原生标题、段落、列表与表格映射为原生对象；Word/WPS 的显示效果需另行验证。
                  </p>
                </div>
              </button>

              {/* 纯净静态 HTML */}
              <button
                type="button"
                onClick={() => setSelectedFormat('reading-html')}
                className={`p-3 rounded-lg border text-left transition-all flex items-start gap-3 ${
                  selectedFormat === 'reading-html'
                    ? 'bg-neutral-800 border-teal-500 ring-1 ring-teal-500/30'
                    : 'bg-neutral-950/50 border-neutral-800 hover:border-neutral-700'
                }`}
              >
                <div className="p-2 rounded bg-amber-500/10 text-amber-400 shrink-0 mt-0.5">
                  <FileCode className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-medium text-xs text-neutral-100">纯净静态阅读 HTML</div>
                  <p className="text-[11px] text-neutral-400 mt-1 leading-normal">
                    不携带任何源数据，体积轻便紧凑，适合公开发布或交付第三方直接阅读。
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* Capabilities Diagnostics Box */}
          <div className="p-3 rounded-lg bg-neutral-950/60 border border-neutral-800 text-xs">
            <div className="flex items-center gap-2 font-medium text-neutral-300 mb-1">
              <AlertTriangle className="w-3.5 h-3.5 text-teal-400" />
              <span>当前格式排版特性与能力矩阵诊断</span>
            </div>
            <div className="text-[11px] text-neutral-400 space-y-0.5">
              {selectedFormat === 'editable-html' && (
                <div>• 公式采用 <strong>{mathMode.toUpperCase()}</strong> 渲染；源载荷支持再次导入 MarkFlow 无损重构。</div>
              )}
              {selectedFormat === 'print-pdf' && (
                <div>• 打印使用冻结文档，等待图片/字体就绪；系统打印设置及实际分页须另行核对。</div>
              )}
              {selectedFormat === 'docx' && (
                <div>• 段落与表格映射为 Word 原生对象；公式和图表以图片输出，原始HTML按语义重排；须明确接受，不能原生编辑公式或保留交互。</div>
              )}
              {selectedFormat === 'reading-html' && (
                <div>• 页面内嵌自包含 CSS 与公式渲染，接收方无需安装任何插件或字体库即可阅读。</div>
              )}
            </div>
          </div>

          {exportSuccess && (
            <div className="p-2.5 rounded-lg bg-teal-950/50 border border-teal-800/80 text-xs text-teal-300 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-teal-400 shrink-0" />
              <span>{exportSuccess}</span>
            </div>
          )}

          {exportError && (
            <div className="p-2.5 rounded-lg bg-red-950/60 border border-red-800 text-xs text-red-300 flex items-center justify-between gap-2">
              <span>{exportError}</span>
              <button
                type="button"
                onClick={() => setExportError(null)}
                className="text-red-400 hover:text-white px-1"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-neutral-800 bg-neutral-950/40">
          <button
            type="button"
            onClick={() => setSelectedFormat('markdown')}
            className="text-xs text-neutral-400 hover:text-neutral-200 underline transition-colors"
          >
            下载原始 Markdown (.md)
          </button>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={isExporting||(selectedFormat==='docx'&&inspectDocx(doc.markdown).some(i=>i.adaptation==='unsupported'))}
              className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs font-medium bg-teal-600 hover:bg-teal-500 text-white transition-colors disabled:opacity-50 shadow-md shadow-teal-950/30"
            >
              <Download className="w-4 h-4" />
              {isExporting ? '正在生成...' : selectedFormat === 'print-pdf' ? '唤起系统打印' : '立即导出并保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
