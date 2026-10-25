/**
 * MarkFlow (墨流) 顶栏组件
 * 对应设计方案：
 * 1. 侧边栏（文档与大纲）通过侧边点击/按钮控制显隐
 * 2. 编辑器与 HTML 渲染视窗通过标准开关独立控制
 * 3. 视窗最大宽度（默认 1024px）支持灵活配置
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  FileDown,
  BookOpen,
  FileCheck,
  Edit3,
  Moon,
  Sun,
  ShieldCheck,
  Save,
  Sigma,
  PanelLeftClose,
  PanelLeftOpen,
  SlidersHorizontal,
  ChevronDown,
  Check,
} from 'lucide-react';

export type ViewMode = 'split' | 'edit' | 'reading' | 'a4';

export interface TopBarProps {
  // 侧边栏/大纲独立控制
  sidebarOpen: boolean;
  onToggleSidebar: () => void;

  // 编辑器与 HTML 视窗开关控制
  showEditor: boolean;
  showPreview: boolean;
  onToggleEditor: () => void;
  onTogglePreview: () => void;
  previewMode: 'flow' | 'a4';
  onPreviewModeChange: (mode: 'flow' | 'a4') => void;

  // 最大宽度配置 (默认 1024)
  maxWidth: number | 'full';
  onMaxWidthChange: (width: number | 'full') => void;

  mathMode: 'mathml' | 'svg';
  onMathModeToggle: () => void;
  isDark: boolean;
  onThemeToggle: () => void;
  isDirty: boolean;
  onSave: () => void;
  onOpenExport: () => void;
  onOpenRoadmap: () => void;
  documentTitle: string;
  filePath?: string | undefined;
}

const WIDTH_OPTIONS: { label: string; value: number | 'full'; desc: string }[] = [
  { label: '800px', value: 800, desc: '紧凑聚焦排版' },
  { label: '1024px', value: 1024, desc: '标准默认 (黄金阅读宽度)' },
  { label: '1280px', value: 1280, desc: '宽屏排版' },
  { label: '1440px', value: 1440, desc: '超宽大屏' },
  { label: '100% 铺满', value: 'full', desc: '自适应全屏铺满' },
];

export const TopBar: React.FC<TopBarProps> = ({
  sidebarOpen,
  onToggleSidebar,
  showEditor,
  showPreview,
  onToggleEditor,
  onTogglePreview,
  previewMode,
  onPreviewModeChange,
  maxWidth,
  onMaxWidthChange,
  mathMode,
  onMathModeToggle,
  isDark,
  onThemeToggle,
  isDirty,
  onSave,
  onOpenExport,
  onOpenRoadmap,
  documentTitle,
  filePath,
}) => {
  const [widthMenuOpen, setWidthMenuOpen] = useState(false);
  const settingsRef=useRef<HTMLDialogElement>(null);
  const settingsButtonRef=useRef<HTMLButtonElement>(null);
  const visibleCount=Number(sidebarOpen)+Number(showEditor)+Number(showPreview);
  useEffect(()=>{const dialog=settingsRef.current;if(widthMenuOpen&&!dialog?.open)dialog?.showModal();else if(!widthMenuOpen&&dialog?.open)dialog.close()},[widthMenuOpen]);

  return (
    <header data-tauri-drag-region className="h-13 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between px-3 md:px-4 text-neutral-100 gap-3 select-none shrink-0 no-print z-40">
      {/* Zone 1: 侧栏侧边触发 + 品牌 & 当前文档 */}
      <div className="flex items-center gap-2.5 shrink-0">
        <button
          disabled={sidebarOpen&&visibleCount===1} aria-pressed={sidebarOpen} onClick={onToggleSidebar}
          className={`p-1.5 rounded-lg border transition-colors flex items-center justify-center ${
            sidebarOpen
              ? 'border-neutral-700 bg-neutral-800 text-teal-300'
              : 'border-neutral-800 bg-neutral-950/70 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
          }`}
          title={sidebarOpen ? '收起侧边文档与大纲 (侧边点击)' : '展开侧边文档与大纲 (侧边点击)'}
        >
          {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
        </button>

        <a href="/" className="flex items-center gap-2 group">
          <div className="w-7 h-7 rounded-lg bg-teal-600 flex items-center justify-center text-white font-bold text-sm shadow-md shadow-teal-900/40">
            墨
          </div>
          <span className="text-sm font-bold tracking-tight text-neutral-100 whitespace-nowrap hidden sm:inline">
            MarkFlow <span className="text-teal-400 font-normal">墨流</span>
          </span>
        </a>

        <div
          className="hidden xl:flex items-center gap-1.5 pl-3 border-l border-neutral-800 text-xs text-neutral-400 max-w-xs truncate"
          title={filePath ? `本地文件：${filePath}` : undefined}
        >
          <span className="truncate">{documentTitle || '未命名技术文档'}</span>
          {filePath && (
            <span className="shrink-0 px-1 py-0.2 rounded bg-neutral-800 text-teal-400 text-[10px] font-mono border border-teal-900/40">
              本地
            </span>
          )}
          {isDirty && (
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title="有未写入草稿修改" />
          )}
        </div>
      </div>

      {/* Zone 2: 内容视图开关（编辑器 / HTML）、宽度配置、公式与审查看板 */}
      <div className="flex items-center gap-2 overflow-x-auto py-1">
        {/* 内容视图开关组 */}
        <div className="flex items-center p-0.5 rounded-lg bg-neutral-950 border border-neutral-800 text-xs font-medium">
          {/* 编辑器开关 */}
          <button
            disabled={showEditor&&visibleCount===1} aria-pressed={showEditor} onClick={onToggleEditor}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all whitespace-nowrap ${
              showEditor
                ? 'bg-neutral-800 text-teal-300 shadow-xs'
                : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900/50'
            }`}
            title={showEditor ? '点击隐藏编辑器' : '点击开启编辑器'}
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>编辑器</span>
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                showEditor ? 'bg-teal-400 shadow-xs shadow-teal-400/50' : 'bg-neutral-700'
              }`}
            />
          </button>

          {/* HTML 预览开关 */}
          <button
            disabled={showPreview&&visibleCount===1} aria-pressed={showPreview} onClick={onTogglePreview}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all whitespace-nowrap ${
              showPreview
                ? 'bg-neutral-800 text-teal-300 shadow-xs'
                : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900/50'
            }`}
            title={showPreview ? '点击隐藏 HTML 预览' : '点击开启 HTML 预览'}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>HTML 预览</span>
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                showPreview ? 'bg-teal-400 shadow-xs shadow-teal-400/50' : 'bg-neutral-700'
              }`}
            />
          </button>
        </div>

        {/* HTML 预览子形态：流式 vs A4 分页 (当 HTML 开启时显示) */}
        {showPreview && (
          <div className="flex items-center p-0.5 rounded-lg bg-neutral-950/80 border border-neutral-800 text-xs">
            <button
              onClick={() => onPreviewModeChange('flow')}
              className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                previewMode === 'flow'
                  ? 'bg-neutral-800 text-neutral-100 font-medium'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
              title="流式排版舒适阅读"
            >
              流式
            </button>
            <button
              onClick={() => onPreviewModeChange('a4')}
              className={`px-2 py-0.5 rounded text-[11px] transition-colors flex items-center gap-1 ${
                previewMode === 'a4'
                  ? 'bg-neutral-800 text-teal-300 font-medium'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
              title="A4 纸张物理规格分页仿真"
            >
              <FileCheck className="w-3 h-3" />
              A4 分页
            </button>
          </div>
        )}

        <button ref={settingsButtonRef} type="button" onClick={()=>setWidthMenuOpen(true)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-neutral-800 bg-neutral-950 text-xs text-neutral-300 whitespace-nowrap" aria-haspopup="dialog">
          <SlidersHorizontal className="w-3.5 h-3.5"/>设置
        </button>
        <dialog
          ref={settingsRef}
          aria-labelledby="settings-title"
          onClick={(e) => {
            if (e.target === settingsRef.current) setWidthMenuOpen(false);
          }}
          onClose={()=>{setWidthMenuOpen(false);settingsButtonRef.current?.focus()}}
          className="m-auto w-80 max-w-[calc(100vw-32px)] rounded-xl border border-neutral-700 bg-neutral-900 p-5 text-neutral-100 backdrop:bg-black/60 shadow-2xl"
        >
          <h2 id="settings-title" className="text-base font-semibold mb-4">工作台设置</h2>
          <label htmlFor="content-width" className="block text-sm mb-2">编辑器与 HTML 内容最大宽度</label>
          <select id="content-width" value={maxWidth} onChange={e=>onMaxWidthChange(e.target.value==='full'?'full':Number(e.target.value))} className="w-full rounded border border-neutral-600 bg-neutral-950 p-2 text-sm">
            {WIDTH_OPTIONS.map(opt=><option key={opt.label} value={opt.value}>{opt.label}</option>)}
          </select>
          <p className="text-xs text-neutral-400 mt-2">默认 1024px。仅影响工作台，不改变导出纸张。</p>
          <button type="button" onClick={()=>setWidthMenuOpen(false)} className="mt-5 rounded bg-teal-600 hover:bg-teal-500 text-white font-medium px-4 py-2 text-xs transition-colors cursor-pointer">完成</button>
        </dialog>

        {/* 公式引擎切换 (MathML vs SVG) */}
        <button
          onClick={onMathModeToggle}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-neutral-800 bg-neutral-950/80 hover:bg-neutral-800 text-xs font-mono text-neutral-300 transition-colors whitespace-nowrap"
          title={`当前公式输出模式: ${mathMode.toUpperCase()}。点击快速在原生 MathML 与 SVG 间切换。`}
        >
          <Sigma className="w-3.5 h-3.5 text-teal-400" />
          <span>{mathMode === 'mathml' ? 'MathML' : 'SVG'}</span>
        </button>

        {/* 1.0 准入审查看板 */}
        <button
          onClick={onOpenRoadmap}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-teal-800/60 bg-teal-950/30 hover:bg-teal-900/50 text-teal-300 text-xs font-medium transition-colors whitespace-nowrap"
          title="查看 0.1 至 0.9 版本实施记录与 1.0 准入审查看板"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
          <span className="hidden sm:inline">1.0 看板</span>
        </button>
      </div>

      {/* Zone 3: 主操作动作 (主题、保存、导出) */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onThemeToggle}
          className="p-1.5 rounded-lg border border-neutral-800 bg-neutral-950/70 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 transition-colors"
          title={isDark ? '切换浅色模式' : '切换深色模式'}
        >
          {isDark ? <Sun className="w-4 h-4 text-amber-300" /> : <Moon className="w-4 h-4" />}
        </button>

        <button
          onClick={onSave}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-700/80 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer"
          title="保存当前修改到本地 IndexedDB"
        >
          <Save className="w-3.5 h-3.5" />
          <span>保存</span>
        </button>

        <button
          onClick={onOpenExport}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-medium shadow-md shadow-teal-950/40 transition-colors whitespace-nowrap cursor-pointer"
          title="导出单文件 HTML、DOCX 或打印 PDF"
        >
          <FileDown className="w-4 h-4" />
          <span>导出</span>
        </button>
      </div>
    </header>
  );
};
