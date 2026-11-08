/**
 * MarkFlow (墨流) 核心应用容器
 * 遵循《Markdown 编辑器总体设计方案 V0.2.8》
 * 整合：三栏工作台、多文档与大纲、双模公式与图表、流式/A4物理预览、导出中心与 1.0 审查看板
 */

import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import { ChevronRight } from 'lucide-react';
import { TopBar } from './components/header/TopBar';
import { Sidebar } from './components/workspace/Sidebar';
import { Editor } from './components/editor/Editor';
import { ReadingPreview } from './components/preview/ReadingPreview';
import { A4PagePreview } from './components/preview/A4PagePreview';
import { StatusBar } from './components/footer/StatusBar';
import { ExportModal } from './components/export/ExportModal';
import {NoticeList} from './components/notice/NoticeList';
import {DemoMessageView,MessageGallery} from './components/message/MessageGallery';
import {useDemoMessages} from './components/message/useDemoMessages';
import {MessageCard,MessageResult} from './presentation/messages';
import {noticeStore,type NoticeTone} from './application/notices';
import {reportFailure} from './core/platform/failures';
import { RoadmapModal } from './components/roadmap/RoadmapModal';
import { WorkbenchToolbar } from './components/toolbar/WorkbenchToolbar';
import {
  DocumentRecord,
  deriveDocumentTitle,
} from './core/model/document';
import {
  loadDocuments,
  saveDocument,
  deleteDocument,
  createNewDocument,
  getStorageRecoveries,
  recoveryJson,
} from './core/storage/storage';
import {readSoftWrapPreference,writeSoftWrapPreference} from './core/platform/web/editorPreferences';
import {markAppReady} from './core/platform/web/capture';
import {ResizablePanes} from './components/workspace/ResizablePanes';
import {DocumentTabs} from './components/workspace/DocumentTabs';
import {DocumentSessions} from './application/sessions/documentSessions';
import {saveSource} from './application/workspace/sourceSave';
import {createWebSourceImport} from './core/platform/web/sourceImport';
import {createNativeSourceImport,nativeFileIdentity} from './core/platform/tauri/sourceImport';
import {isNativeSynced,listenNativeDrop,releaseNativeFile,selectNativeOpen,type NativeSelection} from './core/platform/tauri/files';
import {isDesktopRuntime} from './core/platform/tauri/runtime';
import {DocumentFileContexts,releaseDocumentFileContext} from './application/workspace/documentFileContext';
import {DocumentOpener} from './application/workspace/documentOpen';
import type {ImportItemResult} from './application/workspace/sourceImport';
import {WorkbenchPreviewRuntime,type PreviewView} from './core/platform/web/workbenchPreviewRuntime';
import { extractOutline } from './core/parse/markdown';
import {DOCUMENT_MARKDOWN_MAX} from './core/model/documentSchema';
import {editorGeometry,editorLineAt,editorTopAt,sourceAnchorAt,sourceAnchorTop,previewSourcePoints,interpolate,type EditorGeometry,type ScrollPlacement} from './components/workspace/sourceScroll';

