/**
 * MarkFlow (墨流) 核心应用容器
 * 遵循《Markdown 编辑器总体设计方案 V0.2.8》
 * 整合：三栏工作台、多文档与大纲、双模公式与图表、流式/A4物理预览、导出中心与 1.0 审查看板
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronRight, FileUp } from 'lucide-react';
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
  extractPayloadFromHtml,
} from './core/storage/storage';
import { extractOutline } from './core/parser/markdownParser';
import { isTauri, saveNativeFileInPlace, saveNativeFileAs, updateWindowTitle, listenNativeFileDrop } from './core/platform/desktop';

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

  // 编辑器与浏览器预览视图分栏比例 (0.15 ~ 0.85，默认 0.5)
  const [splitRatio, setSplitRatio] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('markflow_split_ratio');
      if (saved) {
        const val = parseFloat(saved);
        if (!isNaN(val) && val >= 0.15 && val <= 0.85) return val;
      }
    } catch {}
    return 0.5;
  });
  const [isResizingSplit, setIsResizingSplit] = useState<boolean>(false);
  const splitContainerRef = useRef<HTMLDivElement | null>(null);

  // 撤销重做栈
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);

  // 同步滚动与大纲高亮状态
  const [syncScroll, setSyncScroll] = useState<boolean>(true);
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);
  const editorTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const scrollSourceRef = useRef<'editor' | 'preview' | 'outline' | null>(null);
  const expectedScroll=useRef<{editor:number|null;preview:number|null}>({editor:null,preview:null});
  const syncPosition=(el:HTMLElement,pane:'editor'|'preview',top:number)=>{const clamped=Math.max(0,Math.min(top,el.scrollHeight-el.clientHeight));expectedScroll.current[pane]=clamped;el.scrollTop=clamped};
  const isProgrammatic=(pane:'editor'|'preview',top:number)=>{const expected=expectedScroll.current[pane];expectedScroll.current[pane]=null;return expected!==null&&Math.abs(expected-top)<2};
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const pendingSaves=useRef(new Map<string,{timer:ReturnType<typeof setTimeout>;doc:DocumentRecord}>());
  const activeRevision=useRef<{id:string;revision:number}|null>(null);

  // 初始化加载文档
  useEffect(() => {
    getAllDocuments().then((docs) => {
      setDocuments(docs);
      const first=docs[0];
      if (first) {
        setCurrentDocId(first.id);
        setMathMode(first.options.mathMode);
      }
    });
  }, []);

  // 当前活动文档
  const currentDoc = documents.find((d) => d.id === currentDocId) || documents[0];

  activeRevision.current=currentDoc?{id:currentDoc.id,revision:currentDoc.revision}:null;
  const persist=async(doc:DocumentRecord)=>{
    try{await saveDocument(doc);if(activeRevision.current?.id===doc.id&&activeRevision.current.revision===doc.revision)setIsDirty(false)}
    catch(error){console.error('保存失败，请导出备份后重试：', error)}
  };
  const queueSave=(doc:DocumentRecord)=>{
    const prior=pendingSaves.current.get(doc.id);if(prior)clearTimeout(prior.timer);
    const timer=setTimeout(()=>{pendingSaves.current.delete(doc.id);void persist(doc)},700);
    pendingSaves.current.set(doc.id,{timer,doc});
  };
  useEffect(()=>{const guard=(event:BeforeUnloadEvent)=>{if(pendingSaves.current.size){event.preventDefault();event.returnValue=''}};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard)},[]);

  // 文档切换或加载时，确保大纲高亮同步指向当前有效章节
  useEffect(() => {
    if (currentDoc) {
      setMathMode(currentDoc.options.mathMode);
      const outline = extractOutline(currentDoc.markdown);
      const firstHeading=outline[0];
      if (firstHeading) {
        setActiveHeadingId((prev) => {
          const exists = outline.some((h) => h.id === prev);
          return exists ? prev : firstHeading.id;
        });
      } else {
        setActiveHeadingId(null);
      }
    }
  }, [currentDocId, currentDoc?.markdown]);

  // 同步原生桌面窗口与 Web 页面标题
  useEffect(() => {
    if (currentDoc) {
      void updateWindowTitle(currentDoc.meta.title, isDirty);
    }
  }, [currentDoc?.meta.title, isDirty]);

  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);

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
      if (firstHeadingMatch?.[1]?.trim()) {
        updatedDoc.meta = {
          ...updatedDoc.meta,
          title: firstHeadingMatch[1].trim(),
        };
      }

      setDocuments((prev) => prev.map((d) => (d.id === updatedDoc.id ? updatedDoc : d)));
      setIsDirty(true);

      queueSave(updatedDoc);
    },
    [currentDoc]
  );

  const handleUndo = () => {
    if (undoStack.length === 0 || !currentDoc) return;
    const previous = undoStack.at(-1);
    if(previous===undefined)return;
    setRedoStack((prev) => [...prev, currentDoc.markdown]);
    setUndoStack((prev) => prev.slice(0, -1));

    const updatedDoc: DocumentRecord = {
      ...currentDoc,
      markdown: previous,
      revision: currentDoc.revision + 1,
    };
    setDocuments((prev) => prev.map((d) => (d.id === updatedDoc.id ? updatedDoc : d)));
    setIsDirty(true);
    queueSave(updatedDoc);
  };

  const handleRedo = () => {
    if (redoStack.length === 0 || !currentDoc) return;
    const next = redoStack.at(-1);
    if(next===undefined)return;
    setUndoStack((prev) => [...prev, currentDoc.markdown]);
    setRedoStack((prev) => prev.slice(0, -1));

    const updatedDoc: DocumentRecord = {
      ...currentDoc,
      markdown: next,
      revision: currentDoc.revision + 1,
    };
    setDocuments((prev) => prev.map((d) => (d.id === updatedDoc.id ? updatedDoc : d)));
    setIsDirty(true);
    queueSave(updatedDoc);
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

  const handleSaveImmediately = async () => {
    if (!currentDoc) return;
    const pending = pendingSaves.current.get(currentDoc.id);
    if (pending) clearTimeout(pending.timer);
    pendingSaves.current.delete(currentDoc.id);

    if (isTauri()) {
      if (currentDoc.meta.filePath) {
        const ok = await saveNativeFileInPlace(currentDoc.meta.filePath, currentDoc.markdown);
        if (ok) {
          setIsDirty(false);
          await persist(currentDoc);
          return;
        }
      } else {
        const targetPath = await saveNativeFileAs(currentDoc.meta.title, currentDoc.markdown);
        if (targetPath) {
          const updatedDoc: DocumentRecord = {
            ...currentDoc,
            meta: {
              ...currentDoc.meta,
              filePath: targetPath,
            },
          };
          setDocuments((prev) => prev.map((d) => (d.id === updatedDoc.id ? updatedDoc : d)));
          setIsDirty(false);
          await persist(updatedDoc);
          return;
        }
      }
    }

    void persist(currentDoc);
  };

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        void handleSaveImmediately();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [currentDoc]);

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
    const pending=pendingSaves.current.get(id);if(pending)clearTimeout(pending.timer);pendingSaves.current.delete(id);
    deleteDocument(id).then(() => {
      const remaining = documents.filter((d) => d.id !== id);
      setDocuments(remaining);
      if (currentDocId === id) {
        setCurrentDocId(remaining[0]?.id??'');
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

  // 监听 Tauri 桌面端原生拖拽文件 (Windows Explorer / macOS Finder)
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    void listenNativeFileDrop(
      (nativeFile) => {
        if (/\.html?$/i.test(nativeFile.name)) {
          const restored = extractPayloadFromHtml(nativeFile.content);
          if (restored) {
            restored.meta.filePath = nativeFile.path;
            handleImportDoc(restored);
            return;
          }
        }

        const title = nativeFile.name.replace(/\.[^/.]+$/, '');
        const newDoc: DocumentRecord = {
          schemaVersion: 1,
          id: 'doc_' + Math.random().toString(36).substring(2, 9),
          revision: 1,
          markdown: nativeFile.content,
          meta: {
            title,
            author: 'Local File',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            filePath: nativeFile.path,
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
        handleImportDoc(newDoc);
      },
      (isDragging) => {
        setIsDraggingFile(isDragging);
      }
    ).then((unlisten) => {
      cleanup = unlisten;
    });

    return () => {
      cleanup?.();
    };
  }, []);

  // 拖拽调整编辑器与浏览器预览视图宽度比例
  const handleSplitPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const container = splitContainerRef.current;
    if (!container) return;

    setIsResizingSplit(true);
    const rect = container.getBoundingClientRect();
    const totalWidth = rect.width;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const offsetX = moveEvent.clientX - rect.left;
      // 保持在 15% 到 85% 之间，两端各至少保留 180px 宽度
      const minRatio = Math.max(0.15, 180 / totalWidth);
      const maxRatio = Math.min(0.85, (totalWidth - 180) / totalWidth);
      const newRatio = Math.min(Math.max(offsetX / totalWidth, minRatio), maxRatio);
      setSplitRatio(newRatio);
    };

    const handlePointerUp = () => {
      setIsResizingSplit(false);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      try {
        setSplitRatio((current) => {
          localStorage.setItem('markflow_split_ratio', current.toFixed(4));
          return current;
        });
      } catch {}
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }, []);

  const handleSplitDoubleClick = useCallback(() => {
    setSplitRatio(0.5);
    try {
      localStorage.setItem('markflow_split_ratio', '0.5');
    } catch {}
  }, []);

  const handleSplitKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setSplitRatio((r) => {
        const next = Math.max(0.15, Number((r - 0.02).toFixed(4)));
        try { localStorage.setItem('markflow_split_ratio', next.toFixed(4)); } catch {}
        return next;
      });
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setSplitRatio((r) => {
        const next = Math.min(0.85, Number((r + 0.02).toFixed(4)));
        try { localStorage.setItem('markflow_split_ratio', next.toFixed(4)); } catch {}
        return next;
      });
    } else if (e.key === 'Home' || e.key === 'Enter') {
      e.preventDefault();
      setSplitRatio(0.5);
      try { localStorage.setItem('markflow_split_ratio', '0.5'); } catch {}
    }
  }, []);

  const handleDirectScroll=(pane:'editor'|'preview')=>{
    if(scrollTimeoutRef.current)clearTimeout(scrollTimeoutRef.current);
    scrollSourceRef.current=pane;
    for(const [name,el] of [['editor',editorTextareaRef.current],['preview',previewContainerRef.current]] as const){
      if(el){expectedScroll.current[name]=name===pane?null:el.scrollTop;el.scrollTo({top:el.scrollTop,behavior:'instant'})}
    }
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
      if(isProgrammatic('editor',scrollTop))return;

      const docLines = currentDoc.markdown.split('\n');
      const totalLines = docLines.length;

      // 2.1 计算编辑器视口中心所在行，实时着重显示大纲视图所属章节
      const centerScrollTop = scrollTop + textarea.clientHeight / 2;
      const paddingTop=parseFloat(getComputedStyle(textarea).paddingTop)||0;
      const centerLine = Math.min(totalLines, Math.max(1, Math.floor((centerScrollTop-paddingTop)/24)+1));

      const outline = extractOutline(currentDoc.markdown);
      if (outline.length > 0) {
        let currentCenterHeading = outline[0];
        for (let i = outline.length - 1; i >= 0; i--) {
          const heading=outline[i];
          if (heading && heading.line <= centerLine) {
            currentCenterHeading = heading;
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
        syncPosition(preview,'preview',0);
        return;
      }
      if (maxEditorScroll > 0 && scrollTop >= maxEditorScroll - 3) {
        syncPosition(preview,'preview',maxPreviewScroll);
        return;
      }

      // 源码区块（Heading Anchors）精细插值定位
      const headingEls = Array.from(preview.querySelectorAll<HTMLElement>('[data-heading-id]'));
      if (headingEls.length === 0) {
        syncPosition(preview,'preview',Math.round(ratio * maxPreviewScroll));
        return;
      }

      const anchors = headingEls
        .map((el) => ({
          id: el.getAttribute('data-heading-id')!,
          line: Number(el.getAttribute('data-line') || 1),
          top: getElementRelativeTop(el, preview),
        }))
        .sort((a, b) => a.line - b.line);

      const topLine = Math.max(1, Math.floor((scrollTop-paddingTop)/24) + 1);
      let targetPreviewTop = 0;

      const first=anchors[0],last=anchors.at(-1);
      if(!first||!last)return;
      if (topLine <= first.line) {
        const progress = first.line > 1 ? (topLine - 1) / (first.line - 1) : 0;
        targetPreviewTop = progress * first.top;
      } else if (topLine >= last.line) {
        const span = Math.max(1, totalLines - last.line);
        const progress = (topLine - last.line) / span;
        targetPreviewTop = last.top + progress * (maxPreviewScroll - last.top);
      } else {
        let prev = first;
        let next = last;
        for (const [i,anchor] of anchors.entries()) {
          const after=anchors[i+1];
          if (after && topLine >= anchor.line && topLine < after.line) {
            prev = anchor;
            next = after;
            break;
          }
        }
        const span = Math.max(1, next.line - prev.line);
        const progress = (topLine - prev.line) / span;
        targetPreviewTop = prev.top + progress * (next.top - prev.top);
      }

      syncPosition(preview,'preview',Math.min(maxPreviewScroll, Math.max(0, Math.round(targetPreviewTop))));
    },
    [syncScroll, activeHeadingId, currentDoc]
  );

  // 3. HTML 视图滚动 → 大纲视口中心章节着重显示，编辑器视窗按源码区块同步滚动
  const handlePreviewScroll = useCallback(
    (ratio: number, scrollTop: number) => {
      const preview = previewContainerRef.current;
      const textarea = editorTextareaRef.current;
      if (!preview || !currentDoc) return;
      if(isProgrammatic('preview',scrollTop))return;

      // 3.1 计算 HTML 预览视口中心所在的章节标题，实时更新大纲着重高亮
      const containerRect = preview.getBoundingClientRect();
      const centerY = containerRect.top + containerRect.height / 2;
      const headingEls = Array.from(preview.querySelectorAll<HTMLElement>('[data-heading-id]'));

      if (headingEls.length > 0) {
        let centerHeadingId: string | null = null;
        for (const heading of headingEls) {
          const rect = heading.getBoundingClientRect();
          if (rect.top <= centerY) {
            centerHeadingId = heading.getAttribute('data-heading-id');
          } else {
            break;
          }
        }
        if (!centerHeadingId && headingEls.length > 0) {
          centerHeadingId = headingEls[0]?.getAttribute('data-heading-id')??null;
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
        syncPosition(textarea,'editor',0);
        return;
      }
      if (maxPreviewScroll > 0 && scrollTop >= maxPreviewScroll - 3) {
        syncPosition(textarea,'editor',maxEditorScroll);
        return;
      }

      if (headingEls.length === 0) {
        syncPosition(textarea,'editor',Math.round(ratio * maxEditorScroll));
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

      const first=anchors[0],last=anchors.at(-1);
      if(!first||!last)return;
      if (scrollTop <= first.top) {
        const progress = first.top > 0 ? scrollTop / first.top : 0;
        targetLine = 1 + progress * (first.line - 1);
      } else if (scrollTop >= last.top) {
        const span = Math.max(1, maxPreviewScroll - last.top);
        const progress = (scrollTop - last.top) / span;
        targetLine = last.line + progress * (totalLines - last.line);
      } else {
        let prev = first;
        let next = last;
        for (const [i,anchor] of anchors.entries()) {
          const after=anchors[i+1];
          if (after && scrollTop >= anchor.top && scrollTop < after.top) {
            prev = anchor;
            next = after;
            break;
          }
        }
        const span = Math.max(1, next.top - prev.top);
        const progress = (scrollTop - prev.top) / span;
        targetLine = prev.line + progress * (next.line - prev.line);
      }

      const targetEditorTop = (targetLine - 1) * 24;
      syncPosition(textarea,'editor',Math.min(maxEditorScroll, Math.max(0, Math.round(targetEditorTop))));
    },
    [syncScroll, activeHeadingId, currentDoc]
  );

  const handleMathModeToggle = () => {
    const nextMode = mathMode === 'mathml' ? 'svg' : 'mathml';
    setMathMode(nextMode);
    if (currentDoc) {
      const updatedDoc: DocumentRecord = {
        ...currentDoc,
        revision:currentDoc.revision+1,
        options: {
          ...currentDoc.options,
          mathMode: nextMode,
        },
      };
      setDocuments((prev) => prev.map((d) => (d.id === updatedDoc.id ? updatedDoc : d)));
      setIsDirty(true);
      queueSave(updatedDoc);
    }
  };

  // All three panes are independent; the final visible pane cannot be hidden.
  const visibleCount=Number(sidebarOpen)+Number(showEditor)+Number(showPreview);
  const handleToggleSidebar=()=>{if(!sidebarOpen||visibleCount>1)setSidebarOpen(v=>!v)};
  const handleToggleEditor=()=>{if(!showEditor||visibleCount>1)setShowEditor(v=>!v)};
  const handleTogglePreview=()=>{if(!showPreview||visibleCount>1)setShowPreview(v=>!v)};

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
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes('Files')) {
      setIsDraggingFile(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDraggingFile(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      if (file.size > 50 * 1024 * 1024) continue;
      const text = await file.text();
      if (!text) continue;

      if (/\.html?$/i.test(file.name)) {
        const restored = extractPayloadFromHtml(text);
        if (restored) {
          handleImportDoc(restored);
          return;
        }
      }

      const title = file.name.replace(/\.[^/.]+$/, '');
      const newDoc: DocumentRecord = {
        schemaVersion: 1,
        id: 'doc_' + Math.random().toString(36).substring(2, 9),
        revision: 1,
        markdown: text,
        meta: {
          title,
          author: 'Dropped File',
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
      handleImportDoc(newDoc);
      return;
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`h-screen w-screen flex flex-col overflow-hidden relative ${isDark ? 'dark bg-neutral-950' : 'bg-neutral-100'}`}
    >
      {/* File Drag & Drop Overlay */}
      {isDraggingFile && (
        <div className="absolute inset-0 z-50 bg-neutral-950/85 backdrop-blur-xs flex flex-col items-center justify-center border-2 border-dashed border-teal-500 text-teal-300 pointer-events-none animate-in fade-in duration-150">
          <FileUp className="w-12 h-12 mb-3 text-teal-400 animate-bounce" />
          <div className="text-base font-semibold text-neutral-100">释放文件以在 MarkFlow 中打开</div>
          <div className="text-xs text-neutral-400 mt-1">支持拖放 .md、.markdown、.txt 及可编辑 .html 文件</div>
        </div>
      )}
      {/* 3-Zone Top Bar */}
      <TopBar
        sidebarOpen={sidebarOpen}
        onToggleSidebar={handleToggleSidebar}
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
        filePath={currentDoc.meta.filePath}
      />

      {/* Main Workbench Layout */}
      <div className="flex-1 flex overflow-x-auto overflow-y-hidden min-h-0 relative" data-workbench="true">
        {/* Collapsible Left Sidebar (大纲与多文档工作区) */}
        <div
          data-view="outline" inert={!sidebarOpen} className={`transition-[width] duration-200 ease-in-out flex shrink-0 ${
            sidebarOpen ? (!showEditor&&!showPreview?'w-full':'w-64') : 'w-0'
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
            {...(visibleCount>1?{onToggleCollapse:handleToggleSidebar}:{})}
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
        <div className="flex-1 flex flex-col overflow-hidden min-h-0" style={{display:showEditor||showPreview?undefined:'none',minWidth:(Number(showEditor)+Number(showPreview))*360}}>
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
          <div
            ref={splitContainerRef}
            className={`flex-1 flex overflow-hidden relative ${isResizingSplit ? 'select-none cursor-col-resize' : ''}`}
          >
            {/* Editor Column */}
            {showEditor && (
              <div
                data-view="editor"
                onWheelCapture={() => handleDirectScroll('editor')}
                onPointerDownCapture={() => handleDirectScroll('editor')}
                onKeyDownCapture={() => handleDirectScroll('editor')}
                style={showPreview ? { width: `calc(${splitRatio * 100}% - 4px)` } : { width: '100%' }}
                className={`h-full min-w-0 flex flex-col shrink-0 overflow-hidden ${isResizingSplit ? 'pointer-events-none' : ''}`}
              >
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

            {/* Split Resizer Divider: 仅在两栏均激活时呈现 */}
            {showEditor && showPreview && (
              <div
                role="separator"
                tabIndex={0}
                aria-orientation="vertical"
                aria-valuenow={Math.round(splitRatio * 100)}
                aria-label="拖动调整编辑器与浏览器视图宽度"
                onPointerDown={handleSplitPointerDown}
                onDoubleClick={handleSplitDoubleClick}
                onKeyDown={handleSplitKeyDown}
                title="拖动调整左右分栏宽度 (双击重置为 1:1，方向键微调)"
                className={`w-2 shrink-0 group relative cursor-col-resize select-none flex items-center justify-center transition-colors z-20 outline-hidden ${
                  isResizingSplit
                    ? 'bg-teal-500/80 shadow-[0_0_8px_rgba(20,184,166,0.6)]'
                    : 'bg-neutral-800 hover:bg-teal-500/50 border-x border-neutral-700/60 focus-visible:bg-teal-500/60'
                }`}
              >
                {/* 居中把手指示器 */}
                <div
                  className={`h-8 w-1 rounded-full transition-colors ${
                    isResizingSplit ? 'bg-white' : 'bg-neutral-500 group-hover:bg-teal-200'
                  }`}
                />
              </div>
            )}

            {/* Preview Column: Reading View */}
            {showPreview && previewMode === 'flow' && (
              <div
                data-view="html"
                onWheelCapture={() => handleDirectScroll('preview')}
                onPointerDownCapture={() => handleDirectScroll('preview')}
                onKeyDownCapture={() => handleDirectScroll('preview')}
                style={showEditor ? { width: `calc(${(1 - splitRatio) * 100}% - 4px)` } : { width: '100%' }}
                className={`h-full min-w-0 flex flex-col shrink-0 overflow-hidden ${isResizingSplit ? 'pointer-events-none' : ''}`}
              >
                <ReadingPreview
                  {...(currentDoc.assets === undefined ? {} : { assets: currentDoc.assets })}
                  markdown={currentDoc.markdown}
                  mathMode={mathMode}
                  theme={currentDoc.theme}
                  isDark={isDark}
                  fontSize={currentDoc.theme.fontSize || 15}
                  lineHeight={currentDoc.theme.lineHeight || 1.75}
                  maxWidth={contentMaxWidth}
                  containerRef={previewContainerRef}
                  onScroll={handlePreviewScroll}
                  filePath={currentDoc.meta.filePath}
                />
              </div>
            )}

            {/* Preview Column: A4 Paginated View */}
            {showPreview && previewMode === 'a4' && (
              <div
                data-view="html"
                onWheelCapture={() => handleDirectScroll('preview')}
                onPointerDownCapture={() => handleDirectScroll('preview')}
                onKeyDownCapture={() => handleDirectScroll('preview')}
                style={showEditor ? { width: `calc(${(1 - splitRatio) * 100}% - 4px)` } : { width: '100%' }}
                className={`h-full min-w-0 flex flex-col shrink-0 overflow-hidden ${isResizingSplit ? 'pointer-events-none' : ''}`}
              >
                <A4PagePreview
                  {...(currentDoc.assets === undefined ? {} : { assets: currentDoc.assets })}
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
