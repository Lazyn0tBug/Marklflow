/**
 * MarkFlow (墨流) 核心应用容器
 * 遵循《Markdown 编辑器总体设计方案 V0.2.8》
 * 整合：三栏工作台、多文档与大纲、双模公式与图表、流式/A4物理预览、导出中心与 1.0 审查看板
 */

import {useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect, useId} from 'react';
import {ChevronRight} from 'lucide-react';
import {TopBar} from './components/header/TopBar';
import {Sidebar} from './components/workspace/Sidebar';
import {Editor} from './components/editor/Editor';
import {ReadingPreview} from './components/preview/ReadingPreview';
import {A4PagePreview} from './components/preview/A4PagePreview';
import {HtmlViewControls} from './components/preview/HtmlViewControls';
import {StatusBar} from './components/footer/StatusBar';
import {ExportModal} from './components/export/ExportModal';
import {NoticeList} from './components/notice/NoticeList';
import {DemoMessageView, MessageGallery} from './components/message/MessageGallery';
import {useDemoMessages} from './components/message/useDemoMessages';
import {MessageCard, MessageViewport} from './presentation/messages';
import {ImportResultNotice} from './components/message/ImportResultNotice';
import {noticeStore, type NoticeTone} from './application/notices';
import {CONFIRM_TEXTS, messageText} from './application/messages';
import {reportAsync, reportFailure} from './core/platform/failures';
import {RoadmapModal} from './components/roadmap/RoadmapModal';
import {WorkbenchToolbar} from './components/toolbar/WorkbenchToolbar';
import {DocumentRecord, deriveDocumentTitle} from './core/model/document';
import {
  loadDocuments,
  saveDocument,
  deleteDocument,
  createNewDocument,
  getStorageRecoveries,
  recoveryJson,
} from './core/storage/storage';
import {
  readSoftWrapPreference,
  writeSoftWrapPreference,
} from './core/platform/web/editorPreferences';
import {hereSource, markAppReady} from './core/platform/web/capture';
import {ResizablePanes} from './components/workspace/ResizablePanes';
import {DocumentTabs} from './components/workspace/DocumentTabs';
import {DocumentSessions} from './application/sessions/documentSessions';
import {saveSource} from './application/workspace/sourceSave';
import {createWebSourceImport} from './core/platform/web/sourceImport';
import {createNativeSourceImport, nativeFileReference} from './core/platform/tauri/sourceImport';
import {
  detectNativeTarget,
  listenNativeDrop,
  releaseNativeFile,
  selectNativeOpen,
  type NativeSelection,
} from './core/platform/tauri/files';
import {isDesktopRuntime} from './core/platform/tauri/runtime';
import {nativeDiskPorts} from './core/platform/tauri/filePorts';
import {webDiskPorts} from './core/platform/web/filePorts';
import {editableHtmlSource} from './core/export/editableSource';
import {exportFile} from './application/exports/exportFile';
import {
  SYNC_FEEDBACK_TEXTS,
  SYNC_FEEDBACK_TONES,
  SAVE_AS_TEXTS,
  SAVE_TO_TEXTS,
  GATE_TEXTS,
  CLOSE_TAB_TEXTS,
} from './application/messages';
import {SaveSplitButton} from './components/header/SaveSplitButton';
import {ConflictDialog} from './components/workspace/ConflictDialog';
import {useConflictPrompt} from './components/workspace/conflictPrompt';
import {ConfirmDialog} from './components/workspace/ConfirmDialog';
import {useConfirmPrompt} from './components/workspace/confirmPrompt';
import {
  DocumentFileContexts,
  releaseDocumentFileContext,
  syncStatus as syncStatusOf,
} from './application/workspace/documentFileContext';
import {DocumentOpener} from './application/workspace/documentOpen';
import {nextDocumentAfterDeletion} from './application/workspace/documentDeletion';
import {DocumentSyncer} from './application/workspace/documentSyncer';
import {DocumentSaveAs} from './application/workspace/documentSaveAs';
import {DocumentSaveTo} from './application/workspace/documentSaveTo';
import {SourceBytes} from './application/workspace/sourceBytes';
import {bindingState, saveControlView} from './application/workspace/saveControl';
import {syncFeedback} from './application/workspace/syncFeedback';
import {isSaveShortcut} from './application/workspace/saveShortcut';
import {closeTabBeforeClose} from './application/workspace/closeTab';
import type {DiskPorts} from './application/workspace/diskPorts';
import {type ImportItemResult, type OpenResult} from './application/workspace/sourceImport';
import {
  WorkbenchPreviewRuntime,
  type PreviewView,
} from './core/platform/web/workbenchPreviewRuntime';
import {extractOutline} from './core/parse/markdown';
import {DOCUMENT_MARKDOWN_MAX} from './core/model/documentSchema';
import {
  editorGeometry,
  editorLineAt,
  editorTopAt,
  sourceAnchorAt,
  sourceAnchorTop,
  previewSourcePoints,
  interpolate,
  type EditorGeometry,
  type ScrollPlacement,
} from './components/workspace/sourceScroll';

