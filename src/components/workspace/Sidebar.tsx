/**
 * MarkFlow (墨流) 左栏工作区与大纲组件
 * 对应设计方案第 4.5.2 节：多文档列表、批量导入、可编辑 HTML 还原与实时大纲树
 */

import React, {useState, useRef, useEffect, useMemo, useReducer} from 'react';
import {
  FileText,
  ListTree,
  FolderOpen,
  Plus,
  SquarePlus,
  SquareMinus,
  Upload,
  Trash2,
  ChevronLeft,
  ChevronsUpDown,
  FileCode,
  Search,
  PanelLeftClose,
} from 'lucide-react';
import {DocumentRecord} from '../../core/model/document';
import {extractOutline} from '../../core/parse/markdown';
import {
  outlineReducer,
  outlineView,
  type OutlineState,
  type OutlineView,
} from '../../application/workspace/outlineState';
import {measureOpticalShift} from '../../core/platform/web/textMetrics';

interface SidebarProps {
  documents: DocumentRecord[];
  currentDocId: string;
  onSelectDoc: (id: string) => void;
  onCreateDoc: () => void;
  onDeleteDoc: (id: string) => void;
  onImportFiles: (files: File[]) => void;
  /** 桌面端的"打开"入口 ✓（§8.1 ✓）⇒ ⇒ Web 端没有这个入口 ✓ ⇒ ⇒ 不给就不渲染 ✓。 */
  onOpenNative?: () => void;
  importBusy: boolean;
  onScrollToHeading: (headingId: string, line: number) => void;
  currentMarkdown: string;
  activeHeadingId?: string | null;
  onToggleCollapse?: () => void;
}

interface OutlinePanelProps {
  view: OutlineView;
  filter: string;
  onFilter: (value: string) => void;
  onToggle: (key: string) => void;
  onToggleAll: () => void;
  onJump: (itemId: string, line: number) => void;
  activeHeadingId: string | null | undefined;
  activeItemRef: React.RefObject<HTMLButtonElement | null>;
  entryItemRef: React.RefObject<HTMLButtonElement | null>;
  panelRef: React.RefObject<HTMLDivElement | null>;
  textRef: React.RefObject<HTMLSpanElement | null>;
  setSlot: (element: HTMLElement | null) => void;
}

/**
 * 大纲树的渲染。只画视图给的行，不判断折叠、搜索与高亮。
 */
