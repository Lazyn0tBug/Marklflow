/**
 * MarkFlow (墨流) 核心应用容器
 * 遵循《Markdown 编辑器总体设计方案 V0.2.8》
 * 整合：三栏工作台、多文档与大纲、双模公式与图表、流式/A4物理预览、导出中心与 1.0 审查看板
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronRight } from 'lucide-react';
import { TopBar } from './components/header/TopBar';
import { Sidebar } from './components/workspace/Sidebar';
import { Editor } from './components/editor/Editor';
import { ReadingPreview } from './components/preview/ReadingPreview';
import { A4PagePreview } from './components/preview/A4PagePreview';
import { StatusBar } from './components/footer/StatusBar';
import { ExportModal } from './components/export/ExportModal';
import { RoadmapModal } from './components/roadmap/RoadmapModal';
import { WorkbenchToolbar } from './components/toolbar/WorkbenchToolbar';
import {
  DocumentRecord,
} from './core/model/document';
import {
  getAllDocuments,
  saveDocument,
  deleteDocument,
  createNewDocument,
} from './core/storage/storage';
import { clearMathCaches } from './core/render/mathRender';
import { extractOutline } from './core/parser/markdownParser';

// 计算元素相对于可滚动容器的实际垂直像素距离（处理嵌套与边距）
function getElementRelativeTop(el: HTMLElement, container: HTMLElement): number {
  const elRect = el.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  return elRect.top - containerRect.top + container.scrollTop;
}

export default function App() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [currentDocId, setCurrentDocId] = useState<string>('');
  const [isDark, setIsDark] = useState<boolean>(true);

  // 3 视图独立控制状态
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [showEditor, setShowEditor] = useState<boolean>(true);
  const [showPreview, setShowPreview] = useState<boolean>(true);
  const [previewMode, setPreviewMode] = useState<'flow' | 'a4'>('flow');
  const [contentMaxWidth, setContentMaxWidth] = useState<number | 'full'>(1024);

  const [mathMode, setMathMode] = useState<'mathml' | 'svg'>('mathml');
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [exportModalOpen, setExportModalOpen] = useState<boolean>(false);
  const [roadmapModalOpen, setRoadmapModalOpen] = useState<boolean>(false);

  // 撤销重做栈
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);

  // 同步滚动与大纲高亮状态
  const [syncScroll, setSyncScroll] = useState<boolean>(true);
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);
  const editorTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const scrollSourceRef = useRef<'editor' | 'preview' | 'outline' | null>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 初始化加载文档
  useEffect(() => {
    getAllDocuments().then((docs) => {
      setDocuments(docs);
      if (docs.length > 0) {
        setCurrentDocId(docs[0].id);
        setMathMode(docs[0].options.mathMode || 'mathml');
      }
    });
  }, []);

  // 当前活动文档
  const currentDoc = documents.find((d) => d.id === currentDocId) || documents[0];

  // 文档切换或加载时，确保大纲高亮同步指向当前有效章节
  useEffect(() => {
    if (currentDoc) {
      const outline = extractOutline(currentDoc.markdown);
      if (outline.length > 0) {
        setActiveHeadingId((prev) => {
          const exists = outline.some((h) => h.id === prev);
          return exists ? prev : outline[0].id;
        });
      } else {
        setActiveHeadingId(null);
      }
    }
  }, [currentDocId]);

  // Markdown 内容变更处理
  const handleMarkdownChange = useCallback(
    (newMarkdown: string) => {
      if (!currentDoc) return;

      // 压入撤销栈
      setUndoStack((prev) => [...prev.slice(-30), currentDoc.markdown]);
      setRedoStack([]);

      const updatedDoc: DocumentRecord = {
        ...currentDoc,
        markdown: newMarkdown,
        revision: currentDoc.revision + 1,
      };

      // 从第一行推导文档标题 (# 标题)
      const firstHeadingMatch = newMarkdown.match(/^#\s+(.+)$/m);
      if (firstHeadingMatch && firstHeadingMatch[1].trim()) {
        updatedDoc.meta = {
          ...updatedDoc.meta,
          title: firstHeadingMatch[1].trim(),
        };
      }

      setDocuments((prev) => prev.map((d) => (d.id === updatedDoc.id ? updatedDoc : d)));
      setIsDirty(true);

      // 防抖自动保存至 IndexedDB
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
      autoSaveTimerRef.current = setTimeout(() => {
        saveDocument(updatedDoc).then(() => {
          setIsDirty(false);
        });
      }, 700);
    },
    [currentDoc]
  );

  const handleUndo = () => {
    if (undoStack.length === 0 || !currentDoc) return;
    const previous = undoStack[undoStack.length - 1];
    setRedoStack((prev) => [...prev, currentDoc.markdown]);
    setUndoStack((prev) => prev.slice(0, -1));

    const updatedDoc: DocumentRecord = {
      ...currentDoc,
      markdown: previous,
      revision: currentDoc.revision + 1,
    };
    setDocuments((prev) => prev.map((d) => (d.id === updatedDoc.id ? updatedDoc : d)));
    setIsDirty(true);
  };

  const handleRedo = () => {
    if (redoStack.length === 0 || !currentDoc) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack((prev) => [...prev, currentDoc.markdown]);
    setRedoStack((prev) => prev.slice(0, -1));

    const updatedDoc: DocumentRecord = {
      ...currentDoc,
      markdown: next,
      revision: currentDoc.revision + 1,
    };
    setDocuments((prev) => prev.map((d) => (d.id === updatedDoc.id ? updatedDoc : d)));
    setIsDirty(true);
  };

  // 统一工作台工具栏文本插入
  const handleInsertText = useCallback(
    (before: string, after: string = '', defaultText: string = '') => {
      const textarea = editorTextareaRef.current;
      if (!textarea || !currentDoc) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selected = currentDoc.markdown.substring(start, end) || defaultText;

      const replacement = before + selected + after;
      const newValue =
        currentDoc.markdown.substring(0, start) +
        replacement +
        currentDoc.markdown.substring(end);

      handleMarkdownChange(newValue);

      setTimeout(() => {
        textarea.focus();
        const newCursorPos = start + before.length + selected.length;
        textarea.setSelectionRange(newCursorPos, newCursorPos);
      }, 0);
    },
    [currentDoc, handleMarkdownChange]
  );

  const handleSaveImmediately = () => {
    if (!currentDoc) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    saveDocument(currentDoc).then(() => {
      setIsDirty(false);
    });
  };

  const handleCreateDoc = () => {
    const newDoc = createNewDocument('新建 Markdown 文档');
    saveDocument(newDoc).then(() => {
      setDocuments((prev) => [newDoc, ...prev]);
      setCurrentDocId(newDoc.id);
      setUndoStack([]);
      setRedoStack([]);
      setIsDirty(false);
    });
  };

  const handleDeleteDoc = (id: string) => {
    deleteDocument(id).then(() => {
      const remaining = documents.filter((d) => d.id !== id);
      setDocuments(remaining);
      if (currentDocId === id && remaining.length > 0) {
        setCurrentDocId(remaining[0].id);
      }
    });
  };

  const handleImportDoc = (importedDoc: DocumentRecord) => {
    saveDocument(importedDoc).then(() => {
      setDocuments((prev) => [importedDoc, ...prev]);
      setCurrentDocId(importedDoc.id);
      setUndoStack([]);
      setRedoStack([]);
      setIsDirty(false);
    });
  };

  // 1. 大纲选中 → 对应标题在编辑器、HTML 中居顶
  const handleScrollToHeading = (headingId: string, line?: number) => {
    setActiveHeadingId(headingId);

    // 设立互斥锁，防止平滑滚动时级联产生抖动与死循环
    scrollSourceRef.current = 'outline';
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      scrollSourceRef.current = null;
    }, 600);

    // 1.1 编辑器视窗滚动：目标标题行居顶
    const textarea = editorTextareaRef.current;
    if (textarea && currentDoc) {
      let targetLine = line;
      if (!targetLine) {
        const outline = extractOutline(currentDoc.markdown);
        const item = outline.find((h) => h.id === headingId);
        if (item) targetLine = item.line;
      }
      if (targetLine) {
        const approxLineHeight = 24;
        const targetScrollTop = Math.max(0, (targetLine - 1) * approxLineHeight);
        textarea.scrollTo({
          top: targetScrollTop,
          behavior: 'smooth',
        });
      }
    }

    // 1.2 HTML 预览视窗滚动：目标标题居顶
    const preview = previewContainerRef.current;
    if (preview) {
      const targetEl =
        (preview.querySelector(`[data-heading-id="${headingId}"]`) as HTMLElement) ||
        document.getElementById(headingId);
      if (targetEl) {
        const targetTop = getElementRelativeTop(targetEl, preview);
        preview.scrollTo({
          top: Math.max(0, targetTop - 12),
          behavior: 'smooth',
        });
      }
    }
  };

  // 2. 编辑器滚动 → 大纲视口中心章节着重显示，HTML 视窗按源码区块同步滚动
  const handleEditorScroll = useCallback(
    (ratio: number, scrollTop: number) => {
      const textarea = editorTextareaRef.current;
      if (!textarea || !currentDoc) return;

      const docLines = currentDoc.markdown.split('\n');
      const totalLines = docLines.length;

      // 2.1 计算编辑器视口中心所在行，实时着重显示大纲视图所属章节
      const centerScrollTop = scrollTop + textarea.clientHeight / 2;
      const centerLine = Math.min(totalLines, Math.max(1, Math.round(centerScrollTop / 24)));

      const outline = extractOutline(currentDoc.markdown);
      if (outline.length > 0) {
        let currentCenterHeading = outline[0];
        for (let i = outline.length - 1; i >= 0; i--) {
          if (outline[i].line <= centerLine) {
            currentCenterHeading = outline[i];
            break;
          }
        }
        if (currentCenterHeading && currentCenterHeading.id !== activeHeadingId) {
          setActiveHeadingId(currentCenterHeading.id);
        }
      }

      // 2.2 如果未开启同步滚动，或滚动来自预览/大纲触发，则不反向驱动预览
      if (!syncScroll) return;
      if (scrollSourceRef.current === 'preview' || scrollSourceRef.current === 'outline') return;

      scrollSourceRef.current = 'editor';
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => {
        scrollSourceRef.current = null;
      }, 90);

      const preview = previewContainerRef.current;
      if (!preview) return;

      const maxPreviewScroll = preview.scrollHeight - preview.clientHeight;
      const maxEditorScroll = textarea.scrollHeight - textarea.clientHeight;
      if (maxPreviewScroll <= 0) return;

      // 边缘精准吸附
      if (scrollTop <= 2) {
        preview.scrollTop = 0;
        return;
      }
      if (maxEditorScroll > 0 && scrollTop >= maxEditorScroll - 3) {
        preview.scrollTop = maxPreviewScroll;
        return;
      }

      // 源码区块（Heading Anchors）精细插值定位
      const headingEls = Array.from(preview.querySelectorAll<HTMLElement>('[data-heading-id]'));
      if (headingEls.length === 0) {
        preview.scrollTop = Math.round(ratio * maxPreviewScroll);
        return;
      }

      const anchors = headingEls
        .map((el) => ({
          id: el.getAttribute('data-heading-id')!,
          line: Number(el.getAttribute('data-line') || 1),
          top: getElementRelativeTop(el, preview),
        }))
        .sort((a, b) => a.line - b.line);

      const topLine = Math.max(1, Math.round(scrollTop / 24) + 1);
      let targetPreviewTop = 0;

      if (topLine <= anchors[0].line) {
        const progress = anchors[0].line > 1 ? (topLine - 1) / (anchors[0].line - 1) : 0;
        targetPreviewTop = progress * anchors[0].top;
      } else if (topLine >= anchors[anchors.length - 1].line) {
        const last = anchors[anchors.length - 1];
        const span = Math.max(1, totalLines - last.line);
        const progress = (topLine - last.line) / span;
        targetPreviewTop = last.top + progress * (maxPreviewScroll - last.top);
      } else {
        let prev = anchors[0];
        let next = anchors[1];
        for (let i = 0; i < anchors.length - 1; i++) {
          if (topLine >= anchors[i].line && topLine < anchors[i + 1].line) {
            prev = anchors[i];
            next = anchors[i + 1];
            break;
          }
        }
        const span = Math.max(1, next.line - prev.line);
        const progress = (topLine - prev.line) / span;
        targetPreviewTop = prev.top + progress * (next.top - prev.top);
      }

      preview.scrollTop = Math.min(maxPreviewScroll, Math.max(0, Math.round(targetPreviewTop)));
    },
    [syncScroll, activeHeadingId, currentDoc]
  );

  // 3. HTML 视图滚动 → 大纲视口中心章节着重显示，编辑器视窗按源码区块同步滚动
  const handlePreviewScroll = useCallback(
    (ratio: number, scrollTop: number) => {
      const preview = previewContainerRef.current;
      const textarea = editorTextareaRef.current;
      if (!preview || !currentDoc) return;

      // 3.1 计算 HTML 预览视口中心所在的章节标题，实时更新大纲着重高亮
      const containerRect = preview.getBoundingClientRect();
      const centerY = containerRect.top + containerRect.height / 2;
      const headingEls = Array.from(preview.querySelectorAll<HTMLElement>('[data-heading-id]'));

      if (headingEls.length > 0) {
        let centerHeadingId: string | null = null;
        for (let i = 0; i < headingEls.length; i++) {
          const rect = headingEls[i].getBoundingClientRect();
          if (rect.top <= centerY) {
            centerHeadingId = headingEls[i].getAttribute('data-heading-id');
          } else {
            break;
          }
        }
        if (!centerHeadingId && headingEls.length > 0) {
          centerHeadingId = headingEls[0].getAttribute('data-heading-id');
        }
        if (centerHeadingId && centerHeadingId !== activeHeadingId) {
          setActiveHeadingId(centerHeadingId);
        }
      }

      // 3.2 如果未开启同步滚动，或滚动来自编辑器/大纲触发，则不反向驱动编辑器
      if (!syncScroll) return;
      if (scrollSourceRef.current === 'editor' || scrollSourceRef.current === 'outline') return;

      scrollSourceRef.current = 'preview';
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => {
        scrollSourceRef.current = null;
      }, 90);

      if (!textarea) return;
      const maxEditorScroll = textarea.scrollHeight - textarea.clientHeight;
      const maxPreviewScroll = preview.scrollHeight - preview.clientHeight;
      if (maxEditorScroll <= 0) return;

      // 边缘精准吸附
      if (scrollTop <= 2) {
        textarea.scrollTop = 0;
        return;
      }
      if (maxPreviewScroll > 0 && scrollTop >= maxPreviewScroll - 3) {
        textarea.scrollTop = maxEditorScroll;
        return;
      }

      if (headingEls.length === 0) {
        textarea.scrollTop = Math.round(ratio * maxEditorScroll);
        return;
      }

      const anchors = headingEls
        .map((el) => ({
          id: el.getAttribute('data-heading-id')!,
          line: Number(el.getAttribute('data-line') || 1),
          top: getElementRelativeTop(el, preview),
        }))
        .sort((a, b) => a.top - b.top);

      const docLines = currentDoc.markdown.split('\n');
      const totalLines = docLines.length;
      let targetLine = 1;

      if (scrollTop <= anchors[0].top) {
        const progress = anchors[0].top > 0 ? scrollTop / anchors[0].top : 0;
        targetLine = 1 + progress * (anchors[0].line - 1);
      } else if (scrollTop >= anchors[anchors.length - 1].top) {
        const last = anchors[anchors.length - 1];
        const span = Math.max(1, maxPreviewScroll - last.top);
        const progress = (scrollTop - last.top) / span;
        targetLine = last.line + progress * (totalLines - last.line);
      } else {
        let prev = anchors[0];
        let next = anchors[1];
        for (let i = 0; i < anchors.length - 1; i++) {
          if (scrollTop >= anchors[i].top && scrollTop < anchors[i + 1].top) {
            prev = anchors[i];
            next = anchors[i + 1];
            break;
          }
        }
        const span = Math.max(1, next.top - prev.top);
        const progress = (scrollTop - prev.top) / span;
        targetLine = prev.line + progress * (next.line - prev.line);
      }

      const targetEditorTop = (targetLine - 1) * 24;
      textarea.scrollTop = Math.min(maxEditorScroll, Math.max(0, Math.round(targetEditorTop)));
    },
    [syncScroll, activeHeadingId, currentDoc]
  );

  const handleMathModeToggle = () => {
    clearMathCaches();
    const nextMode = mathMode === 'mathml' ? 'svg' : 'mathml';
    setMathMode(nextMode);
    if (currentDoc) {
      const updatedDoc: DocumentRecord = {
        ...currentDoc,
        options: {
          ...currentDoc.options,
          mathMode: nextMode,
        },
      };
      setDocuments((prev) => prev.map((d) => (d.id === updatedDoc.id ? updatedDoc : d)));
      saveDocument(updatedDoc);
    }
  };

  // 保证至少保留一个内容视窗（编辑器或 HTML 预览）
  const handleToggleEditor = () => {
    if (showEditor && !showPreview) {
      setShowPreview(true);
      setShowEditor(false);
    } else {
      setShowEditor((prev) => !prev);
    }
  };

  const handleTogglePreview = () => {
    if (showPreview && !showEditor) {
      setShowEditor(true);
      setShowPreview(false);
    } else {
      setShowPreview((prev) => !prev);
    }
  };

  if (!currentDoc) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-neutral-900 text-neutral-400">
        正在初始化 MarkFlow 墨流工作台...
      </div>
    );
  }

  const lines = currentDoc.markdown.split('\n');
  const charCount = currentDoc.markdown.length;
  const wordCount = currentDoc.markdown.trim().split(/\s+/).filter(Boolean).length;
  const lineCount = lines.length;

  return (
    <div className={`h-screen w-screen flex flex-col overflow-hidden ${isDark ? 'dark bg-neutral-950' : 'bg-neutral-100'}`}>
      {/* 3-Zone Top Bar */}
      <TopBar
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
        showEditor={showEditor}
        showPreview={showPreview}
        onToggleEditor={handleToggleEditor}
        onTogglePreview={handleTogglePreview}
        previewMode={previewMode}
        onPreviewModeChange={setPreviewMode}
        maxWidth={contentMaxWidth}
        onMaxWidthChange={setContentMaxWidth}
        mathMode={mathMode}
        onMathModeToggle={handleMathModeToggle}
        isDark={isDark}
        onThemeToggle={() => setIsDark((prev) => !prev)}
        isDirty={isDirty}
        onSave={handleSaveImmediately}
        onOpenExport={() => setExportModalOpen(true)}
        onOpenRoadmap={() => setRoadmapModalOpen(true)}
        documentTitle={currentDoc.meta.title}
      />

      {/* Main Workbench Layout */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Collapsible Left Sidebar (大纲与多文档工作区) */}
        <div
          className={`transition-[width] duration-200 ease-in-out flex shrink-0 ${
            sidebarOpen ? 'w-64' : 'w-0'
          } overflow-hidden relative`}
        >
          <Sidebar
            documents={documents}
            currentDocId={currentDocId}
            onSelectDoc={(id) => {
              setCurrentDocId(id);
              setUndoStack([]);
              setRedoStack([]);
              setIsDirty(false);
            }}
            onCreateDoc={handleCreateDoc}
            onDeleteDoc={handleDeleteDoc}
            onImportDoc={handleImportDoc}
            onScrollToHeading={handleScrollToHeading}
            currentMarkdown={currentDoc.markdown}
            activeHeadingId={activeHeadingId}
            onToggleCollapse={() => setSidebarOpen(false)}
          />
        </div>

        {/* 侧边点击展开手柄：当大纲/侧栏隐藏时，在左侧边缘提供悬浮/常驻触发展开 */}
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="w-5 hover:w-7 h-full bg-neutral-900 border-r border-neutral-800 flex flex-col items-center justify-center gap-2 text-neutral-500 hover:text-teal-300 hover:bg-neutral-800 transition-all z-20 shrink-0 select-none cursor-pointer group"
            title="侧边点击：展开大纲与文档工作区"
          >
            <ChevronRight className="w-3.5 h-3.5 text-neutral-400 group-hover:text-teal-400 transition-transform group-hover:translate-x-0.5" />
            <span className="text-[10px] [writing-mode:vertical-rl] tracking-widest text-neutral-400 group-hover:text-neutral-200 font-medium">
              大纲与文档
            </span>
          </button>
        )}

        {/* Center / Right Content Viewports based on showEditor & showPreview */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Unified Workbench Toolbar across Editor & Preview */}
          {showEditor && (
            <WorkbenchToolbar
              onInsertText={handleInsertText}
              onUndo={handleUndo}
              onRedo={handleRedo}
              canUndo={undoStack.length > 0}
              canRedo={redoStack.length > 0}
              syncScroll={syncScroll}
              onToggleSyncScroll={() => setSyncScroll((prev) => !prev)}
              viewMode={showPreview ? 'split' : 'edit'}
            />
          )}

          {/* Viewports Split Panels */}
          <div className="flex-1 flex overflow-hidden">
            {/* Editor Column */}
            {showEditor && (
              <div className={`h-full flex flex-col ${showPreview ? 'w-1/2' : 'w-full'}`}>
                <Editor
                  value={currentDoc.markdown}
                  onChange={handleMarkdownChange}
                  onUndo={handleUndo}
                  onRedo={handleRedo}
                  canUndo={undoStack.length > 0}
                  canRedo={redoStack.length > 0}
                  textareaRef={editorTextareaRef}
                  onScroll={handleEditorScroll}
                  syncScroll={syncScroll}
                  onToggleSyncScroll={() => setSyncScroll((prev) => !prev)}
                  maxWidth={contentMaxWidth}
                />
              </div>
            )}

            {/* Preview Column: Reading View */}
            {showPreview && previewMode === 'flow' && (
              <div className={`h-full flex flex-col ${showEditor ? 'w-1/2' : 'w-full'}`}>
                <ReadingPreview
                  markdown={currentDoc.markdown}
                  mathMode={mathMode}
                  theme={currentDoc.theme}
                  isDark={isDark}
                  fontSize={currentDoc.theme.fontSize || 15}
                  lineHeight={currentDoc.theme.lineHeight || 1.75}
                  maxWidth={contentMaxWidth}
                  containerRef={previewContainerRef}
                  onScroll={handlePreviewScroll}
                />
              </div>
            )}

            {/* Preview Column: A4 Paginated View */}
            {showPreview && previewMode === 'a4' && (
              <div className={`h-full flex flex-col ${showEditor ? 'w-1/2' : 'w-full'}`}>
                <A4PagePreview
                  markdown={currentDoc.markdown}
                  mathMode={mathMode}
                  theme={currentDoc.theme}
                  meta={currentDoc.meta}
                  fontSize={currentDoc.theme.fontSize || 15}
                  lineHeight={currentDoc.theme.lineHeight || 1.75}
                  containerRef={previewContainerRef}
                  onScroll={handlePreviewScroll}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Status Bar */}
      <StatusBar
        charCount={charCount}
        wordCount={wordCount}
        lineCount={lineCount}
        mathMode={mathMode}
        revision={currentDoc.revision}
        isDirty={isDirty}
      />

      {/* Export Modal */}
      <ExportModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        document={currentDoc}
        mathMode={mathMode}
      />

      {/* Version Roadmap & 1.0 Audit Matrix Modal */}
      <RoadmapModal
        isOpen={roadmapModalOpen}
        onClose={() => setRoadmapModalOpen(false)}
        currentDoc={currentDoc}
      />
    </div>
  );
}
