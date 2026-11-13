import {createPortal} from 'react-dom';
import {webExportService} from '../../core/platform/web/exportService';
import {nativeExportService} from '../../core/platform/tauri/exportService';
import {resolveExportRoot, type ExportRootChoice} from '../../core/platform/exportRoot';
import type {ExportFormat, ExportService} from '../../application/exports/exportService';
import {exportFile} from '../../application/exports/exportFile';
import {groupDocxIssues, type OutputIssue} from '../../core/export/outputCapabilities';
import {reportAsync, reportFailure} from '../../core/platform/failures';
/**
 * MarkFlow (墨流) 导出控制中心
 * 依据设计方案第 8 章与 4.5.4 节实现
 * 覆盖：静态阅读 HTML、可编辑单文件 HTML (含源载荷)、浏览器打印 PDF、原生 DOCX
 */

import React, {useEffect, useMemo, useRef, useState} from 'react';
import {X, Download, FileCode, FileText, AlertTriangle, Layers} from 'lucide-react';
import {DocumentRecord} from '../../core/model/document';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: DocumentRecord;
  mathMode: 'mathml' | 'svg';
  onNotice?: (notice: ExportNotice) => void;
  messageRegionId?: string;
  returnFocusRef?: React.RefObject<HTMLButtonElement | null>;
}

/** The outcome of one export, reported outside the dialog so a system window cannot hide it. */
export interface ExportNotice {
  message: string;
  tone: 'success' | 'info' | 'warning' | 'error';
}