const OutlinePanel: React.FC<OutlinePanelProps> = ({
  view,
  filter,
  onFilter,
  onToggle,
  onToggleAll,
  onJump,
  activeHeadingId,
  activeItemRef,
  entryItemRef,
  panelRef,
  textRef,
  setSlot,
}) => (
  <div ref={panelRef} className="space-y-2 text-xs">
    {/* Outline Search */}
    <div className="relative mb-2 flex items-center gap-1">
      <div className="relative flex-1">
        <Search className="w-3.5 h-3.5 absolute left-2 top-2 text-neutral-500" />
        <input
          type="text"
          value={filter}
          onChange={(e) => onFilter(e.target.value)}
          placeholder="搜索标题大纲..."
          className="w-full pl-7 pr-2 py-1 rounded bg-neutral-950/80 border border-neutral-800 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-teal-500"
        />
      </div>
      <button
        onClick={onToggleAll}
        title={view.allExpanded ? '折叠全部大纲' : '展开全部大纲'}
        aria-label={view.allExpanded ? '折叠全部大纲' : '展开全部大纲'}
        className="shrink-0 p-1 rounded text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
      >
        <ChevronsUpDown className="w-3.5 h-3.5" />
      </button>
    </div>

    {view.rows.length > 0 ? (
      <div className="space-y-1">
        {view.rows.map((row, index) => {
          const {item, foldable, collapsed: isCollapsed, marked} = row;
          const indent = (item.level - 1) * 10;
          const isActive = item.id === activeHeadingId;
          return (
            <div
              key={row.key}
              style={{paddingLeft: `${indent}px`}}
              className={`flex items-center rounded transition-colors ${
                isActive
                  ? 'bg-teal-950/80 border border-teal-500/60 shadow-sm ring-1 ring-teal-500/30'
                  : 'border border-transparent hover:bg-neutral-800/60'
              }`}
            >
              {foldable ? (
                <button
                  ref={index === 0 ? setSlot : undefined}
                  onClick={() => onToggle(row.key)}
                  aria-expanded={!isCollapsed}
                  data-contains-active={marked ? 'true' : undefined}
                  aria-label={`${isCollapsed ? '展开' : '折叠'} ${item.text}（第 ${item.line} 行）`}
                  title={`${isCollapsed ? '展开' : '折叠'}：${item.text}`}
                  className={`shrink-0 w-6 h-6 flex items-center justify-center rounded text-xs focus:outline-none focus-visible:ring-1 focus-visible:ring-teal-400 ${
                    marked ? 'text-teal-300' : 'text-neutral-500 hover:text-teal-300'
                  }`}
                >
                  {/* 图标比文字的光学对齐偏移，随字号走（见 index.css 的 --mf-icon-optical-offset）。 */}
                  {isCollapsed ? (
                    <SquarePlus
                      className="w-3.5 h-3.5"
                      style={{transform: 'translateY(var(--mf-icon-optical-offset))'}}
                    />
                  ) : (
                    <SquareMinus
                      className="w-3.5 h-3.5"
                      style={{transform: 'translateY(var(--mf-icon-optical-offset))'}}
                    />
                  )}
                </button>
              ) : (
                <span ref={index === 0 ? setSlot : undefined} className="shrink-0 w-6 h-6" />
              )}
              <button
                aria-current={isActive ? 'location' : undefined}
                ref={isActive ? activeItemRef : row.entry ? entryItemRef : null}
                onClick={() => onJump(item.id, item.line)}
                style={{paddingLeft: '8px'}}
                className={`flex-1 min-w-0 text-left py-1.5 pr-2 rounded text-xs truncate transition-all flex items-center gap-1.5 ${
                  isActive ? 'text-teal-200 font-semibold' : 'text-neutral-400 hover:text-teal-300'
                }`}
                title={`${item.text} (第 ${item.line} 行)`}
              >
                <span
                  ref={index === 0 ? textRef : null}
                  className={`truncate ${isActive ? 'text-teal-100 font-medium' : ''}`}
                >
                  {item.text}
                </span>
                {isActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0 ml-auto mr-1 shadow-[0_0_6px_rgba(45,212,191,0.8)] animate-pulse" />
                )}
              </button>
            </div>
          );
        })}
      </div>
    ) : (
      <div className="text-center py-8 text-neutral-500 text-xs">
        {view.empty === 'none' ? '当前文档暂无标题 (# 标题)' : '未找到匹配的标题'}
      </div>
    )}
  </div>
);

