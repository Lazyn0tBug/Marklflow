import { webExportService } from '../../core/platform/web/exportService';
import type {ExportFormat} from '../../application/exports/exportService';
import { groupDocxIssues,type OutputIssue } from '../../core/export/outputCapabilities';
/**
 * MarkFlow (墨流) 导出控制中心
 * 依据设计方案第 8 章与 4.5.4 节实现
 * 覆盖：静态阅读 HTML、可编辑单文件 HTML (含源载荷)、浏览器打印 A4 PDF、原生 DOCX
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Download, FileCode, FileText, CheckCircle, AlertTriangle, Layers } from 'lucide-react';
import { DocumentRecord } from '../../core/model/document';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: DocumentRecord;
  mathMode: 'mathml' | 'svg';
}

export type {ExportFormat} from '../../application/exports/exportService';

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose, document: doc, mathMode }) => {
  const dialogRef=useRef<HTMLDivElement>(null),closeRef=useRef(onClose);
  const openRef=useRef(isOpen),reviewResolver=useRef<((accepted:boolean)=>void)|null>(null);openRef.current=isOpen;
  const [reviewing,setReviewing]=useState(false),[docxIssues,setDocxIssues]=useState<readonly OutputIssue[]>([]);
  const [exportStatus,setExportStatus]=useState<'completed'|'cancelled'|'blocked'|null>(null);
  const finishReview=(accepted:boolean)=>{const resolve=reviewResolver.current;reviewResolver.current=null;setReviewing(false);resolve?.(accepted)};
  closeRef.current=()=>{finishReview(false);onClose()};
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('editable-html');
  const [fileName, setFileName] = useState<string>(doc.meta.title || 'MarkFlow-Document');
  const [allowSourceFallback, setAllowSourceFallback] = useState(false);
  const [allowRemoteAssets, setAllowRemoteAssets] = useState(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  const docxGroups=useMemo(()=>groupDocxIssues(docxIssues),[docxIssues]);
  const docxBlocked=docxIssues.some(issue=>issue.adaptation==='unsupported');
  useEffect(()=>{if(!webExportService.busy){setAllowSourceFallback(false);setDocxIssues([]);setExportSuccess(null);setExportStatus(null)}},[doc.id,doc.markdown,selectedFormat]);
  useEffect(()=>{if(isOpen&&!webExportService.busy){setFileName(doc.meta.title||'MarkFlow-Document');setExportSuccess(null);setAllowSourceFallback(false);setAllowRemoteAssets(false);setDocxIssues([]);setExportStatus(null)}},[isOpen,doc.id]);
  useEffect(()=>{if(!isOpen&&reviewResolver.current)finishReview(false)},[isOpen]);
  useEffect(()=>{openRef.current=isOpen;return()=>{openRef.current=false;reviewResolver.current?.(false);reviewResolver.current=null}},[]);
  useEffect(()=>{if(reviewing)dialogRef.current?.querySelector<HTMLInputElement>('#export-docx-consent')?.focus()},[reviewing]);
  useEffect(()=>{
    if(!isOpen)return;
    const panel=dialogRef.current,previous=window.document.activeElement;
    if(!panel)return;
    panel.querySelector<HTMLInputElement>('#export-file-name')?.focus();
    const keydown=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeRef.current();return}
      if(event.key!=='Tab')return;
      const items=[...panel.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),summary,[tabindex="0"]')].filter(item=>item.getClientRects().length);
      const first=items[0],last=items.at(-1),active=window.document.activeElement;
      if(event.shiftKey&&(active===first||!panel.contains(active))){event.preventDefault();last?.focus()}
      else if(!event.shiftKey&&(active===last||!panel.contains(active))){event.preventDefault();first?.focus()}
    };
    window.document.addEventListener('keydown',keydown,true);
    return()=>{window.document.removeEventListener('keydown',keydown,true);if(previous instanceof HTMLElement&&previous.isConnected)previous.focus()};
  },[isOpen]);
  if (!isOpen) return null;

  const handleExport = async () => {
    if(reviewing){if(allowSourceFallback&&!docxBlocked)finishReview(true);return}
    if(webExportService.busy){setExportSuccess('正在导出，请稍候');return}
    setIsExporting(true);setExportSuccess(null);setExportStatus(null);setDocxIssues([]);
    try{
      const result=await webExportService.run({document:doc,format:selectedFormat,fileName,mathMode,allowRemoteAssets},{confirmDocx:(issues)=>{
        if(!openRef.current)return Promise.resolve(false);
        setDocxIssues(issues);setAllowSourceFallback(false);setReviewing(true);
        return new Promise<boolean>(resolve=>{reviewResolver.current=resolve});
      }});
      setExportSuccess(result.status==='busy'?'正在导出，请稍候':result.message);
      if(result.status!=='busy'){setExportStatus(result.status);if(result.issues)setDocxIssues(result.issues)}
    }catch(err){console.error('Export error:',err);alert('导出过程出错: '+String(err))}
    finally{setIsExporting(false)}
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 no-print animate-in fade-in duration-200">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="export-dialog-title" className="w-full max-w-2xl max-h-[90dvh] rounded-xl bg-neutral-900 border border-neutral-700/80 shadow-2xl text-neutral-100 overflow-hidden flex flex-col">

        <label className="m-4 flex gap-2 text-xs"><input type="checkbox" disabled={isExporting} checked={allowRemoteAssets} onChange={e=>setAllowRemoteAssets(e.target.checked)}/>允许联网收集文档外部图片（受 CORS 限制）</label>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-950/40">
          <div className="flex items-center justify-end gap-2.5">
            <div className="p-1.5 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h2 id="export-dialog-title" className="text-base font-semibold text-neutral-100">导出与发布文档</h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                {isExporting&&webExportService.sourceLabel?(reviewing?'等待确认：':'正在导出：')+webExportService.sourceLabel:'基于冻结修订快照 (Rev '+doc.revision+') 输出自包含成品'}
              </p>
            </div>
          </div>
          <button
            onClick={()=>closeRef.current()}
            aria-label="关闭导出窗口"
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto min-h-0">
          {selectedFormat==='docx'&&docxIssues.length>0&&<section className="text-xs text-amber-200 space-y-3" aria-label="DOCX 兼容性提示" aria-live="polite">
            <ul className="space-y-1">{docxGroups.map((group,index)=><li key={index}>{group.adaptation==='unsupported'?'不支持：':''}{group.summary}</li>)}</ul>
            {docxBlocked&&<p role="alert">存在不支持的内容，请修改后再导出；勾选降级确认不会绕过此限制。</p>}
            <details><summary className="cursor-pointer underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-teal-400">查看兼容性详情（{docxIssues.length}项）</summary><ul className="mt-3 space-y-1 wrap-anywhere">{docxIssues.map((issue,index)=><li key={index}>{issue.nodeId}：{issue.message}</li>)}</ul></details>
            {reviewing&&!docxBlocked&&<label className="flex items-start gap-2"><input id="export-docx-consent" type="checkbox" className="mt-0.5 shrink-0" checked={allowSourceFallback} onChange={event=>setAllowSourceFallback(event.target.checked)}/>接受图片静态化及语义重排</label>}
          </section>}
          {/* File Name */}
          <div>
            <label htmlFor="export-file-name" className="block text-xs font-medium text-neutral-300 mb-1.5">导出文件主名称</label>
            <input
              id="export-file-name"
              disabled={isExporting}
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
                disabled={isExporting}
                onClick={() => setSelectedFormat('editable-html')}
                aria-pressed={selectedFormat==='editable-html'}
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
                disabled={isExporting}
                onClick={() => setSelectedFormat('print-pdf')}
                aria-pressed={selectedFormat==='print-pdf'}
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
                  <div className="font-medium text-xs text-neutral-100">PDF 文档（A4）</div>
                  <p className="text-[11px] text-neutral-400 mt-1 leading-normal">
                    使用 A4 排版，保留可选取、可检索的正文。
                  </p>
                </div>
              </button>

              {/* 原生 DOCX */}
              <button
                type="button"
                disabled={isExporting}
                onClick={() => setSelectedFormat('docx')}
                aria-pressed={selectedFormat==='docx'}
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
                disabled={isExporting}
                onClick={() => setSelectedFormat('reading-html')}
                aria-pressed={selectedFormat==='reading-html'}
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

          <button type="button" disabled={isExporting} onClick={()=>setSelectedFormat('markdown-bundle')} aria-pressed={selectedFormat==='markdown-bundle'} className={`w-full rounded-lg border p-3 text-left text-xs hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-teal-400 ${selectedFormat==='markdown-bundle'?'border-teal-500 bg-teal-950/40':'border-neutral-700'}`}>
            <span className="font-medium">Markdown 资源包 (.zip)</span><span className="mt-1 block text-neutral-400">包含源文、已收集图片及资源清单，受支持的图片引用改为包内相对路径。</span>
          </button>

          {/* Capabilities Diagnostics Box */}
          <div className="p-3 rounded-lg bg-neutral-950/60 border border-neutral-800 text-xs">
            <div className="flex items-center gap-2 font-medium text-neutral-300 mb-1">
              <AlertTriangle className="w-3.5 h-3.5 text-teal-400" />
              <span>当前格式排版特性与能力矩阵诊断</span>
            </div>
            <div className="text-[11px] text-neutral-400 space-y-0.5">
              {selectedFormat === 'markdown' && <div>• 仅导出源文；图片等资源可选择 Markdown 资源包。</div>}
              {selectedFormat === 'markdown-bundle' && <div>• 收集的图片随包保存；未识别的外部引用需自行检查。</div>}
              {selectedFormat === 'editable-html' && (
                <div>• 公式采用 <strong>{mathMode.toUpperCase()}</strong> 渲染；源载荷支持再次导入 MarkFlow 无损重构。</div>
              )}
              {selectedFormat === 'print-pdf' && (
                <div>• 按文档页面配置导出，工作台预览可保持关闭。</div>
              )}
              {selectedFormat === 'docx' && (
                <div>• 段落与表格映射为 Word 原生对象；公式和图表以图片输出，原始HTML按语义重排；导出前统一检查并确认；不能原生编辑公式或保留交互。</div>
              )}
              {selectedFormat === 'reading-html' && (
                <div>• 页面内嵌自包含 CSS 与公式渲染，接收方无需安装任何插件或字体库即可阅读。</div>
              )}
            </div>
          </div>

          {exportSuccess && (
            <div role="status" className={`p-2.5 rounded-lg border text-xs flex items-center gap-2 ${exportStatus==='completed'?'bg-teal-950/50 border-teal-800/80 text-teal-300':'bg-neutral-950 border-neutral-700 text-neutral-300'}`}>
              {exportStatus==='completed'?<CheckCircle className="w-4 h-4 text-teal-400 shrink-0" />:<AlertTriangle className="w-4 h-4 shrink-0" />}
              <span>{exportSuccess}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-6 py-4 border-t border-neutral-800 bg-neutral-950/40">
          <button
            type="button"
            disabled={isExporting}
                onClick={() => setSelectedFormat('markdown')}
            aria-pressed={selectedFormat==='markdown'}
            className="text-xs text-neutral-400 hover:text-neutral-200 underline transition-colors"
          >
            原始 Markdown (.md)
          </button>
          <div className="flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={()=>closeRef.current()}
              className="shrink-0 whitespace-nowrap px-4 py-2 rounded-lg text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition-colors"
            >
              关闭
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={reviewing?(docxBlocked||!allowSourceFallback):isExporting||selectedFormat==='docx'&&docxBlocked}
              className="flex items-center whitespace-nowrap gap-1.5 px-5 py-2 rounded-lg text-xs font-medium bg-teal-600 hover:bg-teal-500 text-white transition-colors disabled:opacity-50 shadow-md shadow-teal-950/30"
            >
              <Download className="w-4 h-4" />
              {reviewing?'确认并导出':isExporting?'正在生成...':'立即导出并保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
