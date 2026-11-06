/**
 * MarkFlow (墨流) 左栏工作区与大纲组件
 * 对应设计方案第 4.5.2 节：多文档列表、批量导入、可编辑 HTML 还原与实时大纲树
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  FileText,
  ListTree,
  Plus,
  Upload,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronsUpDown,
  FileCode,
  Search,
  PanelLeftClose,
} from 'lucide-react';
import { DocumentRecord } from '../../core/model/document';
import { extractOutline, type HeadingItem } from '../../core/parse/markdown';
import {
  ancestorKeys,
  buildOutlineTree,
  collapsibleKeys,
  collapsedAncestors,
  duplicateHeadingTexts,
  effectiveCollapsed,
  outlineRows,
  pruneOverrides,
} from '../../core/parse/outlineTree';

interface SidebarProps {
  documents: DocumentRecord[];
  currentDocId: string;
  onSelectDoc: (id: string) => void;
  onCreateDoc: () => void;
  onDeleteDoc: (id: string) => void;
  onImportFiles: (files: File[]) => void;
  importBusy: boolean;
  onScrollToHeading: (headingId: string, line: number) => void;
  currentMarkdown: string;
  activeHeadingId?: string | null;
  onToggleCollapse?: () => void;
}

/** 深度 ≥ 3 的分支默认收起（根的深度是 0）。 */
const DEFAULT_COLLAPSED_DEPTH = 3;
const EMPTY_SET: ReadonlySet<string> = new Set();
const EMPTY_MAP: ReadonlyMap<string, boolean> = new Map();

interface OutlinePanelProps {
  items: readonly HeadingItem[];
  overrides: ReadonlyMap<string, boolean>;
  onOverrides: (update: (prev: ReadonlyMap<string, boolean>) => ReadonlyMap<string, boolean>) => void;
  filter: string;
  onFilterChange: (value: string) => void;
  activeHeadingId: string | null | undefined;
  onScrollToHeading: (headingId: string, line: number) => void;
  activeItemRef: React.RefObject<HTMLButtonElement | null>;
}

/**
 * 大纲树。折叠状态由外层按文档 ID 隔离：切换文档时清零，
 * 同一文档内的编辑按 §2.3 清理同名组的覆盖。
 */