export const Sidebar: React.FC<SidebarProps> = ({
  documents,
  currentDocId,
  onSelectDoc,
  onCreateDoc,
  onDeleteDoc,
  onImportFiles,
  onOpenNative,
  importBusy,
  onScrollToHeading,
  currentMarkdown,
  activeHeadingId,
  onToggleCollapse,
}) => {
  const [activeTab, setActiveTab] = useState<'docs' | 'outline'>('docs');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeItemRef = useRef<HTMLButtonElement | null>(null);
  const entryItemRef = useRef<HTMLButtonElement | null>(null);
  const outlinePanelRef = useRef<HTMLDivElement | null>(null);
  const outlineTextRef = useRef<HTMLSpanElement | null>(null);
  const outlineSlotRef = useRef<HTMLElement | null>(null);
  const setOutlineSlot = React.useCallback((element: HTMLElement | null) => {
    outlineSlotRef.current = element;
  }, []);
  const listRef = useRef<HTMLDivElement>(null);

  const outline = useMemo(() => extractOutline(currentMarkdown), [currentMarkdown]);
  // 大纲的状态机：文档、标题、搜索词与显式覆盖都在这里（§3.2）。
  const [outlineState, dispatch] = useReducer(outlineReducer, undefined, (): OutlineState => ({
    docId: currentDocId,
    items: outline,
    filter: '',
    overrides: new Map(),
    duplicates: new Set(),
    previousDuplicates: new Set(),
  }));
  // 外部世界只有"我变了"这一件事：换文档或内容变化，都走同一条 sync。
  // 在渲染期派发，React 会立刻以新状态重渲染，不会有旧文档的标题闪一帧。
  if (outlineState.docId !== currentDocId || outlineState.items !== outline) {
    dispatch({type: 'sync', docId: currentDocId, items: outline});
  }
  const view = useMemo(
    () => outlineView(outlineState, currentDocId, activeHeadingId),
    [outlineState, currentDocId, activeHeadingId],
  );

  // 光学对齐：量出图标相对文字该上移多少，写进 CSS 变量。数值来自字体度量，
  // 不写死常数——换引擎、换字号、换字体都对。字体加载完要重量一次。
  const applyInkOffset = React.useCallback(() => {
    const text = outlineTextRef.current,
      slot = outlineSlotRef.current;
    if (!text || !slot) return;
    const shift = measureOpticalShift(text, slot);
    const value = `${Math.round(shift * 100) / 100}px`;
    if (document.documentElement.style.getPropertyValue('--mf-icon-optical-offset') !== value)
      document.documentElement.style.setProperty('--mf-icon-optical-offset', value);
  }, []);
  // 光学对齐的测量只依赖**字体度量**与**第一行标题的文本** ✓：
  // 跟着整份大纲走 ⇒ 每次击键都要重测一次（一次样式重算 + 一次 canvas 量测 +
  // 一次探针的强制布局 + 一次全局样式失效）✗，而结果并不会因此更准 ✓。
  const outlineSample = view.rows[0]?.item.text ?? '';
  React.useEffect(() => {
    // 大纲面板只在"大纲"页签渲染，页签没切过来时量不到元素。
    if (activeTab !== 'outline') return;
    applyInkOffset();
    void document.fonts?.ready.then(applyInkOffset);
  }, [activeTab, outlineSample, applyInkOffset]);

  // Only scroll the outline list; highlighting must never move the horizontal workbench.
  // 高亮可见就滚到高亮行；高亮被收起的分支挡住，就滚到那个分支的入口行（§6.1）。
  // 依赖带上入口行：手动收起或展开会换掉目标，位置必须跟着重算。
  const entranceKey = view.entrance;
  React.useEffect(() => {
    const item = activeItemRef.current ?? entryItemRef.current,
      list = listRef.current;
    if (!item || !list || item.closest('[inert]') || activeTab !== 'outline') return;
    const target = item.getBoundingClientRect(),
      viewport = list.getBoundingClientRect();
    if (target.top < viewport.top) list.scrollTop += target.top - viewport.top;
    else if (target.bottom > viewport.bottom) list.scrollTop += target.bottom - viewport.bottom;
  }, [activeHeadingId, activeTab, entranceKey]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length && !importBusy) onImportFiles(files);
  };

  return (
    <aside className="w-full h-full flex flex-col bg-neutral-900 border-r border-neutral-800 text-neutral-200 select-none no-print relative shrink-0">
      {/* 操作行：**在页签上方** ✓ ⇒ ⇒ 切换文档 / 大纲时位置稳定 ✓（设计 §3 ✓）。 */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-neutral-800 bg-neutral-950/60">
        <button
          disabled={importBusy}
          onClick={onCreateDoc}
          className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded bg-teal-600/90 hover:bg-teal-600 text-white text-xs font-medium transition-colors"
          title="创建新空白 Markdown 文档"
        >
          <Plus className="w-3.5 h-3.5" />
          新建文档
        </button>
        {/* 平台没有这个能力时不凭布局新增入口 ✓ ⇒ ⇒ Web 不渲染这一项 ✓（设计 §3 ✓）。 */}
        {onOpenNative && (
          <button
            disabled={importBusy}
            aria-busy={importBusy}
            onClick={onOpenNative}
            className="flex items-center justify-center gap-1 py-1.5 px-2 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium transition-colors"
            title="打开本地文件（系统选择器）"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            打开
          </button>
        )}
      </div>

      {/* Sidebar Tabs & Collapse Trigger */}
      <div className="flex items-center border-b border-neutral-800 bg-neutral-950/60 p-1.5 gap-1">
        <button
          onClick={() => setActiveTab('docs')}
          className={`flex-1 py-1.5 px-2 rounded-md text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
            activeTab === 'docs'
              ? 'bg-neutral-800 text-neutral-100 shadow-xs'
              : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/40'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          文档 ({documents.length})
        </button>
        <button
          onClick={() => setActiveTab('outline')}
          className={`flex-1 py-1.5 px-2 rounded-md text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
            activeTab === 'outline'
              ? 'bg-neutral-800 text-neutral-100 shadow-xs'
              : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/40'
          }`}
        >
          <ListTree className="w-3.5 h-3.5" />
          大纲 ({outline.length})
        </button>
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="p-1 rounded-md text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
            title="侧边点击收起 (隐藏大纲与工作区)"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Right border edge collapse handle */}
      {onToggleCollapse && (
        <button
          onClick={onToggleCollapse}
          className="absolute -right-3 top-1/2 -translate-y-1/2 w-3.5 h-10 bg-neutral-800 hover:bg-teal-700 text-neutral-400 hover:text-white border border-neutral-700/80 rounded-r flex items-center justify-center opacity-60 hover:opacity-100 transition-all z-20 shadow-md group cursor-pointer"
          title="点击侧边：收起侧边栏"
        >
          <ChevronLeft className="w-3 h-3 group-hover:scale-125 transition-transform" />
        </button>
      )}

      {/* Main Tab Content */}
      <div ref={listRef} className="flex-1 overflow-y-auto p-2">
        {activeTab === 'docs' ? (
          <div className="space-y-1">
            {/* 导入入口：**留在文档页签里** ✓ ⇒ ⇒ 不重排导入流程 ✓（设计 §3 ✓）。 */}
            <div className="flex items-center gap-1.5 mb-2 px-1">
              <button
                disabled={importBusy}
                aria-busy={importBusy}
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-1 py-1.5 px-2.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs transition-colors"
                title={
                  onOpenNative
                    ? '导入含自包含载荷的可编辑 .html'
                    : '打开本地文件（浏览器选择器）：载入工作区副本'
                }
              >
                <Upload className="w-3.5 h-3.5" />
                {importBusy ? '处理中…' : onOpenNative ? '导入' : '打开文件'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                disabled={importBusy}
                multiple
                accept={onOpenNative ? '.html,.htm' : '.md,.markdown,.txt,.html,.htm'}
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            {/* Document Items List */}
            {documents.map((doc) => {
              const isActive = doc.id === currentDocId;
              return (
                <div
                  key={doc.id}
                  onClick={() => onSelectDoc(doc.id)}
                  className={`group relative flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                    isActive
                      ? 'bg-teal-950/60 text-teal-200 border border-teal-700/60'
                      : 'hover:bg-neutral-800/60 text-neutral-300 border border-transparent'
                  }`}
                >
                  <div className="flex items-start gap-2 overflow-hidden pr-6">
                    <FileCode
                      className={`w-4 h-4 shrink-0 mt-0.5 ${
                        isActive ? 'text-teal-400' : 'text-neutral-500 group-hover:text-neutral-400'
                      }`}
                    />
                    <div className="overflow-hidden">
                      <div className="text-xs font-medium truncate leading-tight">
                        {doc.meta.title || '未命名文档'}
                      </div>
                      <div className="text-[10px] text-neutral-500 font-mono mt-0.5">
                        {new Date(doc.meta.updatedAt).toLocaleTimeString('zh-CN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        · Rev {doc.revision}
                      </div>
                    </div>
                  </div>

                  {documents.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        // **确认在应用层的对话框里问** ✓ ⇒ ⇒ 不靠宿主的 confirm ✓。
                        onDeleteDoc(doc.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-neutral-500 hover:text-red-400 rounded transition-all"
                      title="删除文档"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* Outline Tab */
          <OutlinePanel
            view={view}
            filter={outlineState.filter}
            onFilter={(value) => dispatch({type: 'filter', value})}
            onToggle={(key) => dispatch({type: 'toggle', key})}
            onToggleAll={() => dispatch({type: 'toggle-all'})}
            onJump={(itemId, line) => {
              // 主动跳转才展开路径；滚动引起的高亮变化不展开。
              dispatch({type: 'jump', itemId});
              onScrollToHeading(itemId, line);
            }}
            activeHeadingId={activeHeadingId}
            activeItemRef={activeItemRef}
            entryItemRef={entryItemRef}
            panelRef={outlinePanelRef}
            textRef={outlineTextRef}
            setSlot={setOutlineSlot}
          />
        )}
      </div>

      {/* Footer System Info */}
      <div className="p-2.5 border-t border-neutral-800 bg-neutral-950/40 text-[11px] text-neutral-500 flex items-center justify-between">
        <span className="font-mono">MarkFlow Storage</span>
        <span className="text-teal-400">IndexedDB 本地</span>
      </div>
    </aside>
  );
};
