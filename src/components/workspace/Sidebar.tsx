import { verifyAssets } from '../../core/export/documentAssets';
/**
 * MarkFlow (墨流) 左栏工作区与大纲组件
 * 对应设计方案第 4.5.2 节：多文档列表、批量导入、可编辑 HTML 还原与实时大纲树
 */

import React, { useState, useRef } from 'react';
import {
  FileText,
  ListTree,
  Plus,
  Upload,
  Trash2,
  ChevronLeft,
  FileCode,
  Search,
  PanelLeftClose,
} from 'lucide-react';
import { DocumentRecord } from '../../core/model/document';
import { extractOutline } from '../../core/parser/markdownParser';
import { extractPayloadFromHtml } from '../../core/storage/storage';

interface SidebarProps {
  documents: DocumentRecord[];
  currentDocId: string;
  onSelectDoc: (id: string) => void;
  onCreateDoc: () => void;
  onDeleteDoc: (id: string) => void;
  onImportDoc: (doc: DocumentRecord) => void;
  onScrollToHeading: (headingId: string, line: number) => void;
  currentMarkdown: string;
  activeHeadingId?: string | null;
  onToggleCollapse?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  documents,
  currentDocId,
  onSelectDoc,
  onCreateDoc,
  onDeleteDoc,
  onImportDoc,
  onScrollToHeading,
  currentMarkdown,
  activeHeadingId,
  onToggleCollapse,
}) => {
  const [activeTab, setActiveTab] = useState<'docs' | 'outline'>('docs');
  const [outlineFilter, setOutlineFilter] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [sidebarError, setSidebarError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeItemRef = useRef<HTMLButtonElement | null>(null);

  const outline = extractOutline(currentMarkdown);
  const filteredOutline = outline.filter((h) =>
    h.text.toLowerCase().includes(outlineFilter.toLowerCase())
  );

  // 当当前视口中心章节发生变化时，平滑滚动大纲列表使其保持在视野内
  React.useEffect(() => {
    if (activeHeadingId && activeItemRef.current&&!activeItemRef.current.closest('[inert]')) {
      activeItemRef.current.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [activeHeadingId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      if (file.size > 50 * 1024 * 1024) {
        setSidebarError('导入文件超过 50MB 限制');
        continue;
      }
      const reader = new FileReader();
      reader.onerror = () => setSidebarError('文件读取失败：' + file.name);

      reader.onload = async (event) => {
        const content = event.target?.result;
        if (typeof content !== 'string' || !content) return;

        // 尝试从可编辑 HTML 中提取源载荷
        if (/\.html?$/i.test(file.name)) {
          const restoredDoc = extractPayloadFromHtml(content);
          if (restoredDoc) {
            try {
              await verifyAssets(restoredDoc.assets);
            } catch (error) {
              setSidebarError(String(error));
              return;
            }
            onImportDoc(restoredDoc);
            return;
          }
          setSidebarError('HTML 没有有效源载荷或结构不受支持；未按 Markdown 导入。');
          return;
        }

        // 普通 Markdown 文件导入
        const title = file.name.replace(/\.[^/.]+$/, '');
        const newDoc: DocumentRecord = {
          schemaVersion: 1,
          id: 'doc_' + Math.random().toString(36).substring(2, 9),
          revision: 1,
          markdown: content,
          meta: {
            title,
            author: 'Imported',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          theme: {
            fontFamily: 'sans',
            fontSize: 15,
            lineHeight: 1.75,
            primaryColor: '#0d9488',
            paperTheme: 'clean-white',
            paperSize: 'A4',
            margins: { top: 20, bottom: 25, left: 20, right: 20 },
          },
          options: {
            syntaxProfile: 'commonmark-gfm-v1',
            mathMode: 'mathml',
          },
        };
        onImportDoc(newDoc);
      };

      reader.readAsText(file);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
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
      <div className="flex-1 overflow-y-auto p-2">
        {activeTab === 'docs' ? (
          <div className="space-y-1">
            {sidebarError && (
              <div className="mb-2 p-2 bg-red-950/80 border border-red-800 text-red-200 text-xs rounded flex items-center justify-between gap-1">
                <span className="truncate">{sidebarError}</span>
                <button
                  type="button"
                  onClick={() => setSidebarError(null)}
                  className="text-red-400 hover:text-white px-1 font-bold"
                >
                  ✕
                </button>
              </div>
            )}
            {/* Action Bar */}
            <div className="flex items-center gap-1.5 mb-2 px-1">
              <button
                onClick={onCreateDoc}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded bg-teal-600/90 hover:bg-teal-600 text-white text-xs font-medium transition-colors"
                title="创建新空白 Markdown 文档"
              >
                <Plus className="w-3.5 h-3.5" />
                新建文档
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-1 py-1.5 px-2.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs transition-colors"
                title="导入 .md 文件或含有载荷的可编辑 .html"
              >
                <Upload className="w-3.5 h-3.5" />
                导入
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".md,.markdown,.txt,.html,.htm"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            {/* Document Items List */}
            {documents.map((doc) => {
              const isActive = doc.id === currentDocId;
              const isConfirming = confirmDeleteId === doc.id;
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
                  <div className="flex items-start gap-2 overflow-hidden pr-2 flex-1 min-w-0">
                    <FileCode
                      className={`w-4 h-4 shrink-0 mt-0.5 ${
                        isActive ? 'text-teal-400' : 'text-neutral-500 group-hover:text-neutral-400'
                      }`}
                    />
                    <div className="overflow-hidden flex-1 min-w-0">
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
                    <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                      {isConfirming ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              onDeleteDoc(doc.id);
                              setConfirmDeleteId(null);
                            }}
                            className="px-1.5 py-0.5 rounded bg-red-600 hover:bg-red-500 text-white text-[10px] font-medium transition-colors"
                            title="确定删除此文档"
                          >
                            确定
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-1.5 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white text-[10px] transition-colors"
                            title="取消删除"
                          >
                            取消
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(doc.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-neutral-500 hover:text-red-400 rounded transition-all"
                          title="删除文档"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* Outline Tab */
          <div className="space-y-2">
            {/* Outline Search */}
            <div className="relative mb-2">
              <Search className="w-3.5 h-3.5 absolute left-2 top-2 text-neutral-500" />
              <input
                type="text"
                value={outlineFilter}
                onChange={(e) => setOutlineFilter(e.target.value)}
                placeholder="搜索标题大纲..."
                className="w-full pl-7 pr-2 py-1 rounded bg-neutral-950/80 border border-neutral-800 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-teal-500"
              />
            </div>

            {filteredOutline.length > 0 ? (
              <div className="space-y-1">
                {filteredOutline.map((item) => {
                  const indent = (item.level - 1) * 10;
                  const isActive = item.id === activeHeadingId;
                  return (
                    <button
                      aria-current={isActive?'location':undefined}
                      key={item.id}
                      ref={isActive ? activeItemRef : null}
                      onClick={() => onScrollToHeading(item.id, item.line)}
                      style={{ paddingLeft: `${indent + 8}px` }}
                      className={`w-full text-left py-1.5 pr-2 rounded text-xs truncate transition-all flex items-center gap-1.5 ${
                        isActive
                          ? 'bg-teal-950/80 border border-teal-500/60 text-teal-200 font-semibold shadow-sm ring-1 ring-teal-500/30'
                          : 'text-neutral-400 hover:text-teal-300 hover:bg-neutral-800/60 border border-transparent'
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
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-neutral-500 text-xs">
                {outline.length === 0 ? '当前文档暂无标题 (# 标题)' : '未找到匹配的标题'}
              </div>
            )}
          </div>
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