const OutlinePanel: React.FC<OutlinePanelProps> = ({
  items,
  overrides,
  onOverrides,
  filter,
  onFilterChange,
  activeHeadingId,
  onScrollToHeading,
  activeItemRef,
}) => {
  const tree = useMemo(() => buildOutlineTree(items), [items]);

  const collapsed = useMemo(
    () => effectiveCollapsed(tree, overrides, DEFAULT_COLLAPSED_DEPTH),
    [tree, overrides]
  );
  const searching = filter.trim().length > 0;
  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return needle ? items.filter((item) => item.text.toLowerCase().includes(needle)) : items;
  }, [items, filter]);
  const displayTree = useMemo(
    () => (searching ? buildOutlineTree(visible) : tree),
    [searching, visible, tree]
  );
  const rows = useMemo(
    () => outlineRows(displayTree, searching ? EMPTY_SET : collapsed),
    [displayTree, collapsed, searching]
  );
  const marked = useMemo(
    () => collapsedAncestors(tree, activeHeadingId ?? null, collapsed),
    [tree, activeHeadingId, collapsed]
  );
  const collapsible = useMemo(() => collapsibleKeys(tree), [tree]);
  const allExpanded = collapsible.every((key) => !collapsed.has(key));

  const toggle = (key: string) =>
    onOverrides((prev) => {
      const next = new Map(prev);
      next.set(key, !collapsed.has(key));
      return next;
    });
  const toggleAll = () =>
    onOverrides((prev) => {
      const next = new Map(prev);
      for (const key of collapsible) next.set(key, allExpanded);
      return next;
    });
  // 主动跳转才展开路径；滚动引起的高亮变化不展开。
  const jump = (item: HeadingItem) => {
    const keys = ancestorKeys(tree, item.id);
    if (keys.length)
      onOverrides((prev) => {
        const next = new Map(prev);
        for (const key of keys) next.set(key, false);
        return next;
      });
    onScrollToHeading(item.id, item.line);
  };

  return (
    <div className="space-y-2">
      {/* Outline Search */}
      <div className="relative mb-2 flex items-center gap-1">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 absolute left-2 top-2 text-neutral-500" />
          <input
            type="text"
            value={filter}
            onChange={(e) => onFilterChange(e.target.value)}
            placeholder="搜索标题大纲..."
            className="w-full pl-7 pr-2 py-1 rounded bg-neutral-950/80 border border-neutral-800 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-teal-500"
          />
        </div>
        <button
          onClick={toggleAll}
          title={allExpanded ? '折叠全部大纲' : '展开全部大纲'}
          aria-label={allExpanded ? '折叠全部大纲' : '展开全部大纲'}
          className="shrink-0 p-1 rounded text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
        >
          <ChevronsUpDown className="w-3.5 h-3.5" />
        </button>
      </div>

      {rows.length > 0 ? (
        <div className="space-y-1">
          {rows.map((row) => {
            const { item, hasChildren, collapsed: isCollapsed } = row;
            const indent = (item.level - 1) * 10;
            const isActive = item.id === activeHeadingId;
            return (
              <div
                key={row.key}
                className={`flex items-center rounded transition-colors ${
                  isActive
                    ? 'bg-teal-950/80 border border-teal-500/60 shadow-sm ring-1 ring-teal-500/30'
                    : 'border border-transparent hover:bg-neutral-800/60'
                }`}
              >
                {hasChildren && !searching ? (
                  <button
                    onClick={() => toggle(row.key)}
                    aria-expanded={!isCollapsed}
                    data-contains-active={marked.has(row.key) ? 'true' : undefined}
                    aria-label={`${isCollapsed ? '展开' : '折叠'} ${item.text}（第 ${item.line} 行）`}
                    title={`${isCollapsed ? '展开' : '折叠'}：${item.text}`}
                    className={`shrink-0 w-6 h-6 flex items-center justify-center rounded focus:outline-none focus-visible:ring-1 focus-visible:ring-teal-400 ${
                      marked.has(row.key)
                        ? 'text-teal-300'
                        : 'text-neutral-500 hover:text-teal-300'
                    }`}
                  >
                    {isCollapsed ? (
                      <ChevronRight className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>
                ) : (
                  <span className="shrink-0 w-6 h-6" />
                )}
                <button
                  aria-current={isActive ? 'location' : undefined}
                  ref={isActive ? activeItemRef : null}
                  onClick={() => jump(item)}
                  style={{ paddingLeft: `${indent + 8}px` }}
                  className={`flex-1 min-w-0 text-left py-1.5 pr-2 rounded text-xs truncate transition-all flex items-center gap-1.5 ${
                    isActive
                      ? 'text-teal-200 font-semibold'
                      : 'text-neutral-400 hover:text-teal-300'
                  }`}
                  title={`${item.text} (第 ${item.line} 行)`}
                >
                  <span
                    className={`text-[10px] font-mono shrink-0 px-1 py-0.5 rounded leading-none ${
                      isActive
                        ? 'bg-teal-500/30 text-teal-300 font-bold'
                        : 'bg-neutral-800 text-neutral-500'
                    }`}
                  >
                    H{item.level}
                  </span>
                  <span className={`truncate ${isActive ? 'text-teal-100 font-medium' : ''}`}>
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
          {items.length === 0 ? '当前文档暂无标题 (# 标题)' : '未找到匹配的标题'}
        </div>
      )}
    </div>
  );
};

export const Sidebar: React.FC<SidebarProps> = ({
  documents,
  currentDocId,
  onSelectDoc,
  onCreateDoc,
  onDeleteDoc,
  onImportFiles,
  importBusy,
  onScrollToHeading,
  currentMarkdown,
  activeHeadingId,
  onToggleCollapse,
}) => {
  const [activeTab, setActiveTab] = useState<'docs' | 'outline'>('docs');
  const [outlineFilter, setOutlineFilter] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeItemRef = useRef<HTMLButtonElement | null>(null);
  const listRef=useRef<HTMLDivElement>(null);

  const outline = useMemo(() => extractOutline(currentMarkdown), [currentMarkdown]);
  const duplicates = useMemo(() => duplicateHeadingTexts(outline), [outline]);
  // 折叠状态只属于当前激活文档：换了文档就是默认状态。
  const [fold, setFold] = useState<{ docId: string; overrides: ReadonlyMap<string, boolean> }>({
    docId: currentDocId,
    overrides: new Map(),
  });
  const overrides = fold.docId === currentDocId ? fold.overrides : EMPTY_MAP;
  const previousDuplicates = useRef<{ docId: string; duplicates: ReadonlySet<string> }>({
    docId: currentDocId,
    duplicates: EMPTY_SET,
  });

  // 换了文档就把覆盖清零（切回旧文档也从默认状态开始）；
  // 同一文档内修订变化时丢弃同名组的覆盖：同名组较早恢复默认，好过把覆盖转移到另一节。
  useEffect(() => {
    const previous =
      previousDuplicates.current.docId === currentDocId ? previousDuplicates.current.duplicates : EMPTY_SET;
    setFold((current) => {
      if (current.docId !== currentDocId) return { docId: currentDocId, overrides: new Map() };
      const pruned = pruneOverrides(current.overrides, duplicates, previous);
      return pruned === current.overrides ? current : { docId: currentDocId, overrides: pruned };
    });
    previousDuplicates.current = { docId: currentDocId, duplicates };
  }, [duplicates, currentDocId]);

  // 覆盖一律按当前状态改，不拿渲染时的快照去覆盖：两次操作落在同一批次时也不会互相吞掉。
  const updateOverrides = (
    update: (prev: ReadonlyMap<string, boolean>) => ReadonlyMap<string, boolean>
  ) =>
    setFold((current) => {
      const base = current.docId === currentDocId ? current.overrides : EMPTY_MAP;
      const next = update(base);
      return next === current.overrides && current.docId === currentDocId
        ? current
        : { docId: currentDocId, overrides: next };
    });

  // Only scroll the outline list; highlighting must never move the horizontal workbench.
  React.useEffect(()=>{
    const item=activeItemRef.current,list=listRef.current;
    if(!item||!list||item.closest('[inert]')||activeTab!=='outline')return;
    const target=item.getBoundingClientRect(),viewport=list.getBoundingClientRect();
    if(target.top<viewport.top)list.scrollTop+=target.top-viewport.top;
    else if(target.bottom>viewport.bottom)list.scrollTop+=target.bottom-viewport.bottom;
  },[activeHeadingId,activeTab]);

  const handleFileChange=(event:React.ChangeEvent<HTMLInputElement>)=>{
    const files=Array.from(event.target.files??[]);event.target.value='';
    if(files.length&&!importBusy)onImportFiles(files);
  };

  return (
    <aside className="w-full h-full flex flex-col bg-neutral-900 border-r border-neutral-800 text-neutral-200 select-none no-print relative shrink-0">
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
            {/* Action Bar */}
            <div className="flex items-center gap-1.5 mb-2 px-1">
              <button
                disabled={importBusy} onClick={onCreateDoc}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded bg-teal-600/90 hover:bg-teal-600 text-white text-xs font-medium transition-colors"
                title="创建新空白 Markdown 文档"
              >
                <Plus className="w-3.5 h-3.5" />
                新建文档
              </button>
              <button
                disabled={importBusy} aria-busy={importBusy} onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-1 py-1.5 px-2.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs transition-colors"
                title="导入 .md 文件或含有载荷的可编辑 .html"
              >
                <Upload className="w-3.5 h-3.5" />
                {importBusy?'导入中…':'导入'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                disabled={importBusy}
                multiple
                accept=".md,.markdown,.txt,.html,.htm"
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
                        })} · Rev {doc.revision}
                      </div>
                    </div>
                  </div>

                  {documents.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`确认删除文档 "${doc.meta.title}" 吗？此操作不可撤销。`)) {
                          onDeleteDoc(doc.id);
                        }
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
            items={outline}
            overrides={overrides}
            onOverrides={updateOverrides}
            filter={outlineFilter}
            onFilterChange={setOutlineFilter}
            activeHeadingId={activeHeadingId}
            onScrollToHeading={onScrollToHeading}
            activeItemRef={activeItemRef}
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
