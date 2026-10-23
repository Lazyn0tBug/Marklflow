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
}) => {
  const [widthMenuOpen, setWidthMenuOpen] = useState(false);
  const widthMenuRef = useRef<HTMLDivElement>(null);

  // 点击外部自动关闭宽度菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (widthMenuRef.current && !widthMenuRef.current.contains(event.target as Node)) {
        setWidthMenuOpen(false);
      }
    };
    if (widthMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [widthMenuOpen]);

  return (
    <header className="h-13 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between px-3 md:px-4 text-neutral-100 gap-3 select-none shrink-0 no-print z-40">
      {/* Zone 1: 侧栏侧边触发 + 品牌 & 当前文档 */}
      <div className="flex items-center gap-2.5 shrink-0">
        <button
          onClick={onToggleSidebar}
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

        <div className="hidden xl:flex items-center gap-1.5 pl-3 border-l border-neutral-800 text-xs text-neutral-400 max-w-xs truncate">
          <span className="truncate">{documentTitle || '未命名技术文档'}</span>
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
            onClick={onToggleEditor}
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
            onClick={onTogglePreview}
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

        {/* 视窗最大宽度配置下拉菜单 (默认 1024px) */}
        <div className="relative" ref={widthMenuRef}>
          <button
            onClick={() => setWidthMenuOpen((prev) => !prev)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-neutral-800 bg-neutral-950/80 hover:bg-neutral-800 text-xs text-neutral-300 transition-colors whitespace-nowrap cursor-pointer"
            title="配置编辑器与 HTML 视窗最大宽度（默认 1024px）"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-neutral-400" />
            <span>宽度: {maxWidth === 'full' ? '铺满' : `${maxWidth}px`}</span>
            <ChevronDown className="w-3 h-3 text-neutral-400" />
          </button>

          {widthMenuOpen && (
            <div className="absolute top-full mt-1.5 left-0 z-50 w-52 bg-neutral-900 border border-neutral-700/80 rounded-lg shadow-2xl py-1 text-xs select-none">
              <div className="px-3 py-1.5 text-[10px] uppercase font-mono text-neutral-400 border-b border-neutral-800">
                视窗内容最大宽度 (居中)
              </div>
              {WIDTH_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => {
                    onMaxWidthChange(opt.value);
                    setWidthMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 hover:bg-neutral-800 text-left transition-colors cursor-pointer ${
                    maxWidth === opt.value
                      ? 'text-teal-300 font-medium bg-neutral-800/60'
                      : 'text-neutral-300'
                  }`}
                >
                  <div className="flex flex-col">
                    <span className="font-mono text-xs">{opt.label}</span>
                    <span className="text-[10px] text-neutral-500">{opt.desc}</span>
                  </div>
                  {maxWidth === opt.value && <Check className="w-4 h-4 text-teal-400 shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </div>

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