export type {ExportFormat} from '../../application/exports/exportService';

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  document: doc,
  mathMode,
  onNotice,
  messageRegionId,
  returnFocusRef,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null),
    closeRef = useRef(onClose);
  const reviewDismissed = useRef(false),
    openRef = useRef(isOpen),
    reviewResolver = useRef<((accepted: boolean) => void) | null>(null);
  openRef.current = isOpen;
  const [reviewing, setReviewing] = useState(false),
    [docxIssues, setDocxIssues] = useState<readonly OutputIssue[]>([]);
  const finishReview = (accepted: boolean) => {
    const resolve = reviewResolver.current;
    reviewResolver.current = null;
    setReviewing(false);
    resolve?.(accepted);
  };
  closeRef.current = () => {
    reviewDismissed.current = true;
    finishReview(false);
    onClose();
  };
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('editable-html');
  const [fileName, setFileName] = useState<string>(doc.meta.title || 'MarkFlow-Document');
  const [allowSourceFallback, setAllowSourceFallback] = useState(false);
  const [allowRemoteAssets, setAllowRemoteAssets] = useState(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  // 导出服务：**启动时定下走哪个根** ✓（配置说了算 ✓）。
  const [service, setService] = useState<ExportService>(webExportService);
  const [root, setRoot] = useState<ExportRootChoice>({root: 'web', nativePdfAvailable: false});
  // 根的解析结果也留一份**可等**的 ✓：导出时必须用**解析出来的那一个** ✓ ——
  // 否则解析还没回来就点导出的话 ✓，会悄悄走 Web 根 ✓（那正是"不许回落"要防的 ✓）。
  const rootPromise = useRef<Promise<{choice: ExportRootChoice; service: ExportService}>>(
    Promise.resolve({choice: {root: 'web', nativePdfAvailable: false}, service: webExportService}),
  );

  const docxGroups = useMemo(() => groupDocxIssues(docxIssues), [docxIssues]);
  const docxBlocked = docxIssues.some((issue) => issue.adaptation === 'unsupported');
  useEffect(() => {
    let cancelled = false;
    rootPromise.current = resolveExportRoot().then((choice) => ({
      choice,
      service: choice.root === 'native' ? nativeExportService : webExportService,
    }));
    reportAsync(
      'export-failed',
      rootPromise.current.then((resolved) => {
        if (cancelled) return;
        setRoot(resolved.choice);
        setService(resolved.service);
      }),
    );
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!service.busy) {
      setAllowSourceFallback(false);
      setDocxIssues([]);
    }
  }, [doc.id, doc.markdown, selectedFormat, service]);
  useEffect(() => {
    if (isOpen && !service.busy) {
      setFileName(doc.meta.title || 'MarkFlow-Document');
      setAllowSourceFallback(false);
      setAllowRemoteAssets(false);
      setDocxIssues([]);
    }
  }, [isOpen, doc.id, service]);
  useEffect(() => {
    if (!isOpen) {
      reviewDismissed.current = true;
      if (reviewResolver.current) finishReview(false);
    }
  }, [isOpen]);
  useEffect(() => {
    openRef.current = isOpen;
    return () => {
      openRef.current = false;
      reviewDismissed.current = true;
      reviewResolver.current?.(false);
      reviewResolver.current = null;
    };
  }, []);
  useEffect(() => {
    if (reviewing)
      dialogRef.current?.querySelector<HTMLInputElement>('#export-docx-consent')?.focus();
  }, [reviewing]);
  useEffect(() => {
    if (!isOpen) return;
    const panel = dialogRef.current;
    const previous = window.document.activeElement;
    if (!panel) return;
    const region = messageRegionId ? window.document.getElementById(messageRegionId) : null;
    const selector = 'button:not(:disabled),input:not(:disabled),a[href],summary,[tabindex="0"]';
    const controls = (root: Element) =>
      Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(
        (item) =>
          item.tabIndex >= 0 && item.getClientRects().length > 0 && !item.closest('[inert]'),
      );
    let lastPanelFocus = panel.querySelector<HTMLElement>('#export-file-name');
    const returnToPanel = () => {
      const target =
        lastPanelFocus?.isConnected && !lastPanelFocus.matches(':disabled')
          ? lastPanelFocus
          : controls(panel)[0];
      target?.focus();
    };
    returnToPanel();
    const focusin = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (panel.contains(target)) lastPanelFocus = target;
      else if (!region?.contains(target) || (target === region && controls(region).length === 0))
        returnToPanel();
    };
    const keydown = (event: KeyboardEvent) => {
      const active = window.document.activeElement;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        // Leaving the message island must not cancel the export dialog or acknowledge an error.
        if (region?.contains(active)) returnToPanel();
        else closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = [...controls(panel), ...(region ? controls(region) : [])];
      if (!items.length) return;
      event.preventDefault();
      const index = items.findIndex((item) => item === active);
      const next =
        index < 0
          ? event.shiftKey
            ? items.length - 1
            : 0
          : (index + (event.shiftKey ? -1 : 1) + items.length) % items.length;
      items[next]?.focus();
    };
    window.document.addEventListener('keydown', keydown, true);
    window.document.addEventListener('focusin', focusin, true);
    return () => {
      window.document.removeEventListener('keydown', keydown, true);
      window.document.removeEventListener('focusin', focusin, true);
      const target = returnFocusRef?.current ?? previous;
      if (target instanceof HTMLElement && target.isConnected) target.focus();
    };
  }, [isOpen, messageRegionId, returnFocusRef]);
  if (!isOpen) return null;

  const handleExport = async () => {
    if (reviewing) {
      if (allowSourceFallback && !docxBlocked) finishReview(true);
      return;
    }
    // **先等根解析完** ✓：用解析出来的那一个 ✓ —— 不拿"还没定"的那份去导出 ✓ ✓。
    // **解析失败 ⇒ ⇒ 这一步自己兜住** ✓ ⇒ ⇒ 不会变成一次未处理的拒绝 ✓ ⇒ ⇒
    // 日志里因此有类别与定位 ✓ ⇒ ⇒ 不会只剩一句"出了个拒绝" ✓。
    const resolved = await rootPromise.current.catch((error) => {
      onNotice?.({message: '导出准备失败：无法确定导出方式', tone: 'error'});
      void reportFailure({category: 'export-failed', detail: String(error), cause: error});
      return undefined;
    });
    if (!resolved) return;
    const chosen = resolved.service;
    if (chosen.busy) {
      onNotice?.({message: '正在导出，请稍候', tone: 'info'});
      return;
    }
    // 选了原生而平台没有静默 PDF：**明说不做** ✓（不回落 ✓ —— 回落就是降级 ✓）。
    if (
      selectedFormat === 'print-pdf' &&
      resolved.choice.root === 'native' &&
      !resolved.choice.nativePdfAvailable
    ) {
      onNotice?.({
        message: resolved.choice.blockedReason ?? '此平台不支持静默 PDF 打印',
        tone: 'error',
      });
      return;
    }
    reviewDismissed.current = false;
    setIsExporting(true);
    setDocxIssues([]);
    try {
      const result = await chosen.run(
        {document: doc, format: selectedFormat, fileName, mathMode, allowRemoteAssets},
        {
          confirmDocx: (issues) => {
            if (!openRef.current || reviewDismissed.current) return Promise.resolve(false);
            setDocxIssues(issues);
            setAllowSourceFallback(false);
            setReviewing(true);
            return new Promise<boolean>((resolve) => {
              reviewResolver.current = resolve;
            });
          },
        },
      );
      if (result.status !== 'busy' && result.issues) setDocxIssues(result.issues);
      // The print dialog and the save picker are system windows: the outcome is reported outside this dialog.
      // 失败 ⇒ **带机器码走那个出口** ✓ ⇒ ⇒ 通知、日志、控制台一次到位 ✓ ⇒ ⇒ 原文不进用户面 ✓。
      if (result.status === 'failed')
        await reportFailure({
          category: 'export-failed',
          message: result.message,
          detail: result.message,
        });
      else if (result.status === 'blocked')
        await reportFailure({
          category: 'export-blocked',
          message: result.message,
          detail: result.message,
          tone: 'warning',
        });
      else if (result.status !== 'busy')
        onNotice?.({
          message: result.message,
          tone: result.status === 'completed' ? 'success' : 'info',
        });
    } catch (err) {
      // **不再弹窗，也不再把原文给用户** ✓ ⇒ ⇒ 原文只进控制台 ✓ ⇒ ⇒ 用户看一句可行动的话 ✓。
      await reportFailure({category: 'export-failed', detail: String(err), cause: err});
    } finally {
      setIsExporting(false);
    }
  };

  return createPortal(
    <div
      data-export-overlay
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 no-print animate-in fade-in duration-200"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-owns={messageRegionId}
        aria-labelledby="export-dialog-title"
        className="w-full max-w-2xl max-h-[90dvh] rounded-xl bg-neutral-900 border border-neutral-700/80 shadow-2xl text-neutral-100 overflow-hidden flex flex-col"
      >
        <label className="m-4 flex gap-2 text-xs">
          <input
            type="checkbox"
            disabled={isExporting}
            checked={allowRemoteAssets}
            onChange={(e) => setAllowRemoteAssets(e.target.checked)}
          />
          允许联网收集文档外部图片（受 CORS 限制）
        </label>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-950/40">
          <div className="flex items-center justify-end gap-2.5">
            <div className="p-1.5 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h2 id="export-dialog-title" className="text-base font-semibold text-neutral-100">
                导出与发布文档
              </h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                {isExporting && service.sourceLabel
                  ? (reviewing ? '等待确认：' : '正在导出：') + service.sourceLabel
                  : '基于冻结修订快照 (Rev ' + doc.revision + ') 输出自包含成品'}
              </p>
            </div>
          </div>
          <button
            onClick={() => closeRef.current()}
            aria-label="关闭导出窗口"
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto min-h-0">
          {selectedFormat === 'docx' && docxIssues.length > 0 && (
            <section
              className="text-xs text-amber-200 space-y-3"
              aria-label="DOCX 兼容性提示"
              aria-live="polite"
            >
              <ul className="space-y-1">
                {docxGroups.map((group, index) => (
                  <li key={index}>
                    {group.adaptation === 'unsupported' ? '不支持：' : ''}
                    {group.summary}
                  </li>
                ))}
              </ul>
              {docxBlocked && (
                <p role="alert">存在不支持的内容，请修改后再导出；勾选降级确认不会绕过此限制。</p>
              )}
              <details>
                <summary className="cursor-pointer underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-teal-400">
                  查看兼容性详情（{docxIssues.length}项）
                </summary>
                <ul className="mt-3 space-y-1 wrap-anywhere">
                  {docxIssues.map((issue, index) => (
                    <li key={index}>
                      {issue.nodeId}：{issue.message}
                      {issue.detail && <span className="ml-1 opacity-70">（{issue.detail}）</span>}
                    </li>
                  ))}
                </ul>
              </details>
              {reviewing && !docxBlocked && (
                <label className="flex items-start gap-2">
                  <input
                    id="export-docx-consent"
                    type="checkbox"
                    className="mt-0.5 shrink-0"
                    checked={allowSourceFallback}
                    onChange={(event) => setAllowSourceFallback(event.target.checked)}
                  />
                  接受图片静态化及语义重排
                </label>
              )}
            </section>
          )}
          {/* File Name */}
          <div>
            <label
              htmlFor="export-file-name"
              className="block text-xs font-medium text-neutral-300 mb-1.5"
            >
              导出文件主名称
            </label>
            <input
              id="export-file-name"
              aria-describedby="export-suggested-name"
              disabled={isExporting}
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-700/80 text-sm text-neutral-100 focus:outline-none focus:border-teal-500 transition-colors"
              placeholder="输入文件名..."
            />
            <p id="export-suggested-name" className="mt-1.5 text-xs text-neutral-400 wrap-anywhere">
              建议文件名：{exportFile(fileName, selectedFormat).name}
            </p>
          </div>

          {/* Format Selection Grid */}
          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-2">
              选择导出目标格式
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {/* 可编辑 HTML */}
              <button
                type="button"
                disabled={isExporting}
                onClick={() => setSelectedFormat('editable-html')}
                aria-pressed={selectedFormat === 'editable-html'}
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
                    <span className="text-[0.625rem] px-1.5 py-0.2 rounded bg-teal-900/60 text-teal-300 font-mono">
                      推荐
                    </span>
                  </div>
                  <p className="text-[0.6875rem] text-neutral-400 mt-1 leading-normal">
                    独立自包含排版网页，同时内嵌 Base64
                    权威源载荷。双击可阅读，通过工作区导入可恢复原始 Markdown 与受支持元数据。
                  </p>
                </div>
              </button>

              {/* 打印 PDF */}
              <button
                type="button"
                disabled={isExporting}
                onClick={() => setSelectedFormat('print-pdf')}
                aria-pressed={selectedFormat === 'print-pdf'}
                className={`p-3 rounded-lg border text-left transition-all flex items-start gap-3 ${
                  selectedFormat === 'print-pdf'
                    ? 'bg-neutral-800 border-teal-500 ring-1 ring-teal-500/30'
                    : 'bg-neutral-950/50 border-neutral-800 hover:border-neutral-700'
                }`}
              >
                <div className="p-2 rounded bg-sky-500/10 text-sky-400 shrink-0 mt-0.5">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-medium text-xs text-neutral-100">
                    PDF 文档（{doc.theme.paperSize}）
                  </div>
                  <p className="text-[0.6875rem] text-neutral-400 mt-1 leading-normal">
                    使用 {doc.theme.paperSize}{' '}
                    排版，保留可选取、可检索的正文。文件名由系统保存窗口最终确定。
                  </p>
                </div>
              </button>

              {/* 原生 DOCX */}
              <button
                type="button"
                disabled={isExporting}
                onClick={() => setSelectedFormat('docx')}
                aria-pressed={selectedFormat === 'docx'}
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
                  <p className="text-[0.6875rem] text-neutral-400 mt-1 leading-normal">
                    利用 docx 引擎生成真正 OpenXML
                    格式，原生标题、段落、列表与表格映射为原生对象；公式在结构可表达时输出为 Word
                    原生公式；Word/WPS 的显示效果需另行验证。
                  </p>
                </div>
              </button>

              {/* 纯净静态 HTML */}
              <button
                type="button"
                disabled={isExporting}
                onClick={() => setSelectedFormat('reading-html')}
                aria-pressed={selectedFormat === 'reading-html'}
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
                  <p className="text-[0.6875rem] text-neutral-400 mt-1 leading-normal">
                    不携带任何源数据，体积轻便紧凑，适合公开发布或交付第三方直接阅读。
                  </p>
                </div>
              </button>
            </div>
          </div>

          <button
            type="button"
            disabled={isExporting}
            onClick={() => setSelectedFormat('markdown-bundle')}
            aria-pressed={selectedFormat === 'markdown-bundle'}
            className={`w-full rounded-lg border p-3 text-left text-xs hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-teal-400 ${selectedFormat === 'markdown-bundle' ? 'border-teal-500 bg-teal-950/40' : 'border-neutral-700'}`}
          >
            <span className="font-medium">Markdown 资源包 (.zip)</span>
            <span className="mt-1 block text-neutral-400">
              包含源文、已收集图片及资源清单，受支持的图片引用改为包内相对路径。
            </span>
          </button>

          {/* Capabilities Diagnostics Box */}
          <div className="p-3 rounded-lg bg-neutral-950/60 border border-neutral-800 text-xs">
            <div className="flex items-center gap-2 font-medium text-neutral-300 mb-1">
              <AlertTriangle className="w-3.5 h-3.5 text-teal-400" />
              <span>当前格式排版特性与能力矩阵诊断</span>
            </div>
            <div className="text-[0.6875rem] text-neutral-400 space-y-0.5">
              {selectedFormat === 'markdown' && (
                <div>• 仅导出源文；图片等资源可选择 Markdown 资源包。</div>
              )}
              {selectedFormat === 'markdown-bundle' && (
                <div>• 收集的图片随包保存；未识别的外部引用需自行检查。</div>
              )}
              {selectedFormat === 'editable-html' && (
                <div>
                  • 公式采用 <strong>{mathMode.toUpperCase()}</strong> 渲染；源载荷支持再次导入
                  MarkFlow 无损重构。
                </div>
              )}
              {selectedFormat === 'print-pdf' && (
                <div>• 按文档页面配置导出，工作台预览可保持关闭。</div>
              )}
              {selectedFormat === 'docx' && (
                <div>
                  • 段落与表格映射为 Word
                  原生对象；公式在结构有原生等价形式时输出为可编辑公式，否则转为图片并附源式；图表以图片输出，原始HTML按语义重排；导出前统一检查并确认。
                </div>
              )}
              {selectedFormat === 'reading-html' && (
                <div>• 页面内嵌自包含 CSS 与公式渲染，接收方无需安装任何插件或字体库即可阅读。</div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-6 py-4 border-t border-neutral-800 bg-neutral-950/40">
          <button
            type="button"
            disabled={isExporting}
            onClick={() => setSelectedFormat('markdown')}
            aria-pressed={selectedFormat === 'markdown'}
            className="text-xs text-neutral-400 hover:text-neutral-200 underline transition-colors"
          >
            原始 Markdown (.md)
          </button>
          <div className="flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => closeRef.current()}
              className="shrink-0 whitespace-nowrap px-4 py-2 rounded-lg text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition-colors"
            >
              关闭
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={
                reviewing
                  ? docxBlocked || !allowSourceFallback
                  : isExporting || (selectedFormat === 'docx' && docxBlocked)
              }
              className="flex items-center whitespace-nowrap gap-1.5 px-5 py-2 rounded-lg text-xs font-medium bg-teal-600 hover:bg-teal-500 text-white transition-colors disabled:opacity-50 shadow-md shadow-teal-950/30"
            >
              <Download className="w-4 h-4" />
              {reviewing ? '确认并导出' : isExporting ? '正在生成...' : '立即导出并保存'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    window.document.body,
  );
};