export default function App() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [currentDocId, setCurrentDocId] = useState<string>('');
  const [loadError,setLoadError]=useState('');
  const [actionError,setActionError]=useState('');
  const [importBusy,setImportBusy]=useState(false);
  const [importResults,setImportResults]=useState<ImportItemResult[]>([]);
  const importOpen=useRef<(doc:DocumentRecord)=>Promise<'opened'|'focused'>>(async()=>{throw new Error('导入尚未就绪')});
  const openSaved=useRef<(doc:DocumentRecord)=>void>(()=>{});
  const importer=useRef<ReturnType<typeof createWebSourceImport>|null>(null);
  if(!importer.current)importer.current=createWebSourceImport(doc=>importOpen.current(doc));
  /*
   * **桌面端那一套** ✓：系统选择器 ✓、拖放 ✓、会话里的文件绑定 ✓。
   *
   * **回调都放在 ref 里** ✓ ⇒ ⇒ 订阅只订一次 ✓ ⇒ ⇒ 拿到的却是当下的那份 ✓
   * ⇒ ⇒ 与 `importOpen` 同一形状 ✓ ⇒ ⇒ 不另立一种写法 ✓。
   */
  const [desktop,setDesktop]=useState(false);
  const contexts=useRef(new DocumentFileContexts()).current;
  const nativeFlow=useRef<(files:readonly NativeSelection[])=>Promise<void>>(async()=>{});
  const nativeImporter=useRef<ReturnType<typeof createNativeSourceImport>|null>(null);
  /*
   * **打开与绑定是同一件事** ✓ ⇒ ⇒ 规则在应用层 ✓ ⇒ ⇒ 这里只是把它接起来 ✓。
   * **端口的回调都稳** ✓ ⇒ ⇒ 这个对象建一次就够 ✓ ⇒ ⇒ 批次的状态不丢 ✓。
   */
  const nativeOpener=useRef<DocumentOpener<NativeSelection>|null>(null);
  if(desktop&&!nativeOpener.current)nativeOpener.current=new DocumentOpener<NativeSelection>(contexts,{
   open:doc=>importOpen.current(doc),
   identity:nativeFileIdentity,
   boundDocument:fileIdentity=>contexts.documentFor(fileIdentity),
   sameVersion:key=>isNativeSynced(key),
  });
  const [storageWarnings,setStorageWarnings]=useState<string[]>([]);
  const [recoveryCount,setRecoveryCount]=useState(0);
  const [loadComplete,setLoadComplete]=useState(false);
  const [isDark, setIsDark] = useState<boolean>(true);

  // 3 视图独立控制状态
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [showEditor, setShowEditor] = useState<boolean>(true);
  const [showPreview, setShowPreview] = useState<boolean>(true);
  const [previewMode, setPreviewMode] = useState<'flow' | 'a4'>('flow');
  const [softWrap,setSoftWrap]=useState(readSoftWrapPreference);
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
  /** 消息视觉页 ✓：点一个用例 ⇒ ⇒ 消息出现在真实的右下区域里 ✓。 */
  const [messageGalleryOpen, setMessageGalleryOpen] = useState<boolean>(false);
  const demoMessages=useDemoMessages();

  /**
   * 通知面的一条 ✓：**不带类别的那种** ✓ ⇒ ⇒ 那是成功或提示 ✓
   * ⇒ ⇒ 失败走 `reportFailure` ✓（那里带类别与诊断 id ✓）⇒ ⇒ 不混 ✓。
   */
  const pushNotice=useCallback((notice:{message:string;tone:NoticeTone})=>{
    noticeStore.push({tone:notice.tone,message:notice.message});
  },[]);

  // 同步滚动与大纲高亮状态
  const [syncScroll, setSyncScroll] = useState<boolean>(true);
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);
  const editorTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  /** 消息区域 ✓：通知列表要知道焦点该落回哪儿 ✓ ⇒ ⇒ 区域由这里给它 ✓。 */
  const messageRegionRef = useRef<HTMLDivElement | null>(null);
  const pendingPreviewLine=useRef<{documentId:string;line:number}|undefined>(undefined);
  const previewLine=useRef(1);
  const lastEditorGeometry=useRef<EditorGeometry>({lineHeight:24,paddingTop:12});
  const tabEditorGeometry=useRef(new Map<string,EditorGeometry>());
  // 滚动的模型：内容是源文档的行序列，视口是内容上的一个窗口，滚动就是移动这个窗口。
  // 状态是应用上次对这个面板做过的一次放置，记两样：
  //   位置——应用自己设的，浏览器会原样报回来，等值比较即可判身份；
  //   行——这次放置对应哪一行（内容坐标），是同步的落点。
  const placements=useRef<{editor:ScrollPlacement|null;preview:ScrollPlacement|null}>({editor:null,preview:null});
  const syncPosition=(el:HTMLElement,pane:'editor'|'preview',top:number,line:number|null)=>{
    const clamped=Math.max(0,Math.min(top,el.scrollHeight-el.clientHeight));
    placements.current[pane]={top:clamped,line};
    el.scrollTop=clamped;
  };
  // 事件的位置与记忆的位置一致 ⇒ 这是应用自己造成的，忽略它：往返因此精确，不漂。
  // 匹配时不消费记忆：同一次程序化滚动可能带来两个事件。位置对不上时记忆作废。
  const isOwnScroll=(pane:'editor'|'preview',top:number)=>{
    const placed=placements.current[pane];
    if(!placed)return false;
    if(Math.abs(placed.top-top)<1)return true;
    placements.current[pane]=null;
    return false;
  };


  const pendingSaves=useRef(new Map<string,{timer:ReturnType<typeof setTimeout>;doc:DocumentRecord}>());


  // 初始化加载文档
  useEffect(() => {
    // 工作台起来了 ✓：崩在这一次提交之前的 ⇒ 类别是"起不来" ✓。
    markAppReady();
    let active=true;
    let pipeline:WorkbenchPreviewRuntime|undefined;let unsubscribe=()=>{};
    try{pipeline=new WorkbenchPreviewRuntime(sessions);runtime.current=pipeline;const owner=pipeline;unsubscribe=owner.subscribe(()=>{if(active)setPreview(owner.view)})}catch(error){setActionError('预览启动失败，文档仍可编辑与保存：'+String(error));void reportFailure({category:'preview-unavailable',detail:String(error),cause:error})}
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
    }).catch(error=>{if(active)setLoadError(String(error));void reportFailure({category:'storage-unreadable',detail:String(error),cause:error})}).finally(async()=>{
      try{const entries=await getStorageRecoveries();if(active)setRecoveryCount(entries.length)}catch(error){if(active)setLoadError(String(error));void reportFailure({category:'storage-unreadable',detail:String(error),cause:error})}
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
    }catch(error){setLoadError('恢复备份读取失败，原始数据未改写：'+String(error));void reportFailure({category:'storage-unreadable',detail:String(error),cause:error})}
  };
  // 通知面：**多条并存** ✓ ⇒ ⇒ 后一条不盖掉前一条 ✓ ⇒ ⇒ 各自可关 ✓。
  // **三个状态各走各的** ✓ ⇒ ⇒ 不再是"谁先来谁显示" ✓ ⇒ ⇒ 后来的不盖掉前面的 ✓
  // ⇒ ⇒ 一个状态顶掉另一个这件事没了 ✓（那正是那条 `||` 短路的病 ✓）。
  const recoveryNotice=(loadError||actionError||storageWarnings.length>0||recoveryCount>0)?<aside role="alert" className="text-sm bg-amber-950 text-amber-100">
    {actionError&&<p className="px-4 py-2">{actionError}</p>}
    {loadError&&<p className="px-4 py-2">{loadError}</p>}
    {storageWarnings.length>0&&<p className="px-4 py-2">{storageWarnings.join('；')}</p>}
    {recoveryCount>0&&<p className="px-4 py-2">发现 {recoveryCount} 项损坏或不支持的存储记录，原始数据已保留。</p>}
    {(recoveryCount>0||loadError)&&<p className="px-4 pb-2"><button className="underline" onClick={()=>{void downloadRecovery()}}>下载恢复备份</button></p>}
  </aside>:null;

  // 当前活动文档
  const currentSession=sessions.documentIds.includes(currentDocId)?sessions.read(currentDocId):undefined;
  const currentDoc=currentSession?.document;
  const isDirty=currentSession?.dirty??false;
  const kind=previewMode==='a4'?'preview.a4':'preview.flow';
  const previewView:PreviewView=preview.documentId===currentDocId&&preview.kind===kind?preview:{documentId:currentDocId,kind,state:'pending'};

  const persist=async(doc:DocumentRecord):Promise<boolean>=>{
    try{await saveSource(sessions,doc,saveDocument);sessionChanged(value=>value+1);return true}
    catch(error){
      // **不再弹窗** ✓ ⇒ ⇒ 不打断正在做的事 ✓ ⇒ ⇒ 原文只进控制台 ✓ ⇒ ⇒ 用户看一句可行动的话 ✓。
      await reportFailure({category:'save-failed',message:'保存失败（'+doc.meta.title+'，Rev '+doc.revision+'），内容仍在工作区',detail:String(error),cause:error});
      return false;
    }
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
    if(editorTextareaRef.current){lastEditorGeometry.current=editorGeometry(editorTextareaRef.current);tabEditorGeometry.current.set(currentDoc.id,lastEditorGeometry.current)}
    const old=sessions.read(currentDoc.id).position,editor=editorTextareaRef.current,view=previewContainerRef.current;
    sessions.setPosition(currentDoc.id,{...old,...(editor?{sourceAnchor:sourceAnchorAt(editor.scrollTop,editorGeometry(editor)),editorLayoutKey:editorGeometry(editor).layoutKey??''}:{}),selectionStart:editor?.selectionStart??old.selectionStart,selectionEnd:editor?.selectionEnd??old.selectionEnd,scrollTop:editor?.scrollTop??old.scrollTop,scrollLeft:editor?.scrollLeft??old.scrollLeft,previewScrollTop:view?.scrollTop??old.previewScrollTop});
  };
  const selectDocument=(id:string)=>{
    capturePosition();const doc=sessions.documentIds.includes(id)?sessions.read(id).document:documents.find(value=>value.id===id);if(!doc)return;
    try{sessions.open(doc);setTabs(sessions.documentIds);setCurrentDocId(id);setMathMode(sessions.read(id).document.options.mathMode);setPreviewMode(tabModes.current.get(id)??'flow');setActiveHeadingId(tabHeadings.current.get(id)??null);restorePreview.current=id;placements.current={editor:null,preview:null};pendingPreviewLine.current=undefined}catch(error){setActionError('这个文档没能打开：'+String(error));void reportFailure({category:'document-open-failed',detail:String(error),cause:error})}
  };
  const removeSession=(id:string)=>{
    const active=sessions.activeDocumentId===id;if(sessions.documentIds.includes(id))sessions.close(id,true);
    runtime.current?.forget(id);tabModes.current.delete(id);tabHeadings.current.delete(id);tabEditorGeometry.current.delete(id);setTabs(sessions.documentIds);
    if(active){const next=sessions.activeDocumentId;setCurrentDocId(next??'');setPreviewMode(next?tabModes.current.get(next)??'flow':'flow');if(next)setMathMode(sessions.read(next).document.options.mathMode);setActiveHeadingId(next?tabHeadings.current.get(next)??null:null);restorePreview.current=next;placements.current={editor:null,preview:null};pendingPreviewLine.current=undefined}
    if(!sessions.documentIds.length)runtime.current?.clear();
    /*
     * **关掉标签页 ⇒ ⇒ 授权释放** ✓ ⇒ ⇒ 绑定不留着 ✓ ⇒ ⇒ 原生侧不留可用的凭据 ✓（M4-8 ✓）。
     * **没有绑定的文档** ⇒ ⇒ 没有授权可放 ✓ ⇒ ⇒ 这一步是空的 ✓。
     */
    void releaseDocumentFileContext(contexts,id,releaseNativeFile).catch(()=>{});
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
    if(editor){const geometry=editorGeometry(editor),top=position.sourceAnchor&&position.editorLayoutKey!==geometry.layoutKey?sourceAnchorTop(position.sourceAnchor,geometry):position.scrollTop;editor.setSelectionRange(position.selectionStart,position.selectionEnd);syncPosition(editor,'editor',top,position.sourceAnchor?.line??null);editor.scrollLeft=position.scrollLeft;lastEditorGeometry.current=geometry;tabEditorGeometry.current.set(currentDoc.id,geometry)}
  },[currentDocId,showEditor,softWrap,contentMaxWidth,sidebarOpen,showPreview]);
  // 行数按修订 memo 一份 ✓：滚动事件可达 60Hz ✓，每个事件都把全文切一遍是白扔的垃圾 ✓。
  const totalLines=useMemo(()=>currentDoc?currentDoc.markdown.split('\n').length:0,[currentDoc?.markdown]);
  const previewPoints=()=>{const view=previewContainerRef.current;return view&&currentDoc?previewSourcePoints(view,totalLines):[]};
  const positionPreview=(line:number)=>{const view=previewContainerRef.current;if(view){previewLine.current=line;syncPosition(view,'preview',interpolate(previewPoints(),line,'line'),line)}};
  useLayoutEffect(()=>{
    if(!currentDoc||previewView.state!=='ready'||!showPreview)return;
    const view=previewContainerRef.current;if(!view)return;
    const target=pendingPreviewLine.current;
    if(target?.documentId===currentDoc.id){positionPreview(target.line);pendingPreviewLine.current=undefined;restorePreview.current=undefined}
    else if(restorePreview.current===currentDoc.id){const saved=sessions.read(currentDoc.id).position;syncPosition(view,'preview',saved.previewScrollTop,saved.sourceAnchor?.line??null);previewLine.current=interpolate(previewPoints(),view.scrollTop,'top');restorePreview.current=undefined}
    else if(syncScroll&&editorTextareaRef.current){positionPreview(editorLineAt(editorTextareaRef.current.scrollTop,editorGeometry(editorTextareaRef.current)))}
    else positionPreview(previewLine.current);
  },[currentDocId,previewView.state,previewView.referenceId,showPreview,showEditor,previewMode,contentMaxWidth,sidebarOpen,softWrap]);
  useEffect(()=>{
    const view=previewContainerRef.current,editor=editorTextareaRef.current;
    if(!view||previewView.state!=='ready')return;
    let frame:number|undefined;
    const observer=new ResizeObserver(()=>{if(frame===undefined)frame=requestAnimationFrame(()=>{frame=undefined;if(syncScroll&&editor)positionPreview(editorLineAt(editor.scrollTop,editorGeometry(editor)));else positionPreview(previewLine.current)})});
    observer.observe(view);if(editor)observer.observe(editor);
    return()=>{observer.disconnect();if(frame!==undefined)cancelAnimationFrame(frame)};
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
    if(markdown.length>DOCUMENT_MARKDOWN_MAX){setActionError('文档超过源文大小上限，本次输入未应用');void reportFailure({category:'input-too-large'});return}
    const doc={...currentDoc,revision:currentDoc.revision+1,markdown};const title=deriveDocumentTitle(markdown);if(title)doc.meta={...doc.meta,title};applyDocument(doc);
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

  openSaved.current=(doc:DocumentRecord)=>{capturePosition();sessions.open(doc);setDocuments(previous=>[doc,...previous.filter(value=>value.id!==doc.id)]);setTabs(sessions.documentIds);setCurrentDocId(doc.id);setMathMode(doc.options.mathMode);setPreviewMode('flow');restorePreview.current=doc.id};
  const addDocument=async(doc:DocumentRecord):Promise<'opened'|'focused'>=>{
    const existing=documents.find(value=>value.id===doc.id);
    if(sessions.documentIds.includes(doc.id)||existing){selectDocument(doc.id);return 'focused'}
    if(sessions.documentIds.length>=32)throw new Error('最多同时打开32个文档，请先关闭一个标签页。');
    await saveDocument(doc);
    // Capture the currently displayed session when the write completes, not when file reading began.
    openSaved.current(doc);
    return 'opened';
  };
  importOpen.current=addDocument;
  const handleCreateDoc=()=>{if(importBusy)return;setActionError('');void addDocument(createNewDocument('新建 Markdown 文档')).catch(error=>{setActionError('操作失败，原文档与编辑内容已保留：'+String(error));void reportFailure({category:'storage-write-failed',detail:String(error),cause:error})});};
  const handleImportFiles=async(files:File[])=>{
    const service=importer.current;if(!service||service.busy)return;
    setImportBusy(true);setImportResults([]);
    try{const result=await service.run(files);if(result.status==='completed')setImportResults(result.items)}
    catch(error){setImportResults([{name:'导入',status:'failed',message:String(error)}]);void reportFailure({category:'import-rejected',detail:String(error),cause:error})}
    finally{setImportBusy(false)}
  };
  /*
   * **桌面端：选择器与拖放进同一个批次** ✓ ⇒ ⇒ 去重行为一致 ✓（M4-6 ✓）。
   */
  const runNativeBatch=async(files:readonly NativeSelection[])=>{
    const service=nativeImporter.current;if(!service||service.busy)return;
    setImportBusy(true);setImportResults([]);
    try{
      const result=await service.run(files);
      if(result.status==='completed'){
        setImportResults(result.items);
        // **命中既有绑定 ⇒ ⇒ 聚焦那个标签页** ✓ ⇒ ⇒ 不新建、不覆盖 ✓（M4-4 ✓）。
        const focus=result.items.find(item=>item.status==='focused'||item.status==='changed');
        if(focus?.documentId)selectDocument(focus.documentId);
      }
    }catch(error){setImportResults([{name:'打开',status:'failed',message:String(error)}]);void reportFailure({category:'import-rejected',detail:String(error),cause:error})}
    finally{setImportBusy(false)}
  };
  nativeFlow.current=runNativeBatch;
  const handleOpenNative=async()=>{
    if(importBusy)return;
    const files=await selectNativeOpen();
    // **用户没选** ⇒ ⇒ 什么都不做 ✓ ⇒ ⇒ 不是失败 ✓（§9 ✓）。
    if(!files||!files.length)return;
    await runNativeBatch(files);
  };
  /*
   * **桌面端才有的两件事** ✓：那个"打开"入口 ✓ 与拖放 ✓（§8.1 ✓、§5.4 ✓）。
   *
   * **拖放与选择器进同一个批次** ✓ ⇒ ⇒ 去重行为一致 ✓（M4-6 ✓）。
   * **订阅只订一次** ✓ ⇒ ⇒ 回调走 ref ✓ ⇒ ⇒ 拿到的却是当下的那份 ✓。
   */
  useEffect(()=>{void isDesktopRuntime().then(setDesktop)},[]);
  useEffect(()=>{
    if(!desktop)return;
    const opener=nativeOpener.current;
    if(!opener)return;
    if(!nativeImporter.current)nativeImporter.current=createNativeSourceImport({boundSelection:file=>opener.bound(file)},(doc,file)=>opener.open(doc,file));
    let stop:(()=>void)|undefined;let cancelled=false;
    void (async()=>{
      const unlisten=await listenNativeDrop(files=>{void nativeFlow.current(files)});
      if(cancelled){unlisten();return}
      stop=unlisten;
    })();
    return()=>{cancelled=true;stop?.()};
  },[desktop]);
  // 导入的忙碌与结果：**进右下消息区** ✓（设计 §3 ✓）⇒ ⇒ 归属还在这里 ✓
  // ⇒ ⇒ 只是换了个形状与位置 ✓ ⇒ ⇒ 文字与动作照旧 ✓。
  const importMessage=importBusy?
   <MessageCard body="正在读取、校验并导入文件…" role="status"/>:
   importResults.length>0?
    <MessageResult
     title="导入结果"
     items={importResults.map(item=>({label:item.name,detail:item.message,failed:item.status==='failed'}))}
     role={importResults.some(value=>value.status==='failed')?'alert':'status'}
     closeLabel="关闭导入结果"
     onClose={()=>setImportResults([])}/>:
    null;
  // 消息区：**两种界面状态共用一处** ✓ ⇒ ⇒ 通知与导入结果始终在同一个区域里 ✓。
  // `tabIndex={-1}` ⇒ ⇒ 消息都收走后，焦点有个落点 ✓（设计 §9 ✓）。
  // **区域由这里交下去** ✓ ⇒ ⇒ 通知列表不必从焦点反推它 ✓ ⇒ ⇒ 平台点击后不聚焦按钮时也能拿到 ✓。
  const messageRegion=<div ref={messageRegionRef} className="mf-message no-print" tabIndex={-1} aria-label="工作台消息">{demoMessages.demos.map(demo=><DemoMessageView key={demo.id} demo={demo} onDismiss={demoMessages.dismiss}/>)}<NoticeList regionRef={messageRegionRef}/>{importMessage}</div>;
  const handleDeleteDoc=(id:string)=>{
    setActionError('');const pending=pendingSaves.current.get(id);if(pending)clearTimeout(pending.timer);pendingSaves.current.delete(id);
    deleteDocument(id).then(()=>{removeSession(id);setDocuments(previous=>previous.filter(value=>value.id!==id))}).catch(error=>{setActionError('操作失败，原文档与编辑内容已保留：'+String(error));void reportFailure({category:'storage-write-failed',detail:String(error),cause:error})});
  };

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
    const editor=editorTextareaRef.current;if(editor){lastEditorGeometry.current=editorGeometry(editor);tabEditorGeometry.current.set(currentDoc.id,lastEditorGeometry.current)}
    const geometry=editor?editorGeometry(editor):tabEditorGeometry.current.get(currentDoc.id)??{lineHeight:24,paddingTop:12};
    const top=editorTopAt(target,geometry);
    if(editor)syncPosition(editor,'editor',top,target);
    const saved=sessions.read(currentDoc.id).position;sessions.setPosition(currentDoc.id,{...saved,scrollTop:top,sourceAnchor:{line:target,offset:0},editorLayoutKey:geometry.layoutKey??''});
    if(previewView.state==='ready'&&previewContainerRef.current)positionPreview(target);
    else pendingPreviewLine.current={documentId:currentDoc.id,line:target};
  };
  const handleEditorScroll=(_ratio:number,top:number)=>{
    const editor=editorTextareaRef.current;if(!editor||!currentDoc)return;
    const geometry=editorGeometry(editor);lastEditorGeometry.current=geometry;tabEditorGeometry.current.set(currentDoc.id,geometry);
    if(isOwnScroll('editor',top))return;
    const startLine=editorLineAt(top,geometry);
    highlightLine(editorLineAt(top+editor.clientHeight/2,geometry));
    if(!syncScroll||previewView.state!=='ready')return;
    const view=previewContainerRef.current;if(!view)return;
    const max=editor.scrollHeight-editor.clientHeight;
    if(top<=2)syncPosition(view,'preview',0,1);
    else if(max>0&&top>=max-3)syncPosition(view,'preview',view.scrollHeight-view.clientHeight,totalLines);
    else positionPreview(startLine);
  };
  const handlePreviewScroll=(_ratio:number,top:number)=>{
    const view=previewContainerRef.current;if(!view||!currentDoc||previewView.state!=='ready')return;
    if(isOwnScroll('preview',top))return;
    const points=previewPoints(),startLine=interpolate(points,top,'top');
    previewLine.current=startLine;
    highlightLine(interpolate(points,top+view.clientHeight/2,'top'));
    const editor=editorTextareaRef.current;if(!syncScroll)return;
    if(!editor){const saved=sessions.read(currentDoc.id).position,geometry=tabEditorGeometry.current.get(currentDoc.id)??{lineHeight:24,paddingTop:12},top=editorTopAt(startLine,geometry);sessions.setPosition(currentDoc.id,{...saved,scrollTop:top,sourceAnchor:sourceAnchorAt(top,geometry),editorLayoutKey:''});return}
    const max=view.scrollHeight-view.clientHeight;
    if(top<=2)syncPosition(editor,'editor',0,1);
    else if(max>0&&top>=max-3)syncPosition(editor,'editor',editor.scrollHeight-editor.clientHeight,totalLines);
    else syncPosition(editor,'editor',editorTopAt(startLine,editorGeometry(editor)),startLine);
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
  const handleToggleSidebar=()=>{capturePosition();if(!sidebarOpen||visibleCount>1)setSidebarOpen(v=>!v)};
  const handleToggleEditor=()=>{capturePosition();if(!showEditor||visibleCount>1)setShowEditor(v=>!v)};
  const handleTogglePreview=()=>{capturePosition();restorePreview.current=currentDocId;if(!showPreview&&syncScroll&&editorTextareaRef.current){pendingPreviewLine.current={documentId:currentDocId,line:editorLineAt(editorTextareaRef.current.scrollTop,editorGeometry(editorTextareaRef.current))};restorePreview.current=undefined}if(!showPreview||visibleCount>1)setShowPreview(v=>!v)};

  if(!currentDoc)return <div className="h-screen flex flex-col bg-neutral-950 text-neutral-300">{recoveryNotice}{messageRegion}{loadComplete?<div className="flex flex-1 min-h-0"><Sidebar documents={documents} currentDocId="" onSelectDoc={selectDocument} onCreateDoc={handleCreateDoc} onDeleteDoc={handleDeleteDoc} onImportFiles={files=>{void handleImportFiles(files)}} {...(desktop?{onOpenNative:()=>{void handleOpenNative()}}:{})} importBusy={importBusy} onScrollToHeading={()=>{}} currentMarkdown=""/><main className="flex-1 flex flex-col items-center justify-center gap-4"><p>选择文档以打开标签页，或新建文档。</p><button onClick={handleCreateDoc} className="px-4 py-2 rounded bg-teal-700 text-white">新建独立文档</button></main></div>:<p role="status">正在初始化 MarkFlow 墨流工作台...</p>}</div>;

  const lines = currentDoc.markdown.split('\n');
  const charCount = currentDoc.markdown.length;
  const wordCount = currentDoc.markdown.trim().split(/\s+/).filter(Boolean).length;
  const lineCount = lines.length;

  const tabBar=<DocumentTabs tabs={tabs.map(id=>{const value=sessions.read(id);return {id,title:value.document.meta.title,dirty:value.dirty}})} activeId={currentDocId} onActivate={selectDocument} onClose={id=>{void closeTab(id)}}/>;

  // `color-scheme` 让原生控件与消息模块的明暗跟着应用的开关走 ✓（设计 §5 ✓）。
  return (
    <div className={`h-screen w-screen flex flex-col overflow-hidden ${isDark ? 'dark bg-neutral-950' : 'bg-neutral-100'}`} style={{colorScheme:isDark?'dark':'light'}}>
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
        softWrap={softWrap}
        onSoftWrapChange={value=>{capturePosition();setSoftWrap(value);writeSoftWrapPreference(value)}}
        maxWidth={contentMaxWidth}
        onMaxWidthChange={value=>{capturePosition();setContentMaxWidth(value)}}
        mathMode={mathMode}
        onMathModeToggle={handleMathModeToggle}
        isDark={isDark}
        onThemeToggle={() => setIsDark((prev) => !prev)}
        isDirty={isDirty}
        onSave={handleSaveImmediately}
        onOpenExport={() => setExportModalOpen(true)}
        onOpenRoadmap={() => setRoadmapModalOpen(true)}
        onOpenMessages={import.meta.env.DEV?()=>setMessageGalleryOpen(true):undefined}
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
            onImportFiles={files=>{void handleImportFiles(files)}} {...(desktop?{onOpenNative:()=>{void handleOpenNative()}}:{})} importBusy={importBusy}
            onScrollToHeading={handleScrollToHeading}
            currentMarkdown={currentDoc.markdown}
            activeHeadingId={activeHeadingId}
            {...(visibleCount>1?{onToggleCollapse:handleToggleSidebar}:{})}
          />
        </div>

        {/* 侧边点击展开手柄：当大纲/侧栏隐藏时，在左侧边缘提供悬浮/常驻触发展开 */}
        {!sidebarOpen && (
          <button
            onClick={handleToggleSidebar}
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
        <div className="flex-1 flex flex-col overflow-hidden min-h-0" style={{display:showEditor||showPreview?undefined:'none',minWidth:(Number(showEditor)+Number(showPreview))*360+(showEditor&&showPreview?8:0)}}>
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

          {/* Resizing changes workbench geometry only; content max-width remains independent. */}
          <ResizablePanes labelledBy={'tab-'+encodeURIComponent(currentDocId)} onBeforeResize={capturePosition}
            editor={showEditor?<>
                <Editor
                  sessionId={currentDoc.id}
                  softWrap={softWrap}
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
            </>:null}
            preview={showPreview?(previewMode==='flow'?
              <ReadingPreview view={previewView} theme={currentDoc.theme} maxWidth={contentMaxWidth} containerRef={previewContainerRef} onScroll={handlePreviewScroll}/>:
              <A4PagePreview view={previewView} containerRef={previewContainerRef} onScroll={handlePreviewScroll}/>):null}
          />
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
        onNotice={pushNotice}
      />

      {/* 消息区：通知与导入结果都在这里 ✓（设计 §3 ✓ ⇒ ⇒ 一个区域 ✓）。 */}
      {messageRegion}

      {/* 消息视觉页 ✓：**只在开发构建里** ✓ ⇒ ⇒ 它是核对用的工具，不是产品功能 ✓。 */}
      {import.meta.env.DEV&&messageGalleryOpen?
       <MessageGallery
        demos={demoMessages.demos}
        onPick={demoMessages.pick}
        onClear={demoMessages.clear}
        onClose={()=>{setMessageGalleryOpen(false);demoMessages.clear()}}/>:
       null}

      {/* Version Roadmap & 1.0 Audit Matrix Modal */}
      <RoadmapModal
        isOpen={roadmapModalOpen}
        onClose={() => setRoadmapModalOpen(false)}
        currentDoc={currentDoc}
      />
    </div>
  );
}
