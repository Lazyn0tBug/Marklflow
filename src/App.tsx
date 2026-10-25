/**
 * MarkFlow (墨流) 核心应用容器
 * 遵循《Markdown 编辑器总体设计方案 V0.2.8》
 * 整合：三栏工作台、多文档与大纲、双模公式与图表、流式/A4物理预览、导出中心与 1.0 审查看板
 */

import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
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
  loadDocuments,
  saveDocument,
  deleteDocument,
  createNewDocument,
  getStorageRecoveries,
  recoveryJson,
} from './core/storage/storage';
import {DocumentTabs} from './components/workspace/DocumentTabs';
import {DocumentSessions} from './application/sessions/documentSessions';
import {WorkbenchPreviewRuntime,type PreviewView} from './core/platform/web/workbenchPreviewRuntime';
import { extractOutline } from './core/parse/markdown';
import {editorGeometry,editorLineAt,editorTopAt,previewSourcePoints,interpolate} from './components/workspace/sourceScroll';

export default function App() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [currentDocId, setCurrentDocId] = useState<string>('');
  const [loadError,setLoadError]=useState('');
  const [actionError,setActionError]=useState('');
  const [storageWarnings,setStorageWarnings]=useState<string[]>([]);
  const [recoveryCount,setRecoveryCount]=useState(0);
  const [loadComplete,setLoadComplete]=useState(false);
  const [isDark, setIsDark] = useState<boolean>(true);

  // 3 视图独立控制状态
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [showEditor, setShowEditor] = useState<boolean>(true);
  const [showPreview, setShowPreview] = useState<boolean>(true);
  const [previewMode, setPreviewMode] = useState<'flow' | 'a4'>('flow');
  const [contentMaxWidth, setContentMaxWidth] = useState<number | 'full'>(1024);

  const [mathMode, setMathMode] = useState<'mathml' | 'svg'>('mathml');
  const sessions=useRef(new DocumentSessions()).current;
  const runtime=useRef<WorkbenchPreviewRuntime|null>(null);
  const [tabs,setTabs]=useState<string[]>([]);
  const [,sessionChanged]=useState(0);
  const [preview,setPreview]=useState<PreviewView>({documentId:'',kind:'preview.flow',state:'pending'});
  const restorePreview=useRef<string|undefined>(undefined);
  const tabModes=useRef(new Map<string,'flow'|'a4'>());
  const tabHeadings=useRef(new Map<string,string|null>());
  const [exportModalOpen, setExportModalOpen] = useState<boolean>(false);
  const [roadmapModalOpen, setRoadmapModalOpen] = useState<boolean>(false);

  // 同步滚动与大纲高亮状态
  const [syncScroll, setSyncScroll] = useState<boolean>(true);
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);
  const editorTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const pendingPreviewLine=useRef<{documentId:string;line:number}|undefined>(undefined);
  const previewLine=useRef(1);
  const lastEditorGeometry=useRef({lineHeight:24,paddingTop:12});
  const expectedScroll=useRef<{editor:number|null;preview:number|null}>({editor:null,preview:null});
  const syncPosition=(el:HTMLElement,pane:'editor'|'preview',top:number)=>{const clamped=Math.max(0,Math.min(top,el.scrollHeight-el.clientHeight));expectedScroll.current[pane]=clamped;el.scrollTop=clamped};
  const isProgrammatic=(pane:'editor'|'preview',top:number)=>{const expected=expectedScroll.current[pane];expectedScroll.current[pane]=null;return expected!==null&&Math.abs(expected-top)<2};


  const pendingSaves=useRef(new Map<string,{timer:ReturnType<typeof setTimeout>;doc:DocumentRecord}>());


  // 初始化加载文档
  useEffect(() => {
    let active=true;
    let pipeline:WorkbenchPreviewRuntime|undefined;let unsubscribe=()=>{};
    try{pipeline=new WorkbenchPreviewRuntime(sessions);runtime.current=pipeline;const owner=pipeline;unsubscribe=owner.subscribe(()=>{if(active)setPreview(owner.view)})}catch(error){setActionError('预览启动失败，文档仍可编辑与保存：'+String(error))}
    loadDocuments().then(({documents:docs,warnings}) => {
      if(!active)return;
      setStorageWarnings(warnings);
      setDocuments(docs);
      const first=docs[0];
      if (first) {
        sessions.open(first);setTabs(sessions.documentIds);
        setCurrentDocId(first.id);
        setMathMode(first.options.mathMode);
      }
    }).catch(error=>{if(active)setLoadError(String(error))}).finally(async()=>{
      try{const entries=await getStorageRecoveries();if(active)setRecoveryCount(entries.length)}catch(error){if(active)setLoadError(String(error))}
      if(active)setLoadComplete(true);
    });
    return()=>{active=false;unsubscribe();pipeline?.dispose();runtime.current=null;for(const entry of pendingSaves.current.values())clearTimeout(entry.timer);};
  }, []);
  const downloadRecovery=async()=>{
    try{
      const entries=await getStorageRecoveries();
      const url=URL.createObjectURL(new Blob([recoveryJson({version:1,entries})],{type:'application/json'}));
      const link=document.createElement('a');link.href=url;link.download='markflow-recovery.json';link.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(error){setLoadError('恢复备份读取失败，原始数据未改写：'+String(error))}
  };
  const recoveryNotice=(loadError||actionError||storageWarnings.length>0||recoveryCount>0)?<aside role="alert" className="px-4 py-2 text-sm bg-amber-950 text-amber-100">
    {actionError||loadError||storageWarnings.join('；')||`发现 ${recoveryCount} 项损坏或不支持的存储记录，原始数据已保留。`}
    {(recoveryCount>0||loadError)&&<button className="ml-3 underline" onClick={()=>{void downloadRecovery()}}>下载恢复备份</button>}
  </aside>:null;

  // 当前活动文档
  const currentSession=sessions.documentIds.includes(currentDocId)?sessions.read(currentDocId):undefined;
  const currentDoc=currentSession?.document;
  const isDirty=currentSession?.dirty??false;
  const kind=previewMode==='a4'?'preview.a4':'preview.flow';
  const previewView:PreviewView=preview.documentId===currentDocId&&preview.kind===kind?preview:{documentId:currentDocId,kind,state:'pending'};

  const persist=async(doc:DocumentRecord):Promise<boolean>=>{
    try{await saveDocument(doc);if(sessions.documentIds.includes(doc.id))sessions.markSaved(doc.id,doc.revision);sessionChanged(value=>value+1);return true}
    catch(error){alert('保存失败，请导出备份后重试：'+String(error));return false}
  };
  const queueSave=(doc:DocumentRecord)=>{
    const prior=pendingSaves.current.get(doc.id);if(prior)clearTimeout(prior.timer);
    const timer=setTimeout(()=>{pendingSaves.current.delete(doc.id);void persist(doc)},700);
    pendingSaves.current.set(doc.id,{timer,doc});
  };
  useEffect(()=>{const guard=(event:BeforeUnloadEvent)=>{if(pendingSaves.current.size||sessions.documentIds.some(id=>sessions.read(id).dirty)){event.preventDefault();event.returnValue=''}};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard)},[]);

  const capturePosition=()=>{
    if(!currentDoc||!sessions.documentIds.includes(currentDoc.id))return;
    tabHeadings.current.set(currentDoc.id,activeHeadingId);
    if(editorTextareaRef.current)lastEditorGeometry.current=editorGeometry(editorTextareaRef.current);
    const old=sessions.read(currentDoc.id).position,editor=editorTextareaRef.current,view=previewContainerRef.current;
    sessions.setPosition(currentDoc.id,{selectionStart:editor?.selectionStart??old.selectionStart,selectionEnd:editor?.selectionEnd??old.selectionEnd,scrollTop:editor?.scrollTop??old.scrollTop,scrollLeft:editor?.scrollLeft??old.scrollLeft,previewScrollTop:view?.scrollTop??old.previewScrollTop});
  };
  const selectDocument=(id:string)=>{
    capturePosition();const doc=documents.find(value=>value.id===id);if(!doc)return;
    try{sessions.open(doc);setTabs(sessions.documentIds);setCurrentDocId(id);setMathMode(sessions.read(id).document.options.mathMode);setPreviewMode(tabModes.current.get(id)??'flow');setActiveHeadingId(tabHeadings.current.get(id)??null);restorePreview.current=id;expectedScroll.current={editor:null,preview:null};pendingPreviewLine.current=undefined}catch(error){setActionError(String(error))}
  };
  const removeSession=(id:string)=>{
    const active=sessions.activeDocumentId===id;if(sessions.documentIds.includes(id))sessions.close(id,true);
    runtime.current?.forget(id);tabModes.current.delete(id);tabHeadings.current.delete(id);setTabs(sessions.documentIds);
    if(active){const next=sessions.activeDocumentId;setCurrentDocId(next??'');setPreviewMode(next?tabModes.current.get(next)??'flow':'flow');if(next)setMathMode(sessions.read(next).document.options.mathMode);setActiveHeadingId(next?tabHeadings.current.get(next)??null:null);restorePreview.current=next;expectedScroll.current={editor:null,preview:null};pendingPreviewLine.current=undefined}
    if(!sessions.documentIds.length)runtime.current?.clear();
  };
  const closeTab=async(id:string)=>{
    if(!sessions.documentIds.includes(id))return;
    const value=sessions.read(id);
    if(value.dirty){if(!confirm('文档“'+value.document.meta.title+'”尚未保存。保存后关闭标签页？'))return;const pending=pendingSaves.current.get(id);if(pending)clearTimeout(pending.timer);pendingSaves.current.delete(id);if(!await persist(value.document))return;if(!sessions.documentIds.includes(id)||sessions.read(id).dirty)return}
    if(id===currentDocId)capturePosition();removeSession(id);
  };
  useEffect(()=>{
    if(currentDoc&&!runtime.current){setPreview({documentId:currentDoc.id,kind,state:'error',error:'预览引擎未就绪，请保存文档后重新加载。'});return}
    if(currentDoc&&runtime.current){try{runtime.current.activate(currentDoc.id,kind)}catch(error){setPreview({documentId:currentDoc.id,kind,state:'error',error:String(error)})}}
  },[currentDocId,currentDoc?.revision,kind,tabs.join('|')]);
  useLayoutEffect(()=>{
    if(!currentDoc)return;const position=sessions.read(currentDoc.id).position,editor=editorTextareaRef.current;
    if(editor){editor.setSelectionRange(position.selectionStart,position.selectionEnd);expectedScroll.current.editor=position.scrollTop;editor.scrollTop=position.scrollTop;editor.scrollLeft=position.scrollLeft}
  },[currentDocId,showEditor]);
  const previewPoints=()=>{const view=previewContainerRef.current;return view&&currentDoc?previewSourcePoints(view,currentDoc.markdown.split('\n').length):[]};
  const positionPreview=(line:number)=>{const view=previewContainerRef.current;if(view){previewLine.current=line;syncPosition(view,'preview',interpolate(previewPoints(),line,'line'))}};
  useLayoutEffect(()=>{
    if(!currentDoc||previewView.state!=='ready'||!showPreview)return;
    const view=previewContainerRef.current;if(!view)return;
    const target=pendingPreviewLine.current;
    if(target?.documentId===currentDoc.id){positionPreview(target.line);pendingPreviewLine.current=undefined;restorePreview.current=undefined}
    else if(restorePreview.current===currentDoc.id){syncPosition(view,'preview',sessions.read(currentDoc.id).position.previewScrollTop);previewLine.current=interpolate(previewPoints(),view.scrollTop,'top');restorePreview.current=undefined}
    else if(syncScroll&&editorTextareaRef.current){positionPreview(editorLineAt(editorTextareaRef.current.scrollTop,editorGeometry(editorTextareaRef.current)))}
    else positionPreview(previewLine.current);
  },[currentDocId,previewView.state,previewView.referenceId,showPreview,showEditor,previewMode,contentMaxWidth,sidebarOpen]);
  useEffect(()=>{
    const view=previewContainerRef.current,editor=editorTextareaRef.current;
    if(!view||previewView.state!=='ready')return;
    const observer=new ResizeObserver(()=>{if(syncScroll&&editor)positionPreview(editorLineAt(editor.scrollTop,editorGeometry(editor)));else positionPreview(previewLine.current)});
    observer.observe(view);if(editor)observer.observe(editor);
    return()=>observer.disconnect();
  },[currentDocId,previewView.state,previewView.referenceId,showPreview,showEditor,syncScroll]);

  // 文档切换或加载时，确保大纲高亮同步指向当前有效章节
  useEffect(() => {
    if (currentDoc) {
      if(currentDoc.id!==currentDocId)setCurrentDocId(currentDoc.id);
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
  }, [currentDocId, currentDoc?.id, currentDoc?.markdown]);

  const applyDocument=(doc:DocumentRecord)=>{sessions.update(doc);setDocuments(previous=>previous.map(value=>value.id===doc.id?doc:value));sessionChanged(value=>value+1);queueSave(doc)};
  const handleMarkdownChange=useCallback((markdown:string)=>{
    if(!currentDoc)return;
    const doc={...currentDoc,revision:currentDoc.revision+1,markdown};const title=markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();if(title)doc.meta={...doc.meta,title};applyDocument(doc);
  },[currentDoc]);
  const history=(direction:'undo'|'redo')=>{if(!currentDoc)return;if(sessions[direction](currentDoc.id)){const doc=sessions.read(currentDoc.id).document;setDocuments(previous=>previous.map(value=>value.id===doc.id?doc:value));sessionChanged(value=>value+1);setMathMode(doc.options.mathMode);queueSave(doc)}};
  const handleUndo=()=>history('undo');const handleRedo=()=>history('redo');

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
    const pending=pendingSaves.current.get(currentDoc.id);if(pending)clearTimeout(pending.timer);pendingSaves.current.delete(currentDoc.id);
    void persist(currentDoc);
  };

  const addDocument=(doc:DocumentRecord)=>{
    setActionError('');capturePosition();
    if(sessions.documentIds.includes(doc.id)){selectDocument(doc.id);return}
    if(sessions.documentIds.length>=32){setActionError('最多同时打开32个文档，请先关闭一个标签页。');return}
    saveDocument(doc).then(()=>{sessions.open(doc);setDocuments(previous=>[doc,...previous.filter(value=>value.id!==doc.id)]);setTabs(sessions.documentIds);setCurrentDocId(doc.id);setMathMode(doc.options.mathMode);setPreviewMode('flow');restorePreview.current=doc.id}).catch(error=>setActionError('操作失败，原文档与编辑内容已保留：'+String(error)));
  };
  const handleCreateDoc=()=>addDocument(createNewDocument('新建 Markdown 文档'));
  const handleImportDoc=(doc:DocumentRecord)=>addDocument(doc);
  const handleDeleteDoc=(id:string)=>{
    setActionError('');const pending=pendingSaves.current.get(id);if(pending)clearTimeout(pending.timer);pendingSaves.current.delete(id);
    deleteDocument(id).then(()=>{removeSession(id);setDocuments(previous=>previous.filter(value=>value.id!==id))}).catch(error=>setActionError('操作失败，原文档与编辑内容已保留：'+String(error)));
  };

  const handleDirectScroll=(pane:'editor'|'preview')=>{expectedScroll.current[pane]=null};
  const highlightLine=(line:number)=>{
    if(!currentDoc)return;
    const outline=extractOutline(currentDoc.markdown);
    const heading=[...outline].reverse().find(value=>value.line<=line)??outline[0];
    setActiveHeadingId(heading?.id??null);
  };
  const handleScrollToHeading=(headingId:string,line?:number)=>{
    if(!currentDoc)return;
    const target=line??extractOutline(currentDoc.markdown).find(value=>value.id===headingId)?.line;if(!target)return;
    setActiveHeadingId(headingId);
    const editor=editorTextareaRef.current;if(editor)lastEditorGeometry.current=editorGeometry(editor);
    const top=editorTopAt(target,lastEditorGeometry.current);
    if(editor)syncPosition(editor,'editor',top);
    const saved=sessions.read(currentDoc.id).position;sessions.setPosition(currentDoc.id,{...saved,scrollTop:top});
    if(previewView.state==='ready'&&previewContainerRef.current)positionPreview(target);
    else pendingPreviewLine.current={documentId:currentDoc.id,line:target};
  };
  const handleEditorScroll=(_ratio:number,top:number)=>{
    const editor=editorTextareaRef.current;if(!editor||!currentDoc||isProgrammatic('editor',top))return;
    const geometry=editorGeometry(editor);lastEditorGeometry.current=geometry;
    highlightLine(editorLineAt(top+editor.clientHeight/2,geometry));
    if(!syncScroll||previewView.state!=='ready')return;
    const view=previewContainerRef.current;if(!view)return;
    const max=editor.scrollHeight-editor.clientHeight;
    if(top<=2)syncPosition(view,'preview',0);
    else if(max>0&&top>=max-3)syncPosition(view,'preview',view.scrollHeight-view.clientHeight);
    else positionPreview(editorLineAt(top,geometry));
  };
  const handlePreviewScroll=(_ratio:number,top:number)=>{
    const view=previewContainerRef.current;if(!view||!currentDoc||previewView.state!=='ready'||isProgrammatic('preview',top))return;
    const points=previewPoints();previewLine.current=interpolate(points,top,'top');
    highlightLine(interpolate(points,top+view.clientHeight/2,'top'));
    const editor=editorTextareaRef.current;if(!syncScroll)return;
    if(!editor){const saved=sessions.read(currentDoc.id).position;sessions.setPosition(currentDoc.id,{...saved,scrollTop:editorTopAt(previewLine.current,lastEditorGeometry.current)});return}
    const max=view.scrollHeight-view.clientHeight;
    if(top<=2)syncPosition(editor,'editor',0);
    else if(max>0&&top>=max-3)syncPosition(editor,'editor',editor.scrollHeight-editor.clientHeight);
    else syncPosition(editor,'editor',editorTopAt(previewLine.current,editorGeometry(editor)));
  };
  const changePreviewMode=(mode:'flow'|'a4')=>{
    capturePosition();
    if(currentDoc){const editor=editorTextareaRef.current;const line=previewView.state==='ready'&&previewContainerRef.current?interpolate(previewPoints(),previewContainerRef.current.scrollTop,'top'):editor?editorLineAt(editor.scrollTop,editorGeometry(editor)):1;tabModes.current.set(currentDoc.id,mode);pendingPreviewLine.current={documentId:currentDoc.id,line};restorePreview.current=undefined}
    setPreviewMode(mode);
  };

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
      applyDocument(updatedDoc);
    }
  };

  // All three panes are independent; the final visible pane cannot be hidden.
  const visibleCount=Number(sidebarOpen)+Number(showEditor)+Number(showPreview);
  const handleToggleSidebar=()=>{if(!sidebarOpen||visibleCount>1)setSidebarOpen(v=>!v)};
  const handleToggleEditor=()=>{capturePosition();if(!showEditor||visibleCount>1)setShowEditor(v=>!v)};
  const handleTogglePreview=()=>{capturePosition();restorePreview.current=currentDocId;if(!showPreview&&syncScroll&&editorTextareaRef.current){pendingPreviewLine.current={documentId:currentDocId,line:editorLineAt(editorTextareaRef.current.scrollTop,editorGeometry(editorTextareaRef.current))};restorePreview.current=undefined}if(!showPreview||visibleCount>1)setShowPreview(v=>!v)};

  if(!currentDoc)return <div className="h-screen flex flex-col bg-neutral-950 text-neutral-300">{recoveryNotice}{loadComplete?<div className="flex flex-1 min-h-0"><Sidebar documents={documents} currentDocId="" onSelectDoc={selectDocument} onCreateDoc={handleCreateDoc} onDeleteDoc={handleDeleteDoc} onImportDoc={handleImportDoc} onScrollToHeading={()=>{}} currentMarkdown=""/><main className="flex-1 flex flex-col items-center justify-center gap-4"><p>选择文档以打开标签页，或新建文档。</p><button onClick={handleCreateDoc} className="px-4 py-2 rounded bg-teal-700 text-white">新建独立文档</button></main></div>:<p role="status">正在初始化 MarkFlow 墨流工作台...</p>}</div>;

  const lines = currentDoc.markdown.split('\n');
  const charCount = currentDoc.markdown.length;
  const wordCount = currentDoc.markdown.trim().split(/\s+/).filter(Boolean).length;
  const lineCount = lines.length;

  const tabBar=<DocumentTabs tabs={tabs.map(id=>{const value=sessions.read(id);return {id,title:value.document.meta.title,dirty:value.dirty}})} activeId={currentDocId} onActivate={selectDocument} onClose={id=>{void closeTab(id)}}/>;

  return (
    <div className={`h-screen w-screen flex flex-col overflow-hidden ${isDark ? 'dark bg-neutral-950' : 'bg-neutral-100'}`}>
      {recoveryNotice}
      {/* 3-Zone Top Bar */}
      <TopBar
        sidebarOpen={sidebarOpen}
        onToggleSidebar={handleToggleSidebar}
        showEditor={showEditor}
        showPreview={showPreview}
        onToggleEditor={handleToggleEditor}
        onTogglePreview={handleTogglePreview}
        previewMode={previewMode}
        onPreviewModeChange={changePreviewMode}
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
            onSelectDoc={selectDocument}
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
              canUndo={currentSession?.canUndo??false}
              canRedo={currentSession?.canRedo??false}
              syncScroll={syncScroll}
              onToggleSyncScroll={() => setSyncScroll((prev) => !prev)}
              viewMode={showPreview ? 'split' : 'edit'}
            />
          )}

          {/* Viewports Split Panels */}
          <div id="workbench-document" role="tabpanel" aria-labelledby={'tab-'+encodeURIComponent(currentDocId)} className="flex-1 flex overflow-hidden">
            {/* Editor Column */}
            {showEditor && (
              <div data-view="editor" onWheelCapture={()=>handleDirectScroll('editor')} onPointerDownCapture={()=>handleDirectScroll('editor')} onKeyDownCapture={()=>handleDirectScroll('editor')} className="h-full flex-1 min-w-0 flex flex-col">
                <Editor
                  value={currentDoc.markdown}
                  onChange={handleMarkdownChange}
                  onUndo={handleUndo}
                  onRedo={handleRedo}
                  canUndo={currentSession?.canUndo??false}
                  canRedo={currentSession?.canRedo??false}
                  textareaRef={editorTextareaRef}
                  onScroll={handleEditorScroll}
                  syncScroll={syncScroll}
                  onToggleSyncScroll={() => setSyncScroll((prev) => !prev)}
                  maxWidth={contentMaxWidth}
                />
                {tabBar}
              </div>
            )}

            {/* Preview Column: Reading View */}
            {showPreview && previewMode === 'flow' && (
              <div data-view="html" onWheelCapture={()=>handleDirectScroll('preview')} onPointerDownCapture={()=>handleDirectScroll('preview')} onKeyDownCapture={()=>handleDirectScroll('preview')} className="h-full flex-1 min-w-0 flex flex-col">
                <ReadingPreview view={previewView} theme={currentDoc.theme} maxWidth={contentMaxWidth} containerRef={previewContainerRef} onScroll={handlePreviewScroll}/>
              </div>
            )}

            {/* Preview Column: A4 Paginated View */}
            {showPreview && previewMode === 'a4' && (
              <div data-view="html" onWheelCapture={()=>handleDirectScroll('preview')} onPointerDownCapture={()=>handleDirectScroll('preview')} onKeyDownCapture={()=>handleDirectScroll('preview')} className="h-full flex-1 min-w-0 flex flex-col">
                <A4PagePreview view={previewView} containerRef={previewContainerRef} onScroll={handlePreviewScroll}/>
              </div>
            )}
          </div>
          {!showEditor&&tabBar}
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