export default function App() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [currentDocId, setCurrentDocId] = useState<string>('');
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [importResultBatch, setImportResultBatch] = useState<{
    id: number;
    items: ImportItemResult[];
  }>({id: 0, items: []});
  const importResults = importResultBatch.items;
  const setImportResults = useCallback((items: ImportItemResult[]) => {
    setImportResultBatch((previous) => ({id: previous.id + 1, items}));
  }, []);
  const importOpen = useRef<(doc: DocumentRecord) => Promise<OpenResult>>(async () => {
    throw new Error('导入尚未就绪');
  });
  const openSaved = useRef<(doc: DocumentRecord) => void>(() => {});
  const importer = useRef<ReturnType<typeof createWebSourceImport> | null>(null);
  if (!importer.current) importer.current = createWebSourceImport((doc) => importOpen.current(doc));
  /*
   * **桌面端那一套** ✓：系统选择器 ✓、拖放 ✓、会话里的文件绑定 ✓。
   *
   * **回调都放在 ref 里** ✓ ⇒ ⇒ 订阅只订一次 ✓ ⇒ ⇒ 拿到的却是当下的那份 ✓
   * ⇒ ⇒ 与 `importOpen` 同一形状 ✓ ⇒ ⇒ 不另立一种写法 ✓。
   */
  const [desktop, setDesktop] = useState(false);
  const contexts = useRef(new DocumentFileContexts()).current;
  const nativeFlow = useRef<(files: readonly NativeSelection[]) => Promise<void>>(async () => {});
  const nativeImporter = useRef<ReturnType<typeof createNativeSourceImport> | null>(null);
  /*
   * **打开与绑定是同一件事** ✓ ⇒ ⇒ 规则在应用层 ✓ ⇒ ⇒ 这里只是把它接起来 ✓。
   * **端口的回调都稳** ✓ ⇒ ⇒ 这个对象建一次就够 ✓ ⇒ ⇒ 批次的状态不丢 ✓。
   */
  const nativeOpener = useRef<DocumentOpener<NativeSelection> | null>(null);
  if (desktop && !nativeOpener.current)
    nativeOpener.current = new DocumentOpener<NativeSelection>(contexts, {
      open: (doc) => importOpen.current(doc),
      reference: nativeFileReference,
      boundDocument: (reference) => contexts.documentFor(reference),
      detect: (handle) => detectNativeTarget(handle),
      // **这一次没有成为绑定的凭据时才放** ✓ ⇒ ⇒ 原生侧不留无主的凭据 ✓（§5.1 ✓）。
      releaseHandle: (handle) => releaseNativeFile(handle),
    });
  /*
   * **平台给的那一半** ✓ ⇒ ⇒ **两端各一套** ✓ ⇒ ⇒ 差异落在实现上 ✓ ⇒ ⇒ 调用点不分叉 ✓（§6.5 ✓）。
   *
   * **放在 ref 里** ✓ ⇒ ⇒ **桌面端判定晚到一步也不影响** ✓ ⇒ ⇒ 服务那一份不用重建 ✓
   * ⇒ ⇒ **同目标串行那把队不丢** ✓。
   */
  const diskPorts = useRef<DiskPorts>(webDiskPorts);
  useEffect(() => {
    diskPorts.current = desktop ? nativeDiskPorts : webDiskPorts;
  }, [desktop]);
  /*
   * **冲突那一次提问** ✓ ⇒ ⇒ 问的那一方持有它 ✓ ⇒ ⇒ 上下文里不留"待用户决定" ✓（§4.1 ✓）。
   */
  const conflict = useConflictPrompt();
  /*
   * **删除那一次提问** ✓ ⇒ ⇒ 同样由问的那一方持有它 ✓ ⇒ ⇒ 走应用内的对话框 ✓。
   */
  const confirmPrompt = useConfirmPrompt();
  /*
   * **宿主给的那两个** ✓ ⇒ ⇒ 问用户 ✓、反向同步回填 ✓。
   *
   * **放在 ref 里** ✓ ⇒ ⇒ 服务建一次就够 ✓ ⇒ ⇒ 回调拿到的却是当下的那一份 ✓。
   *
   * **落草稿不在这里** ✓ ⇒ ⇒ **草稿与写回不接成一个流程** ✓ ⇒ ⇒
   * 草稿那边**自己报它自己** ✓（§6.1 ✓、§6.5 ✓）。
   */
  /** **当下是哪一个文档** ✓ ⇒ ⇒ 选目标时要知道拿哪一份比 ✓。 */
  const currentDocument = useRef<string>('');
  const applyPulled = useRef<(documentId: string, markdown: string) => number>(() => 0);
  /** **待写字节从哪来** ✓ ⇒ ⇒ 按源格式而异 ✓（§6.1 ✓）。 */
  const sourceBytes = useRef(new SourceBytes({editableHtml: editableHtmlSource})).current;
  const syncer = useRef<DocumentSyncer | null>(null);
  if (!syncer.current)
    syncer.current = new DocumentSyncer(contexts, {
      detect: (handle) => diskPorts.current.sync.detect(handle),
      targetPresent: (handle) => diskPorts.current.sync.targetPresent(handle),
      write: (handle, bytes, intent) => diskPorts.current.sync.write(handle, bytes, intent),
      read: (handle, format) => diskPorts.current.sync.read(handle, format),
      decide: (request) => conflict.ask(request),
      applyPulled: async (documentId, markdown) => applyPulled.current(documentId, markdown),
      /**
       * **门没过 ⇒ ⇒ 问用户一次** ✓（§6.1 ✓）。
       *
       * **只答"是/否"** ✓ ⇒ ⇒ **下一步由应用层选** ✓ ⇒ ⇒ **宿主只管把那句话说出来** ✓。
       */
      askGate: async (reason) =>
        confirmPrompt.ask({
          title: CONFIRM_TEXTS.gate.title,
          description: GATE_TEXTS[reason],
          subject: undefined,
          confirmLabel: CONFIRM_TEXTS.gate.confirm,
          cancelLabel: CONFIRM_TEXTS.cancel,
        }),
      /**
       * **换目标** ✓ ⇒ ⇒ **宿主把这一份写到新目标** ✓ ⇒ ⇒ **那边再过一次门** ✓ ⇒ ⇒
       * **绑定在那边读成功之后才成立** ✓（§4.1 ✓）。
       */
      saveElsewhere: async ({document, bytes}) => {
        const format = contexts.read(document.id)?.file.sourceFormat ?? 'markdown';
        const suggestion = exportFile(document.meta.title || document.id, format);
        const result = await saveTo.current!.saveTo({
          document,
          bytes,
          suggestedName: suggestion.name,
        });
        if (result.kind === 'saved') return {kind: 'written', revision: result.revision};
        // **用户取消 ⇒ ⇒ 那边没成** ✓ ⇒ ⇒ **不是失败** ✓ ⇒ ⇒ 两边都不动 ✓。
        if (result.kind === 'cancelled') return {kind: 'cancelled'};
        return {kind: 'failed', error: new Error('换到新目标也没写成')};
      },
    });
  /**
   * **选一个新目标** ✓ ⇒ ⇒ **跨目录那句话在那儿问** ✓（§6.2 ✓、M5-10 ✓）。
   *
   * **用户说不** ⇒ ⇒ **当没有目标** ✓ ⇒ ⇒ 规则那一侧就是"取消" ✓ ⇒ ⇒ 不写、不建立关联 ✓（§6.2 ✓）。
   *
   * **两条流程共用它** ✓ ⇒ ⇒ **另存为**与**写到新目标**问的是同一句 ✓ ⇒ ⇒ **规则只有一处** ✓。
   */
  const selectSaveTarget = async (suggestedName: string) => {
    const target = await diskPorts.current.saveAs.selectTarget(suggestedName);
    if (target === undefined) return undefined;
    const source = contexts.read(currentDocument.current)?.file.handle;
    // **没有原文件** ⇒ ⇒ 谈不上跨目录 ✓ ⇒ ⇒ 不问 ✓。
    if (source === undefined) return target;
    // **同目录由原生侧答** ✓ ⇒ ⇒ 路径不出原生侧 ✓（§3.4 ✓）。
    if (await diskPorts.current.sameDirectory(source, target.handle)) return target;
    if (
      await confirmPrompt.ask({
        title: CONFIRM_TEXTS.saveAs.title,
        description: SAVE_AS_TEXTS.crossDirectory,
        subject: undefined,
        confirmLabel: CONFIRM_TEXTS.saveAs.confirm,
        cancelLabel: CONFIRM_TEXTS.cancel,
      })
    )
      return target;
    // **不要了** ⇒ ⇒ 放掉这次的授权 ✓ ⇒ ⇒ 原生侧不留无主的凭据 ✓（§5.1 ✓）。
    await diskPorts.current.saveAs.releaseHandle(target.handle).catch(() => {});
    return undefined;
  };
  const saver = useRef<DocumentSaveAs | null>(null);
  if (!saver.current)
    saver.current = new DocumentSaveAs(contexts, {
      selectTarget: selectSaveTarget,
      write: (handle, bytes) => diskPorts.current.saveAs.write(handle, bytes),
      releaseHandle: (handle) => diskPorts.current.saveAs.releaseHandle(handle),
      targetPresent: (handle) => diskPorts.current.saveAs.targetPresent(handle),
      createDocument: async (source) => {
        const created = createNewDocument(source.meta.title || source.id);
        await saveDocument(created);
        return {...created, markdown: source.markdown};
      },
    });
  /** **写到新目标** ✓ ⇒ ⇒ **关联为空时那一次保存** ✓ ⇒ ⇒ **写成功即建立关联** ✓（§8.2 ✓）。 */
  const saveTo = useRef<DocumentSaveTo | null>(null);
  if (!saveTo.current)
    saveTo.current = new DocumentSaveTo(contexts, {
      selectTarget: selectSaveTarget,
      write: (handle, bytes) => diskPorts.current.saveAs.write(handle, bytes),
      releaseHandle: (handle) => diskPorts.current.saveAs.releaseHandle(handle),
      targetPresent: (handle) => diskPorts.current.saveAs.targetPresent(handle),
    });
  const [storageWarnings, setStorageWarnings] = useState<string[]>([]);
  const [recoveryCount, setRecoveryCount] = useState(0);
  const [loadComplete, setLoadComplete] = useState(false);
  const [isDark, setIsDark] = useState<boolean>(true);

  // 3 视图独立控制状态
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [showEditor, setShowEditor] = useState<boolean>(true);
  const [showPreview, setShowPreview] = useState<boolean>(true);
  const [previewMode, setPreviewMode] = useState<'flow' | 'a4'>('flow');
  const [softWrap, setSoftWrap] = useState(readSoftWrapPreference);
  const [contentMaxWidth, setContentMaxWidth] = useState<number | 'full'>(1024);

  const [mathMode, setMathMode] = useState<'mathml' | 'svg'>('mathml');
  const sessions = useRef(new DocumentSessions()).current;
  const runtime = useRef<WorkbenchPreviewRuntime | null>(null);
  const [tabs, setTabs] = useState<string[]>([]);
  const [, sessionChanged] = useState(0);
  const [preview, setPreview] = useState<PreviewView>({
    documentId: '',
    kind: 'preview.flow',
    state: 'pending',
  });
  const restorePreview = useRef<string | undefined>(undefined);
  const tabModes = useRef(new Map<string, 'flow' | 'a4'>());
  const tabHeadings = useRef(new Map<string, string | null>());
  const [exportModalOpen, setExportModalOpen] = useState<boolean>(false);
  const [roadmapModalOpen, setRoadmapModalOpen] = useState<boolean>(false);
  /** 消息视觉页 ✓：点一个用例 ⇒ ⇒ 消息出现在真实的右下区域里 ✓。 */
  const [messageGalleryOpen, setMessageGalleryOpen] = useState<boolean>(false);
  const demoMessages = useDemoMessages();

  /**
   * 通知面的一条 ✓：**不带类别的那种** ✓ ⇒ ⇒ 那是成功或提示 ✓
   * ⇒ ⇒ 失败走 `reportFailure` ✓（那里带类别与诊断 id ✓）⇒ ⇒ 不混 ✓。
   */
  const pushNotice = useCallback((notice: {message: string; tone: NoticeTone}) => {
    noticeStore.push({tone: notice.tone, message: notice.message});
  }, []);

  // 同步滚动与大纲高亮状态
  const [syncScroll, setSyncScroll] = useState<boolean>(true);
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);
  const editorTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  /** 消息区域 ✓：通知列表要知道焦点该落回哪儿 ✓ ⇒ ⇒ 区域由这里给它 ✓。 */
  const messageRegionRef = useRef<HTMLDivElement | null>(null);
  const messageRegionId = useId();
  const exportButtonRef = useRef<HTMLButtonElement>(null);
  const pendingPreviewLine = useRef<{documentId: string; line: number} | undefined>(undefined);
  const previewLine = useRef(1);
  const lastEditorGeometry = useRef<EditorGeometry>({lineHeight: 24, paddingTop: 12});
  const tabEditorGeometry = useRef(new Map<string, EditorGeometry>());
  // 滚动的模型：内容是源文档的行序列，视口是内容上的一个窗口，滚动就是移动这个窗口。
  // 状态是应用上次对这个面板做过的一次放置，记两样：
  //   位置——应用自己设的，浏览器会原样报回来，等值比较即可判身份；
  //   行——这次放置对应哪一行（内容坐标），是同步的落点。
  const placements = useRef<{editor: ScrollPlacement | null; preview: ScrollPlacement | null}>({
    editor: null,
    preview: null,
  });
  const syncPosition = (
    el: HTMLElement,
    pane: 'editor' | 'preview',
    top: number,
    line: number | null,
  ) => {
    const clamped = Math.max(0, Math.min(top, el.scrollHeight - el.clientHeight));
    placements.current[pane] = {top: clamped, line};
    el.scrollTop = clamped;
  };
  // 事件的位置与记忆的位置一致 ⇒ 这是应用自己造成的，忽略它：往返因此精确，不漂。
  // 匹配时不消费记忆：同一次程序化滚动可能带来两个事件。位置对不上时记忆作废。
  const isOwnScroll = (pane: 'editor' | 'preview', top: number) => {
    const placed = placements.current[pane];
    if (!placed) return false;
    if (Math.abs(placed.top - top) < 1) return true;
    placements.current[pane] = null;
    return false;
  };

  const pendingSaves = useRef(
    new Map<string, {timer: ReturnType<typeof setTimeout>; doc: DocumentRecord}>(),
  );

  // 初始化加载文档
  useEffect(() => {
    // 工作台起来了 ✓：崩在这一次提交之前的 ⇒ 类别是"起不来" ✓。
    markAppReady();
    let active = true;
    let pipeline: WorkbenchPreviewRuntime | undefined;
    let unsubscribe = () => {};
    try {
      pipeline = new WorkbenchPreviewRuntime(sessions);
      runtime.current = pipeline;
      const owner = pipeline;
      unsubscribe = owner.subscribe(() => {
        if (active) setPreview(owner.view);
      });
    } catch (error) {
      setActionError('预览启动失败，文档仍可编辑与保存：' + String(error));
      void reportFailure({category: 'preview-unavailable', detail: String(error), cause: error});
    }
    loadDocuments()
      .then(({documents: docs, warnings}) => {
        if (!active) return;
        setStorageWarnings(warnings);
        setDocuments(docs);
        const first = docs[0];
        if (first) {
          sessions.open(first);
          setTabs(sessions.documentIds);
          setCurrentDocId(first.id);
          setMathMode(first.options.mathMode);
        }
      })
      .catch((error) => {
        if (active) setLoadError(String(error));
        void reportFailure({category: 'storage-unreadable', detail: String(error), cause: error});
      })
      .finally(async () => {
        try {
          const entries = await getStorageRecoveries();
          if (active) setRecoveryCount(entries.length);
        } catch (error) {
          if (active) setLoadError(String(error));
          void reportFailure({category: 'storage-unreadable', detail: String(error), cause: error});
        }
        if (active) setLoadComplete(true);
      });
    return () => {
      active = false;
      unsubscribe();
      pipeline?.dispose();
      runtime.current = null;
      for (const entry of pendingSaves.current.values()) clearTimeout(entry.timer);
    };
  }, []);
  const downloadRecovery = async () => {
    try {
      const entries = await getStorageRecoveries();
      const url = URL.createObjectURL(
        new Blob([recoveryJson({version: 1, entries})], {type: 'application/json'}),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = 'markflow-recovery.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setLoadError('恢复备份读取失败，原始数据未改写：' + String(error));
      void reportFailure({category: 'storage-unreadable', detail: String(error), cause: error});
    }
  };
  // 通知面：**多条并存** ✓ ⇒ ⇒ 后一条不盖掉前一条 ✓ ⇒ ⇒ 各自可关 ✓。
  // **三个状态各走各的** ✓ ⇒ ⇒ 不再是"谁先来谁显示" ✓ ⇒ ⇒ 后来的不盖掉前面的 ✓
  // ⇒ ⇒ 一个状态顶掉另一个这件事没了 ✓（那正是那条 `||` 短路的病 ✓）。
  const recoveryNotice =
    loadError || actionError || storageWarnings.length > 0 || recoveryCount > 0 ? (
      <aside role="alert" className="text-sm bg-amber-950 text-amber-100">
        {actionError && <p className="px-4 py-2">{actionError}</p>}
        {loadError && <p className="px-4 py-2">{loadError}</p>}
        {storageWarnings.length > 0 && <p className="px-4 py-2">{storageWarnings.join('；')}</p>}
        {recoveryCount > 0 && (
          <p className="px-4 py-2">
            发现 {recoveryCount} 项损坏或不支持的存储记录，原始数据已保留。
          </p>
        )}
        {(recoveryCount > 0 || loadError) && (
          <p className="px-4 pb-2">
            <button
              className="underline"
              onClick={() => {
                reportAsync('storage-unreadable', downloadRecovery());
              }}
            >
              下载恢复备份
            </button>
          </p>
        )}
      </aside>
    ) : null;

  // 当前活动文档
  // **当下是哪一个文档** ✓ ⇒ ⇒ 选目标时要知道拿哪一份比 ✓。
  currentDocument.current = currentDocId;
  const currentSession = sessions.documentIds.includes(currentDocId)
    ? sessions.read(currentDocId)
    : undefined;
  const currentDoc = currentSession?.document;
  const isDirty = currentSession?.dirty ?? false;
  /**
   * **这个文档与磁盘的关系** ✓ ⇒ ⇒ 界面读它派生出来的那一个状态 ✓（§8.6 ✓）
   * ⇒ ⇒ 界面不自己判断 ✓ ⇒ ⇒ 各处不各判一遍 ✓。
   */
  const currentContext = currentDoc ? contexts.read(currentDoc.id) : undefined;
  const syncStatus = syncStatusOf(currentContext, currentDoc?.revision ?? 0);
  /**
   * **顶栏那个控件的形状** ✓ ⇒ ⇒ **可用性是派生出来的** ✓ ⇒ ⇒ 界面不自己判 ✓（§8.6 ✓）。
   *
   * **三种关联状态，三个形状** ✓ ⇒ ⇒ **关联状态来自读判断** ✓ ⇒ ⇒ 不是写失败推出来的 ✓（§8.2 ✓）。
   *
   * **Web 端整组灰掉** ✓ ⇒ ⇒ 那里永远选不到新目标 ✓ ⇒ ⇒ 另存为也不在那个菜单里 ✓（§8.2 ✓）。
   */
  const saveView = saveControlView(bindingState(currentContext), desktop);
  const kind = previewMode === 'a4' ? 'preview.a4' : 'preview.flow';
  const previewView: PreviewView =
    preview.documentId === currentDocId && preview.kind === kind
      ? preview
      : {documentId: currentDocId, kind, state: 'pending'};

  const persist = async (doc: DocumentRecord): Promise<boolean> => {
    try {
      await saveSource(sessions, doc, saveDocument);
      sessionChanged((value) => value + 1);
      return true;
    } catch (error) {
      // **不再弹窗** ✓ ⇒ ⇒ 不打断正在做的事 ✓ ⇒ ⇒ 原文只进控制台 ✓ ⇒ ⇒ 用户看一句可行动的话 ✓。
      // **这一条是草稿没存住** ✓ ⇒ ⇒ 落 IndexedDB 失败 ✓ ⇒ ⇒ 报 `storage-write-failed` ✓
      // ⇒ ⇒ **不是"保存失败"** ✓ ⇒ ⇒ "保存"现在指写回文件 ✓（§6.4 ✓）⇒ ⇒ 写回失败是另一条 ✓。
      await reportFailure({
        category: 'storage-write-failed',
        message:
          '这次改动没能存下来（' + doc.meta.title + '，Rev ' + doc.revision + '），内容仍在工作区',
        detail: String(error),
        cause: error,
      });
      return false;
    }
  };
  // **草稿落盘那一个入口** ✓ ⇒ ⇒ **它自己自动发生** ✓ ⇒ ⇒ **与写回不接成一个流程** ✓（§6.1 ✓）。
  const queueSave = (doc: DocumentRecord) => {
    const prior = pendingSaves.current.get(doc.id);
    if (prior) clearTimeout(prior.timer);
    const timer = setTimeout(() => {
      pendingSaves.current.delete(doc.id);
      void persist(doc);
    }, 700);
    pendingSaves.current.set(doc.id, {timer, doc});
  };
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (pendingSaves.current.size || sessions.documentIds.some((id) => sessions.read(id).dirty)) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, []);

  const capturePosition = () => {
    if (!currentDoc || !sessions.documentIds.includes(currentDoc.id)) return;
    tabHeadings.current.set(currentDoc.id, activeHeadingId);
    if (editorTextareaRef.current) {
      lastEditorGeometry.current = editorGeometry(editorTextareaRef.current);
      tabEditorGeometry.current.set(currentDoc.id, lastEditorGeometry.current);
    }
    const old = sessions.read(currentDoc.id).position,
      editor = editorTextareaRef.current,
      view = previewContainerRef.current;
    sessions.setPosition(currentDoc.id, {
      ...old,
      ...(editor
        ? {
            sourceAnchor: sourceAnchorAt(editor.scrollTop, editorGeometry(editor)),
            editorLayoutKey: editorGeometry(editor).layoutKey ?? '',
          }
        : {}),
      selectionStart: editor?.selectionStart ?? old.selectionStart,
      selectionEnd: editor?.selectionEnd ?? old.selectionEnd,
      scrollTop: editor?.scrollTop ?? old.scrollTop,
      scrollLeft: editor?.scrollLeft ?? old.scrollLeft,
      previewScrollTop: view?.scrollTop ?? old.previewScrollTop,
    });
  };
  const selectDocument = (id: string) => {
    capturePosition();
    const doc = sessions.documentIds.includes(id)
      ? sessions.read(id).document
      : documents.find((value) => value.id === id);
    if (!doc) return;
    try {
      sessions.open(doc);
      setTabs(sessions.documentIds);
      setCurrentDocId(id);
      setMathMode(sessions.read(id).document.options.mathMode);
      setPreviewMode(tabModes.current.get(id) ?? 'flow');
      setActiveHeadingId(tabHeadings.current.get(id) ?? null);
      restorePreview.current = id;
      placements.current = {editor: null, preview: null};
      pendingPreviewLine.current = undefined;
    } catch (error) {
      setActionError('这个文档没能打开：' + String(error));
      void reportFailure({category: 'document-open-failed', detail: String(error), cause: error});
    }
  };
  const removeSession = (id: string) => {
    const active = sessions.activeDocumentId === id;
    if (sessions.documentIds.includes(id)) sessions.close(id, true);
    runtime.current?.forget(id);
    tabModes.current.delete(id);
    tabHeadings.current.delete(id);
    tabEditorGeometry.current.delete(id);
    setTabs(sessions.documentIds);
    if (active) {
      const next = sessions.activeDocumentId;
      setCurrentDocId(next ?? '');
      setPreviewMode(next ? (tabModes.current.get(next) ?? 'flow') : 'flow');
      if (next) setMathMode(sessions.read(next).document.options.mathMode);
      setActiveHeadingId(next ? (tabHeadings.current.get(next) ?? null) : null);
      restorePreview.current = next;
      placements.current = {editor: null, preview: null};
      pendingPreviewLine.current = undefined;
    }
    if (!sessions.documentIds.length) runtime.current?.clear();
    /*
     * **关掉标签页 ⇒ ⇒ 句柄放掉** ✓ ⇒ ⇒ 绑定不留着 ✓ ⇒ ⇒ 原生侧不留可用的凭据 ✓（M4-8 ✓）。
     * **没有绑定的文档** ⇒ ⇒ 没有句柄可放 ✓ ⇒ ⇒ 这一步是空的 ✓。
     */
    void releaseDocumentFileContext(contexts, id, releaseNativeFile).catch(() => {});
  };
  const closeTab = async (id: string) => {
    if (!sessions.documentIds.includes(id)) return;
    const value = sessions.read(id);
    const context = contexts.read(id);
    // **关之前那几步在应用层** ✓ ⇒ ⇒ 这里只管把端口接上 ✓ ⇒ ⇒ 规则只有一处 ✓。
    await closeTabBeforeClose(value.document, syncStatusOf(context, value.document.revision), {
      // **问一句** ✓ ⇒ ⇒ **说清关掉会怎样** ✓ ⇒ ⇒ 用户知道自己在答应什么 ✓。
      confirm: async (reason) =>
        confirmPrompt.ask({
          title: CONFIRM_TEXTS.closeTab.title,
          description: CLOSE_TAB_TEXTS[reason],
          subject: undefined,
          confirmLabel: CONFIRM_TEXTS.closeTab.confirm,
          cancelLabel: CONFIRM_TEXTS.cancel,
        }),
      persist: async (doc) => {
        // **去抖里那一次不等了** ✓ ⇒ ⇒ 落盘落的是当下这一份 ✓。
        const pending = pendingSaves.current.get(doc.id);
        if (pending) clearTimeout(pending.timer);
        pendingSaves.current.delete(doc.id);
        return persist(doc);
      },
      // **也在飞** ✓ ⇒ ⇒ 另存为切换之前等它 ✓ ⇒ ⇒ **顺序有保证** ✓（M5-11 ✓）。
      writeBack: (doc) => startWriteBack(doc),
    });
    // **关得掉** ✓ ⇒ ⇒ **标签页不会再被困住** ✓ ⇒ ⇒ 写不进去也关 ✓（§16 ✓）。
    if (id === currentDocId) capturePosition();
    removeSession(id);
  };
  useEffect(() => {
    if (currentDoc && !runtime.current) {
      setPreview({
        documentId: currentDoc.id,
        kind,
        state: 'error',
        error: '预览引擎未就绪，请保存文档后重新加载。',
      });
      return;
    }
    if (currentDoc && runtime.current) {
      try {
        runtime.current.activate(currentDoc.id, kind);
      } catch (error) {
        setPreview({documentId: currentDoc.id, kind, state: 'error', error: String(error)});
      }
    }
  }, [currentDocId, currentDoc?.revision, kind, tabs.join('|')]);
  useLayoutEffect(() => {
    if (!currentDoc) return;
    const position = sessions.read(currentDoc.id).position,
      editor = editorTextareaRef.current;
    if (editor) {
      const geometry = editorGeometry(editor),
        top =
          position.sourceAnchor && position.editorLayoutKey !== geometry.layoutKey
            ? sourceAnchorTop(position.sourceAnchor, geometry)
            : position.scrollTop;
      editor.setSelectionRange(position.selectionStart, position.selectionEnd);
      syncPosition(editor, 'editor', top, position.sourceAnchor?.line ?? null);
      editor.scrollLeft = position.scrollLeft;
      lastEditorGeometry.current = geometry;
      tabEditorGeometry.current.set(currentDoc.id, geometry);
    }
  }, [currentDocId, showEditor, softWrap, contentMaxWidth, sidebarOpen, showPreview]);
  // 行数按修订 memo 一份 ✓：滚动事件可达 60Hz ✓，每个事件都把全文切一遍是白扔的垃圾 ✓。
  const totalLines = useMemo(
    () => (currentDoc ? currentDoc.markdown.split('\n').length : 0),
    [currentDoc?.markdown],
  );
  const previewPoints = () => {
    const view = previewContainerRef.current;
    return view && currentDoc ? previewSourcePoints(view, totalLines) : [];
  };
  const positionPreview = (line: number) => {
    const view = previewContainerRef.current;
    if (view) {
      previewLine.current = line;
      syncPosition(view, 'preview', interpolate(previewPoints(), line, 'line'), line);
    }
  };
  useLayoutEffect(() => {
    if (!currentDoc || previewView.state !== 'ready' || !showPreview) return;
    const view = previewContainerRef.current;
    if (!view) return;
    const target = pendingPreviewLine.current;
    if (target?.documentId === currentDoc.id) {
      positionPreview(target.line);
      pendingPreviewLine.current = undefined;
      restorePreview.current = undefined;
    } else if (restorePreview.current === currentDoc.id) {
      const saved = sessions.read(currentDoc.id).position;
      syncPosition(view, 'preview', saved.previewScrollTop, saved.sourceAnchor?.line ?? null);
      previewLine.current = interpolate(previewPoints(), view.scrollTop, 'top');
      restorePreview.current = undefined;
    } else if (syncScroll && editorTextareaRef.current) {
      positionPreview(
        editorLineAt(
          editorTextareaRef.current.scrollTop,
          editorGeometry(editorTextareaRef.current),
        ),
      );
    } else positionPreview(previewLine.current);
  }, [
    currentDocId,
    previewView.state,
    previewView.referenceId,
    showPreview,
    showEditor,
    previewMode,
    contentMaxWidth,
    sidebarOpen,
    softWrap,
  ]);
  useEffect(() => {
    const view = previewContainerRef.current,
      editor = editorTextareaRef.current;
    if (!view || previewView.state !== 'ready') return;
    let frame: number | undefined;
    const observer = new ResizeObserver(() => {
      if (frame === undefined)
        frame = requestAnimationFrame(() => {
          frame = undefined;
          if (syncScroll && editor)
            positionPreview(editorLineAt(editor.scrollTop, editorGeometry(editor)));
          else positionPreview(previewLine.current);
        });
    });
    observer.observe(view);
    if (editor) observer.observe(editor);
    return () => {
      observer.disconnect();
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [
    currentDocId,
    previewView.state,
    previewView.referenceId,
    showPreview,
    showEditor,
    syncScroll,
  ]);

  // 文档切换或加载时，确保大纲高亮同步指向当前有效章节
  useEffect(() => {
    if (currentDoc) {
      if (currentDoc.id !== currentDocId) setCurrentDocId(currentDoc.id);
      setMathMode(currentDoc.options.mathMode);
      const outline = extractOutline(currentDoc.markdown);
      const firstHeading = outline[0];
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

  const applyDocument = (doc: DocumentRecord) => {
    sessions.update(doc);
    setDocuments((previous) => previous.map((value) => (value.id === doc.id ? doc : value)));
    sessionChanged((value) => value + 1);
    queueSave(doc);
  };
  const handleMarkdownChange = useCallback(
    (markdown: string) => {
      if (!currentDoc) return;
      if (markdown.length > DOCUMENT_MARKDOWN_MAX) {
        setActionError(messageText('input-too-large', {limitChars: DOCUMENT_MARKDOWN_MAX}));
        void reportFailure({category: 'input-too-large'});
        return;
      }
      const doc = {...currentDoc, revision: currentDoc.revision + 1, markdown};
      const title = deriveDocumentTitle(markdown);
      if (title) doc.meta = {...doc.meta, title};
      applyDocument(doc);
    },
    [currentDoc],
  );
  const history = (direction: 'undo' | 'redo') => {
    if (!currentDoc) return;
    if (sessions[direction](currentDoc.id)) {
      const doc = sessions.read(currentDoc.id).document;
      setDocuments((previous) => previous.map((value) => (value.id === doc.id ? doc : value)));
      sessionChanged((value) => value + 1);
      setMathMode(doc.options.mathMode);
      queueSave(doc);
    }
  };
  const handleUndo = () => history('undo');
  const handleRedo = () => history('redo');

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
        currentDoc.markdown.substring(0, start) + replacement + currentDoc.markdown.substring(end);

      handleMarkdownChange(newValue);

      setTimeout(() => {
        textarea.focus();
        const newCursorPos = start + before.length + selected.length;
        textarea.setSelectionRange(newCursorPos, newCursorPos);
      }, 0);
    },
    [currentDoc, handleMarkdownChange],
  );

  /**
   * **立即落盘** ✓：去抖里那一次不等了 ✓ ⇒ ⇒ **两端一样** ✓（§6.4 ✓）。
   */
  const flushDraft = async (doc: DocumentRecord) => {
    const pending = pendingSaves.current.get(doc.id);
    if (pending) clearTimeout(pending.timer);
    pendingSaves.current.delete(doc.id);
    await persist(doc);
  };

  /**
   * **反向同步回填** ✓：把文件的当前内容放进草稿 ✓ ⇒ ⇒ 交回落定后的修订 ✓（§6.5 ✓）。
   *
   * **本地改动不保留** ✓ ⇒ ⇒ 那是用户选的那一次 ✓ ⇒ ⇒ **修订照样往前** ✓ ⇒ ⇒ 基线跟着它 ✓。
   */
  const applyPulledToDraft = (documentId: string, markdown: string): number => {
    const current = sessions.read(documentId).document;
    const doc: DocumentRecord = {...current, markdown, revision: current.revision + 1};
    const title = deriveDocumentTitle(markdown);
    if (title) doc.meta = {...doc.meta, title};
    sessions.update(doc);
    sessionChanged((value) => value + 1);
    setDocuments((previous) => previous.map((value) => (value.id === doc.id ? doc : value)));
    return doc.revision;
  };
  applyPulled.current = applyPulledToDraft;

  /**
   * **写回文件** ✓（§6.4 ✓、§6.5 ✓）：**保存 = 写回文件** ✓ ⇒ ⇒ 写的是**冻结的那一份** ✓。
   *
   * **草稿不在这一步落** ✓ ⇒ ⇒ 草稿那边**自己自动落** ✓ ⇒ ⇒ **两边差一个按键也没关系** ✓（§6.1 ✓）。
   *
   * **没有同步目标** ⇒ ⇒ **入口已经灰掉** ✓ ⇒ ⇒ 走不到这一步 ✓（§8.2 ✓）。
   */
  /**
   * **在飞的那一次写回** ✓ ⇒ ⇒ 另存为切换之前要等它 ✓ ⇒ ⇒ **M5-11** ✓。
   *
   * **迟到的那次只影响原上下文** ✓ ⇒ ⇒ 由 `applied` 核对绑定身份保证 ✓ ⇒ ⇒
   * **切换与它不冲突** ✓ ⇒ ⇒ **只是顺序** ✓。
   */
  const pendingWrite = useRef<Promise<unknown> | null>(null);
  const writeBackDocument = async (doc: DocumentRecord) => {
    const context = contexts.read(doc.id);
    // **没有同步目标** ⇒ ⇒ **入口已经灰掉** ✓ ⇒ ⇒ 走不到这一步 ✓（§8.2 ✓）。
    if (context === undefined) return undefined;
    let bytes: Uint8Array;
    try {
      // **待写字节随源格式而异** ✓ ⇒ ⇒ **冻结的那一份** ✓ ⇒ ⇒ 草稿与文件差一个按键不会发生 ✓（§6.1 ✓）。
      bytes = await sourceBytes.bytesFor(doc, context.file.sourceFormat);
    } catch (error) {
      await reportFailure({category: 'save-failed', detail: String(error), cause: error});
      return undefined;
    }
    const outcome = await syncer.current!.save({document: doc, bytes});
    // **写回失败** ⇒ ⇒ 报**保存文件错误** ✓ ⇒ ⇒ 草稿不动 ✓ ⇒ ⇒ 状态区那一行说现在是什么状态 ✓（§9 ✓）。
    if (outcome.writeBack.kind === 'failed')
      await reportFailure({
        category: 'save-failed',
        detail: String(outcome.writeBack.error),
        cause: outcome.writeBack.error,
      });
    // **反馈说"刚才那一次"** ✓ ⇒ ⇒ 常驻行说"现在是什么状态" ✓ ⇒ ⇒ 不重复 ✓（§6.1 ✓）。
    const feedback = syncFeedback(outcome);
    if (feedback)
      pushNotice({
        tone: SYNC_FEEDBACK_TONES[feedback.kind],
        message: SYNC_FEEDBACK_TEXTS[feedback.kind],
      });
    sessionChanged((value) => value + 1);
    return outcome.writeBack;
  };
  /**
   * **把这一次记成"在飞"** ✓ ⇒ ⇒ 另存为切换之前等它 ✓ ⇒ ⇒ 顺序有保证 ✓（M5-11 ✓）。
   *
   * **失败也要等完** ✓ ⇒ ⇒ 别让一次失败把切换卡住 ✓ ⇒ ⇒ 失败自己报它自己 ✓。
   */
  const startWriteBack = (doc: DocumentRecord) => {
    const run = writeBackDocument(doc);
    pendingWrite.current = run.catch(() => {});
    return run;
  };

  /**
   * **写到新目标** ✓（§8.2 ✓）：**关联为空时那一次保存** ✓ ⇒ ⇒ 弹原生对话框 ✓ ⇒ ⇒
   * **文件名留空** ✓ ⇒ ⇒ 用户自己填 ✓ ⇒ ⇒ **写成功即建立关联** ✓ ⇒ ⇒
   * **这一份还是这一份** ✓ ⇒ ⇒ 草稿一个字不动 ✓。
   */
  const saveToNewTarget = async (doc: DocumentRecord) => {
    // **没有绑定 ⇒ ⇒ 载荷类型按 Markdown 算** ✓ ⇒ ⇒ **那是应用里新建的那一份** ✓。
    const suggestion = exportFile(doc.meta.title || doc.id, 'markdown');
    let bytes: Uint8Array;
    try {
      bytes = await sourceBytes.bytesFor(doc, 'markdown');
    } catch (error) {
      await reportFailure({category: 'save-failed', detail: String(error), cause: error});
      return undefined;
    }
    const result = await saveTo.current!.saveTo({
      document: doc,
      bytes,
      suggestedName: suggestion.name,
    });
    if (result.kind === 'cancelled') {
      // **取消不是失败** ✓ ⇒ ⇒ 一句告知 ✓（§9 ✓）。
      pushNotice({tone: 'info', message: SAVE_TO_TEXTS.cancelled});
      return undefined;
    }
    if (result.kind === 'already-bound') {
      pushNotice({tone: 'warning', message: SAVE_TO_TEXTS.alreadyBound});
      return undefined;
    }
    if (result.kind === 'unconfirmed') {
      // **写出去了，但读没有确认** ✓ ⇒ ⇒ **关联不成立** ✓ ⇒ ⇒ 说清那一句 ✓（§8.5 ✓）。
      pushNotice({tone: 'warning', message: SAVE_TO_TEXTS.unconfirmed});
      return undefined;
    }
    if (result.kind === 'failed') {
      await reportFailure({
        category: 'save-failed',
        detail: String(result.error),
        cause: result.error,
      });
      return undefined;
    }
    pushNotice({tone: 'success', message: SAVE_TO_TEXTS.saved});
    sessionChanged((value) => value + 1);
    return result;
  };

  const handleWriteBack = async () => {
    const doc = currentDoc;
    if (!doc) return;
    // **关联为空 ⇒ ⇒ 这一次保存是"写到新目标"** ✓ ⇒ ⇒ 写成功即建立关联 ✓（§8.2 ✓）。
    if (contexts.read(doc.id) === undefined) {
      await saveToNewTarget(doc);
      return;
    }
    await startWriteBack(doc);
  };

  /**
   * **另存为** ✓（§6.2 ✓）：**产生另一个文档** ✓ ⇒ ⇒ 旧文档不受影响 ✓。
   */
  const handleSaveAs = async () => {
    const doc = currentDoc;
    if (!doc) return;
    // **载荷类型随这份文档** ✓ ⇒ ⇒ 另存的那一份是同一种形状 ✓ ⇒ ⇒ 建议的文件名复用导出契约 ✓（§6.2 ✓）。
    const format = contexts.read(doc.id)?.file.sourceFormat ?? 'markdown';
    const suggestion = exportFile(doc.meta.title || doc.id, format);
    let bytes: Uint8Array;
    try {
      bytes = await sourceBytes.bytesFor(doc, format);
    } catch (error) {
      await reportFailure({category: 'save-failed', detail: String(error), cause: error});
      return;
    }
    const result = await saver.current!.saveAs({
      document: doc,
      bytes,
      suggestedName: suggestion.name,
    });
    if (result.kind === 'cancelled') {
      pushNotice({tone: 'info', message: SAVE_AS_TEXTS.cancelled});
      return;
    }
    if (result.kind === 'already-bound') {
      pushNotice({tone: 'warning', message: SAVE_AS_TEXTS.alreadyBound});
      return;
    }
    if (result.kind === 'unconfirmed') {
      // **写出去了，但读没有确认** ✓ ⇒ ⇒ **关联不成立** ✓ ⇒ ⇒ 说清那一句 ✓（§8.5 ✓）。
      pushNotice({tone: 'warning', message: SAVE_AS_TEXTS.unconfirmed});
      return;
    }
    if (result.kind === 'failed') {
      await reportFailure({
        category: 'save-failed',
        detail: String(result.error),
        cause: result.error,
      });
      return;
    }
    // **等已发出的同步完成再切换** ✓ ⇒ ⇒ **M5-11** ✓ ⇒ ⇒
    // **迟到的那次只影响原上下文** ✓ ⇒ ⇒ 那边自己核对绑定身份 ✓ ⇒ ⇒ **顺序有保证** ✓。
    if (pendingWrite.current) await pendingWrite.current;
    // **成功** ⇒ ⇒ **新文档** ✓ ⇒ ⇒ 初始即已同步 ✓ ⇒ ⇒ **切过去** ✓ ⇒ ⇒ 旧文档一个字不动 ✓（§6.2 ✓）。
    openSaved.current(result.document);
    pushNotice({tone: 'success', message: SAVE_AS_TEXTS.saved});
  };

  /**
   * **快捷键** ✓：`Ctrl/Cmd+S` ✓ ⇒ ⇒ **桌面端与按钮完全相同的动作** ✓（§6.3 ✓）
   * ⇒ ⇒ 写回文件 ✓；**Web 端没有同步目标** ⇒ ⇒ **立即落盘** ✓（§8.2 ✓）。
   */
  const handleShortcutSave = useCallback(async () => {
    const doc = currentDoc;
    if (!doc) return;
    // **去抖里那一次不等了** ✓ ⇒ ⇒ 桌面端由写回那一步落盘 ✓ ⇒ ⇒ 不会存两遍 ✓。
    if (desktop) {
      // **去抖里那一次不等了** ✓ ⇒ ⇒ 写回那一步落盘 ✓ ⇒ ⇒ 不会存两遍 ✓。
      const pending = pendingSaves.current.get(doc.id);
      if (pending) clearTimeout(pending.timer);
      pendingSaves.current.delete(doc.id);
      await handleWriteBack();
      return;
    }
    await flushDraft(doc);
  }, [currentDoc, desktop]);

  /**
   * **`Ctrl/Cmd+S`** ✓（设计 §6.3 ✓）：**桌面端与按钮完全相同的动作** ✓ ⇒ ⇒ 写回文件 ✓；
   * **Web 端没有同步目标** ⇒ ⇒ **立即落盘** ✓（§8.2 ✓）。
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isSaveShortcut(event)) return;
      event.preventDefault();
      if (exportModalOpen) return;
      reportAsync('save-failed', handleShortcutSave());
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleShortcutSave, exportModalOpen]);

  openSaved.current = (doc: DocumentRecord) => {
    capturePosition();
    sessions.open(doc);
    setDocuments((previous) => [doc, ...previous.filter((value) => value.id !== doc.id)]);
    setTabs(sessions.documentIds);
    setCurrentDocId(doc.id);
    setMathMode(doc.options.mathMode);
    setPreviewMode('flow');
    restorePreview.current = doc.id;
  };
  const addDocument = async (doc: DocumentRecord): Promise<OpenResult> => {
    const inSession = sessions.documentIds.includes(doc.id);
    const existing = inSession
      ? sessions.read(doc.id).document
      : documents.find((value) => value.id === doc.id);
    if (inSession || existing) {
      // **聚焦已有那一份** ✓ ⇒ ⇒ **不覆盖草稿** ✓ ⇒ ⇒ 把它给出去 ✓
      // ⇒ ⇒ 好按内容比较基线 ✓（§2.3 ✓、§5.5 ✓）。
      selectDocument(doc.id);
      return {status: 'focused', existing};
    }
    if (sessions.documentIds.length >= 32)
      throw new Error('最多同时打开32个文档，请先关闭一个标签页。');
    await saveDocument(doc);
    // Capture the currently displayed session when the write completes, not when file reading began.
    openSaved.current(doc);
    return {status: 'opened'};
  };
  importOpen.current = addDocument;
  const handleCreateDoc = () => {
    if (importBusy) return;
    setActionError('');
    void addDocument(createNewDocument('新建 Markdown 文档')).catch((error) => {
      setActionError('操作失败，原文档与编辑内容已保留：' + String(error));
      void reportFailure({category: 'storage-write-failed', detail: String(error), cause: error});
    });
  };
  const handleImportFiles = async (files: File[]) => {
    const service = importer.current;
    if (!service || service.busy) return;
    setImportBusy(true);
    setImportResults([]);
    try {
      const result = await service.run(files);
      if (result.status === 'completed') setImportResults(result.items);
    } catch (error) {
      setImportResults([{name: '导入', status: 'failed', message: String(error)}]);
      void reportFailure({category: 'import-rejected', detail: String(error), cause: error});
    } finally {
      setImportBusy(false);
    }
  };
  /*
   * **桌面端：选择器与拖放进同一个批次** ✓ ⇒ ⇒ 去重行为一致 ✓（M4-6 ✓）。
   */
  const runNativeBatch = async (files: readonly NativeSelection[]) => {
    const service = nativeImporter.current;
    if (!service) {
      // **批次还没起来** ✓ ⇒ ⇒ 这一批不用 ✓ ⇒ ⇒ 原生侧已经为它们签发了句柄 ✓
      // ⇒ ⇒ 放掉 ✓ ⇒ ⇒ 原生侧不留无主的凭据 ✓（§5.1 ✓）。
      for (const file of files) void releaseNativeFile(file.key).catch(() => {});
      return;
    }
    if (service.busy) {
      // **上一批还没走完** ✓ ⇒ ⇒ 这一批不用 ✓ ⇒ ⇒ **交给批次去放掉** ✓
      // ⇒ ⇒ 那条规则在应用层 ✓（§5.1 ✓）⇒ ⇒ 这里不碰忙碌状态 ✓。
      await service.run(files);
      return;
    }
    setImportBusy(true);
    setImportResults([]);
    try {
      const result = await service.run(files);
      if (result.status === 'completed') {
        setImportResults(result.items);
        // **命中既有绑定的都聚焦** ✓ ⇒ ⇒ 不止第一个 ✓ ⇒ ⇒ 不新建、不覆盖 ✓（M4-4 ✓）。
        for (const item of result.items) {
          if (
            (item.status === 'focused' || item.status === 'changed' || item.status === 'missing') &&
            item.documentId
          )
            selectDocument(item.documentId);
        }
      }
    } catch (error) {
      setImportResults([{name: '打开', status: 'failed', message: String(error)}]);
      void reportFailure({category: 'import-rejected', detail: String(error), cause: error});
    } finally {
      setImportBusy(false);
    }
  };
  nativeFlow.current = runNativeBatch;
  const handleOpenNative = async () => {
    if (importBusy) return;
    let files: NativeSelection[] | undefined;
    try {
      files = await selectNativeOpen();
    } catch (error) {
      // **对话框打不开** ✓ ⇒ ⇒ 按机器码说那句话 ✓ ⇒ ⇒ 不是"有个操作没能完成" ✓（§9 ✓）。
      setImportResults([
        {
          name: '打开',
          status: 'failed',
          message: error instanceof Error ? error.message : String(error),
        },
      ]);
      void reportFailure({category: 'import-rejected', detail: String(error), cause: error});
      return;
    }
    // **用户没选** ⇒ ⇒ 什么都不做 ✓ ⇒ ⇒ 不是失败 ✓（§9 ✓）。
    if (!files || !files.length) return;
    await runNativeBatch(files);
  };
  /*
   * **桌面端才有的两件事** ✓：那个"打开"入口 ✓ 与拖放 ✓（§8.1 ✓、§5.4 ✓）。
   *
   * **拖放与选择器进同一个批次** ✓ ⇒ ⇒ 去重行为一致 ✓（M4-6 ✓）。
   * **订阅只订一次** ✓ ⇒ ⇒ 回调走 ref ✓ ⇒ ⇒ 拿到的却是当下的那份 ✓。
   */
  useEffect(() => {
    reportAsync('app-internal-failed', isDesktopRuntime().then(setDesktop));
  }, []);
  useEffect(() => {
    if (!desktop) return;
    const opener = nativeOpener.current;
    if (!opener) return;
    if (!nativeImporter.current)
      nativeImporter.current = createNativeSourceImport(
        {boundSelection: (file) => opener.bound(file)},
        (doc, file) => opener.open(doc, file),
      );
    let stop: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      const unlisten = await listenNativeDrop((files) => {
        reportAsync('import-rejected', nativeFlow.current(files));
      });
      if (cancelled) {
        unlisten();
        return;
      }
      stop = unlisten;
    })().catch((error) => {
      // **自己接住** ✓ ⇒ ⇒ 不留一个没人管的拒绝 ✓ ⇒ ⇒ 那一条拒绝曾让日志只说"出了个拒绝" ✓ ⇒ ⇒
      // **报出来并说清在哪儿** ✓ ⇒ ⇒ 拖放监听没注册上这件事**日志里看得见** ✓ ⇒ ⇒
      // 不用再开控制台找那一行 ✓。
      void reportFailure({
        category: 'rejection',
        detail: String(error),
        cause: error,
        source: hereSource(),
      });
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [desktop]);
  // 导入的忙碌与结果：**进右下消息区** ✓（设计 §3 ✓）⇒ ⇒ 归属还在这里 ✓
  // ⇒ ⇒ 只是换了个形状与位置 ✓ ⇒ ⇒ 文字与动作照旧 ✓。
  const importMessage = importBusy ? (
    <MessageCard body="正在读取、校验并导入文件…" role="status" />
  ) : importResults.length > 0 ? (
    <ImportResultNotice
      key={importResultBatch.id}
      items={importResults}
      onClose={() =>
        setImportResultBatch((current) =>
          current.id === importResultBatch.id ? {id: current.id + 1, items: []} : current,
        )
      }
    />
  ) : null;
  // 消息区：**两种界面状态共用一处** ✓ ⇒ ⇒ 通知与导入结果始终在同一个区域里 ✓。
  // `tabIndex={-1}` ⇒ ⇒ 消息都收走后，焦点有个落点 ✓（设计 §9 ✓）。
  // 生命周期适配器通过最近的消息区域恢复焦点，不从按钮点击后的焦点反推区域。
  const messageRegion = (
    <MessageViewport
      id={messageRegionId}
      elementRef={messageRegionRef}
      colorScheme={isDark ? 'dark' : 'light'}
    >
      {demoMessages.demos.map((demo) => (
        <DemoMessageView
          key={demo.id}
          demo={demo}
          onDismiss={demoMessages.dismiss}
          onExited={demoMessages.remove}
        />
      ))}
      <NoticeList />
      {importMessage}
    </MessageViewport>
  );
  /**
   * 删掉一份文档 ✓。
   *
   * **它不向外抛** ✓ ⇒ ⇒ 界面调用它不会变成一次未处理的拒绝 ✓ ⇒ ⇒
   * 日志里不会出现笼统的 rejection ✓ ⇒ ⇒ 失败是失败，不是崩溃 ✓。
   */
  const handleDeleteDoc = (id: string) => {
    void deleteFlow(id).catch((error) => {
      setActionError('操作失败，原文档与编辑内容已保留：' + String(error));
      void reportFailure({category: 'storage-write-failed', detail: String(error), cause: error});
    });
  };
  const deleteFlow = async (id: string) => {
    const doc = documents.find((value) => value.id === id);
    if (!doc) return;
    // **删之前问一句** ✓ ⇒ ⇒ 走应用内的对话框 ✓ ⇒ ⇒ 不靠宿主的 confirm ✓ ⇒ ⇒
    // 每一处都长一个样 ✓ ⇒ ⇒ 用户知道自己在答应什么 ✓。
    const confirmed = await confirmPrompt.ask({
      title: CONFIRM_TEXTS.delete.title,
      description: CONFIRM_TEXTS.delete.description,
      subject: doc.meta.title,
      confirmLabel: CONFIRM_TEXTS.delete.confirm,
      cancelLabel: CONFIRM_TEXTS.cancel,
    });
    if (!confirmed) return;
    setActionError('');
    const pending = pendingSaves.current.get(id);
    if (pending) clearTimeout(pending.timer);
    pendingSaves.current.delete(id);
    await deleteDocument(id);
    removeSession(id);
    setDocuments((previous) => previous.filter((value) => value.id !== id));
    // **删掉的正是当前打开的那一份 ⇒ ⇒ 工作区不能空着** ✓ ⇒ ⇒ 打开列表里的下一个 ✓。
    // **还有别的会话开着** ✓ ⇒ ⇒ 落点已经切过去了 ✓ ⇒ ⇒ 这里不用管 ✓。
    if (sessions.activeDocumentId) return;
    const next = nextDocumentAfterDeletion(documents, id);
    if (next) selectDocument(next.id);
  };

  const highlightLine = (line: number) => {
    if (!currentDoc) return;
    const outline = extractOutline(currentDoc.markdown);
    const heading = [...outline].reverse().find((value) => value.line <= line) ?? outline[0];
    setActiveHeadingId(heading?.id ?? null);
  };
  const handleScrollToHeading = (headingId: string, line?: number) => {
    if (!currentDoc) return;
    const target =
      line ?? extractOutline(currentDoc.markdown).find((value) => value.id === headingId)?.line;
    if (!target) return;
    setActiveHeadingId(headingId);
    const editor = editorTextareaRef.current;
    if (editor) {
      lastEditorGeometry.current = editorGeometry(editor);
      tabEditorGeometry.current.set(currentDoc.id, lastEditorGeometry.current);
    }
    const geometry = editor
      ? editorGeometry(editor)
      : (tabEditorGeometry.current.get(currentDoc.id) ?? {lineHeight: 24, paddingTop: 12});
    const top = editorTopAt(target, geometry);
    if (editor) syncPosition(editor, 'editor', top, target);
    const saved = sessions.read(currentDoc.id).position;
    sessions.setPosition(currentDoc.id, {
      ...saved,
      scrollTop: top,
      sourceAnchor: {line: target, offset: 0},
      editorLayoutKey: geometry.layoutKey ?? '',
    });
    if (previewView.state === 'ready' && previewContainerRef.current) positionPreview(target);
    else pendingPreviewLine.current = {documentId: currentDoc.id, line: target};
  };
  const handleEditorScroll = (_ratio: number, top: number) => {
    const editor = editorTextareaRef.current;
    if (!editor || !currentDoc) return;
    const geometry = editorGeometry(editor);
    lastEditorGeometry.current = geometry;
    tabEditorGeometry.current.set(currentDoc.id, geometry);
    if (isOwnScroll('editor', top)) return;
    const startLine = editorLineAt(top, geometry);
    highlightLine(editorLineAt(top + editor.clientHeight / 2, geometry));
    if (!syncScroll || previewView.state !== 'ready') return;
    const view = previewContainerRef.current;
    if (!view) return;
    const max = editor.scrollHeight - editor.clientHeight;
    if (top <= 2) syncPosition(view, 'preview', 0, 1);
    else if (max > 0 && top >= max - 3)
      syncPosition(view, 'preview', view.scrollHeight - view.clientHeight, totalLines);
    else positionPreview(startLine);
  };
  const handlePreviewScroll = (_ratio: number, top: number) => {
    const view = previewContainerRef.current;
    if (!view || !currentDoc || previewView.state !== 'ready') return;
    if (isOwnScroll('preview', top)) return;
    const points = previewPoints(),
      startLine = interpolate(points, top, 'top');
    previewLine.current = startLine;
    highlightLine(interpolate(points, top + view.clientHeight / 2, 'top'));
    const editor = editorTextareaRef.current;
    if (!syncScroll) return;
    if (!editor) {
      const saved = sessions.read(currentDoc.id).position,
        geometry = tabEditorGeometry.current.get(currentDoc.id) ?? {lineHeight: 24, paddingTop: 12},
        top = editorTopAt(startLine, geometry);
      sessions.setPosition(currentDoc.id, {
        ...saved,
        scrollTop: top,
        sourceAnchor: sourceAnchorAt(top, geometry),
        editorLayoutKey: '',
      });
      return;
    }
    const max = view.scrollHeight - view.clientHeight;
    if (top <= 2) syncPosition(editor, 'editor', 0, 1);
    else if (max > 0 && top >= max - 3)
      syncPosition(editor, 'editor', editor.scrollHeight - editor.clientHeight, totalLines);
    else syncPosition(editor, 'editor', editorTopAt(startLine, editorGeometry(editor)), startLine);
  };
  const changePreviewMode = (mode: 'flow' | 'a4') => {
    capturePosition();
    if (currentDoc) {
      const editor = editorTextareaRef.current;
      const line =
        previewView.state === 'ready' && previewContainerRef.current
          ? interpolate(previewPoints(), previewContainerRef.current.scrollTop, 'top')
          : editor
            ? editorLineAt(editor.scrollTop, editorGeometry(editor))
            : 1;
      tabModes.current.set(currentDoc.id, mode);
      pendingPreviewLine.current = {documentId: currentDoc.id, line};
      restorePreview.current = undefined;
    }
    setPreviewMode(mode);
  };

  const handleMathModeToggle = () => {
    const nextMode = mathMode === 'mathml' ? 'svg' : 'mathml';
    setMathMode(nextMode);
    if (currentDoc) {
      const updatedDoc: DocumentRecord = {
        ...currentDoc,
        revision: currentDoc.revision + 1,
        options: {
          ...currentDoc.options,
          mathMode: nextMode,
        },
      };
      applyDocument(updatedDoc);
    }
  };

  // All three panes are independent; the final visible pane cannot be hidden.
  const visibleCount = Number(sidebarOpen) + Number(showEditor) + Number(showPreview);
  const handleToggleSidebar = () => {
    capturePosition();
    if (!sidebarOpen || visibleCount > 1) setSidebarOpen((v) => !v);
  };
  const handleToggleEditor = () => {
    capturePosition();
    if (!showEditor || visibleCount > 1) setShowEditor((v) => !v);
  };
  const handleTogglePreview = () => {
    capturePosition();
    restorePreview.current = currentDocId;
    if (!showPreview && syncScroll && editorTextareaRef.current) {
      pendingPreviewLine.current = {
        documentId: currentDocId,
        line: editorLineAt(
          editorTextareaRef.current.scrollTop,
          editorGeometry(editorTextareaRef.current),
        ),
      };
      restorePreview.current = undefined;
    }
    if (!showPreview || visibleCount > 1) setShowPreview((v) => !v);
  };

  if (!currentDoc)
    return (
      <div className="h-screen flex flex-col bg-neutral-950 text-neutral-300">
        {recoveryNotice}
        {messageRegion}
        {loadComplete ? (
          <div className="flex flex-1 min-h-0">
            <Sidebar
              documents={documents}
              currentDocId=""
              onSelectDoc={selectDocument}
              onCreateDoc={handleCreateDoc}
              onDeleteDoc={handleDeleteDoc}
              onImportFiles={(files) => {
                reportAsync('import-rejected', handleImportFiles(files));
              }}
              {...(desktop
                ? {
                    onOpenNative: () => {
                      reportAsync('document-open-failed', handleOpenNative());
                    },
                  }
                : {})}
              importBusy={importBusy}
              onScrollToHeading={() => {}}
              currentMarkdown=""
            />
            <main className="flex-1 flex flex-col items-center justify-center gap-4">
              <p>选择文档以打开标签页，或新建文档。</p>
              <button
                onClick={handleCreateDoc}
                className="px-4 py-2 rounded bg-teal-700 text-white"
              >
                新建独立文档
              </button>
            </main>
          </div>
        ) : (
          <p role="status">正在初始化 MarkFlow 墨流工作台...</p>
        )}
      </div>
    );

  const lines = currentDoc.markdown.split('\n');
  const charCount = currentDoc.markdown.length;
  const wordCount = currentDoc.markdown.trim().split(/\s+/).filter(Boolean).length;
  const lineCount = lines.length;

  const tabBar = (
    <DocumentTabs
      tabs={tabs.map((id) => {
        const value = sessions.read(id);
        return {id, title: value.document.meta.title, dirty: value.dirty};
      })}
      activeId={currentDocId}
      onActivate={selectDocument}
      onClose={(id) => {
        reportAsync('app-internal-failed', closeTab(id));
      }}
    />
  );

  // `color-scheme` 让原生控件与消息模块的明暗跟着应用的开关走 ✓（设计 §5 ✓）。
  return (
    <div
      className={`isolate h-screen w-screen flex flex-col overflow-hidden ${isDark ? 'dark bg-neutral-950' : 'bg-neutral-100'}`}
      inert={exportModalOpen || undefined}
      style={{colorScheme: isDark ? 'dark' : 'light'}}
    >
      {recoveryNotice}
      {/* 3-Zone Top Bar */}
      <TopBar
        sidebarOpen={sidebarOpen}
        onToggleSidebar={handleToggleSidebar}
        showEditor={showEditor}
        showPreview={showPreview}
        onToggleEditor={handleToggleEditor}
        onTogglePreview={handleTogglePreview}
        softWrap={softWrap}
        onSoftWrapChange={(value) => {
          capturePosition();
          setSoftWrap(value);
          writeSoftWrapPreference(value);
        }}
        maxWidth={contentMaxWidth}
        onMaxWidthChange={(value) => {
          capturePosition();
          setContentMaxWidth(value);
        }}
        mathMode={mathMode}
        onMathModeToggle={handleMathModeToggle}
        isDark={isDark}
        onThemeToggle={() => setIsDark((prev) => !prev)}
        isDirty={isDirty}
        saveView={saveView}
        onWriteBack={() => reportAsync('save-failed', handleWriteBack())}
        onSaveAs={() => reportAsync('save-failed', handleSaveAs())}
        onOpenExport={() => setExportModalOpen(true)}
        exportButtonRef={exportButtonRef}
        onOpenRoadmap={() => setRoadmapModalOpen(true)}
        onOpenMessages={import.meta.env.DEV ? () => setMessageGalleryOpen(true) : undefined}
        documentTitle={currentDoc.meta.title}
        fileName={currentContext?.file.displayName}
        filePath={currentContext?.file.displayPath}
        syncStatus={syncStatus}
      />

      {/* Main Workbench Layout */}
      <div
        className="flex-1 flex overflow-x-auto overflow-y-hidden min-h-0 relative"
        data-workbench="true"
      >
        {/* Collapsible Left Sidebar (大纲与多文档工作区) */}
        <div
          data-view="outline"
          inert={!sidebarOpen}
          className={`transition-[width] duration-200 ease-in-out flex shrink-0 ${
            sidebarOpen ? (!showEditor && !showPreview ? 'w-full' : 'w-64') : 'w-0'
          } overflow-hidden relative`}
        >
          <Sidebar
            documents={documents}
            currentDocId={currentDocId}
            onSelectDoc={selectDocument}
            onCreateDoc={handleCreateDoc}
            onDeleteDoc={handleDeleteDoc}
            onImportFiles={(files) => {
              reportAsync('import-rejected', handleImportFiles(files));
            }}
            {...(desktop
              ? {
                  onOpenNative: () => {
                    reportAsync('document-open-failed', handleOpenNative());
                  },
                }
              : {})}
            importBusy={importBusy}
            onScrollToHeading={handleScrollToHeading}
            currentMarkdown={currentDoc.markdown}
            activeHeadingId={activeHeadingId}
            {...(visibleCount > 1 ? {onToggleCollapse: handleToggleSidebar} : {})}
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
        <div
          className="flex-1 flex flex-col overflow-hidden min-h-0"
          style={{
            display: showEditor || showPreview ? undefined : 'none',
            minWidth:
              (Number(showEditor) + Number(showPreview)) * 360 +
              (showEditor && showPreview ? 8 : 0),
          }}
        >
          {/* Unified Workbench Toolbar across Editor & Preview */}
          {showEditor && (
            <WorkbenchToolbar
              onInsertText={handleInsertText}
              onUndo={handleUndo}
              onRedo={handleRedo}
              canUndo={currentSession?.canUndo ?? false}
              canRedo={currentSession?.canRedo ?? false}
            />
          )}

          {/* Resizing changes workbench geometry only; content max-width remains independent. */}
          <ResizablePanes
            labelledBy={'tab-' + encodeURIComponent(currentDocId)}
            onBeforeResize={capturePosition}
            editor={
              showEditor ? (
                <>
                  <Editor
                    sessionId={currentDoc.id}
                    softWrap={softWrap}
                    value={currentDoc.markdown}
                    onChange={handleMarkdownChange}
                    onUndo={handleUndo}
                    onRedo={handleRedo}
                    canUndo={currentSession?.canUndo ?? false}
                    canRedo={currentSession?.canRedo ?? false}
                    textareaRef={editorTextareaRef}
                    onScroll={handleEditorScroll}
                    maxWidth={contentMaxWidth}
                  />
                  {tabBar}
                </>
              ) : null
            }
            preview={
              showPreview ? (
                <>
                  {/* 控件条：模式与同步都归 HTML 视图这一侧 ✓（设计 §2 ✓）。 */}
                  <HtmlViewControls
                    previewMode={previewMode}
                    onPreviewModeChange={changePreviewMode}
                    syncScroll={syncScroll}
                    onToggleSyncScroll={() => setSyncScroll((prev) => !prev)}
                    showSync={showEditor}
                  />
                  {previewMode === 'flow' ? (
                    <ReadingPreview
                      view={previewView}
                      theme={currentDoc.theme}
                      maxWidth={contentMaxWidth}
                      containerRef={previewContainerRef}
                      onScroll={handlePreviewScroll}
                    />
                  ) : (
                    <A4PagePreview
                      view={previewView}
                      containerRef={previewContainerRef}
                      onScroll={handlePreviewScroll}
                    />
                  )}
                </>
              ) : null
            }
          />
          {!showEditor && tabBar}
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
        syncStatus={syncStatus}
        onRetrySync={() => reportAsync('save-failed', handleWriteBack())}
      />

      {/* **冲突那一次提问** ✓ ⇒ ⇒ **走对话框不走通知** ✓ ⇒ ⇒ 决定留在原地 ✓（§8.6 ✓）。 */}
      {conflict.request ? (
        <ConflictDialog
          displayName={conflict.request.displayName}
          onChoose={(choice) => conflict.answer(choice)}
        />
      ) : null}

      {/* **删除那一次提问** ✓ ⇒ ⇒ 走对话框不走通知 ✓ ⇒ ⇒ 决定留在原地 ✓。 */}
      {confirmPrompt.request ? (
        <ConfirmDialog
          title={confirmPrompt.request.title}
          description={confirmPrompt.request.description}
          subject={confirmPrompt.request.subject}
          confirmLabel={confirmPrompt.request.confirmLabel}
          cancelLabel={confirmPrompt.request.cancelLabel}
          onConfirm={() => confirmPrompt.answer(true)}
          onCancel={() => confirmPrompt.answer(false)}
        />
      ) : null}

      {/* Export Modal */}
      <ExportModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        document={currentDoc}
        mathMode={mathMode}
        onNotice={pushNotice}
        messageRegionId={messageRegionId}
        returnFocusRef={exportButtonRef}
      />

      {/* 消息区：通知与导入结果都在这里 ✓（设计 §3 ✓ ⇒ ⇒ 一个区域 ✓）。 */}
      {messageRegion}

      {/* 消息视觉页 ✓：**只在开发构建里** ✓ ⇒ ⇒ 它是核对用的工具，不是产品功能 ✓。 */}
      {import.meta.env.DEV && messageGalleryOpen ? (
        <MessageGallery
          demos={demoMessages.demos}
          onPick={demoMessages.pick}
          onClear={demoMessages.clear}
          onClose={() => {
            setMessageGalleryOpen(false);
            demoMessages.clear();
          }}
        />
      ) : null}

      {/* Version Roadmap & 1.0 Audit Matrix Modal */}
      <RoadmapModal
        isOpen={roadmapModalOpen}
        onClose={() => setRoadmapModalOpen(false)}
        currentDoc={currentDoc}
      />
    </div>
  );
}
