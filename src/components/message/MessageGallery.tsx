import {useRef, type ReactNode} from 'react';
import {
  useMessageLifecycle,
  MessageCard,
  MessageResult,
  MessageStatusBar,
  type MessageTone,
} from '../../presentation/messages';

/**
 * 消息的**视觉页** ✓：点一个按钮 ⇒ ⇒ 那条消息就出现在**真实的右下区域**里 ✓。
 *
 * **它不是静态样板** ✓ ⇒ ⇒ 位置、堆叠、限高、滚动、宽度、换行都是真的 ✓
 * ⇒ ⇒ 看的就是工作台里那条消息 ✓ ⇒ ⇒ 核对视觉不必另找页面 ✓。
 *
 * **它不碰通知存储** ✓ ⇒ ⇒ 演示的消息使用独立的停留期限、不进 `noticeStore` ✓
 * ⇒ ⇒ 不会跟真消息混在一起 ✓ ⇒ ⇒ 关掉就是关掉这一条演示 ✓。
 */

export interface DemoMessage {
  /** 这一条的 id ✓（演示里用它做键 ✓）。 */
  id: string;
  /** 哪一种形状 ✓。 */
  kind: 'card' | 'status' | 'result';
  /** 语气 ✓。 */
  tone: MessageTone;
  /** 标题 ✓。 */
  title?: string;
  /** 正文 ✓。 */
  body?: string;
  /** 详情 ✓。 */
  detail?: string;
  /** 详情展开没有 ✓。 */
  open?: boolean;
  /** 结果的条目 ✓。 */
  items?: {label: string; detail?: string; failed?: boolean}[];
  /** 是不是一次告知 ✓ ⇒ ⇒ 那种定时自己走 ✓（与产品一致 ✓）。 */
  transient?: boolean;
  /** 正在退场 ✓ ⇒ ⇒ 渐隐往下沉 ✓。 */
  leaving?: boolean;
}

/** 演示里的一条 ✓：用真组件画 ✓ ⇒ ⇒ 看到的就是产品里的样子 ✓。 */
export function DemoMessageView({
  demo,
  onDismiss,
  onExited,
}: {
  demo: DemoMessage;
  onDismiss: (id: string) => void;
  onExited: (id: string) => void;
}): ReactNode {
  const elementRef = useRef<HTMLDivElement>(null);
  const dismiss = useMessageLifecycle({
    elementRef,
    leaving: demo.leaving,
    autoHideMs: demo.transient ? 6000 : undefined,
    onHide: () => onDismiss(demo.id),
    onExited: () => onExited(demo.id),
  });
  if (demo.kind === 'result') {
    return (
      <MessageResult
        elementRef={elementRef}
        title={demo.title ?? '操作结果'}
        tone={demo.tone}
        items={demo.items ?? []}
        role="status"
        closeLabel="关闭"
        leaving={demo.leaving}
        onClose={dismiss}
      />
    );
  }
  if (demo.kind === 'status') {
    return (
      <MessageStatusBar
        elementRef={elementRef}
        tone={demo.tone}
        title={demo.title ?? '持续状态'}
        body={demo.body}
        detail={demo.detail}
        expanded={demo.open ?? false}
        role="status"
        acknowledgeLabel="知道了"
        leaving={demo.leaving}
        onAcknowledge={dismiss}
      />
    );
  }
  return (
    <MessageCard
      elementRef={elementRef}
      tone={demo.tone}
      title={demo.title}
      body={demo.body ?? ''}
      detail={demo.detail}
      expanded={demo.open ?? false}
      role="status"
      leaving={demo.leaving}
      actions={[{label: '关闭', onClick: dismiss}]}
    />
  );
}

/** 一个用例 ✓：**一组**演示消息 ✓。 */
interface DemoCase {
  id: string;
  label: string;
  demos: DemoMessage[];
}

const card = (
  id: string,
  tone: MessageTone,
  body: string,
  extra: Partial<DemoMessage> = {},
): DemoMessage => ({id, kind: 'card', tone, body, transient: true, ...extra});

/** 用例表 ✓：三种形状 × 四种语气 × 几个内容结构 ✓。 */
export const DEMO_CASES: DemoCase[] = [
  {
    id: 'card-success',
    label: '瞬时 · 成功',
    demos: [card('c1', 'success', '导出完成，文件已保存。')],
  },
  {id: 'card-info', label: '瞬时 · 信息', demos: [card('c2', 'info', '正在读取、校验并导入文件…')]},
  {
    id: 'card-warning',
    label: '瞬时 · 警告',
    demos: [card('c3', 'warning', '这个文档还没有保存。')],
  },
  {id: 'card-error', label: '瞬时 · 失败', demos: [card('c4', 'error', '导出失败，请重试。')]},
  {
    id: 'card-detail',
    label: '瞬时 · 带标题与详情',
    demos: [
      card('c5', 'info', '保存失败（示例，Rev 3），内容仍在工作区', {
        title: '保存失败',
        detail: '诊断 id：e-1',
        open: true,
      }),
    ],
  },
  {
    id: 'status-error',
    label: '持续 · 失败（待确认）',
    demos: [
      {
        id: 's1',
        kind: 'status',
        tone: 'error',
        title: '保存失败',
        body: '内容仍在工作区里，存进去才算完。',
        detail: '诊断 id：e-1',
      },
    ],
  },
  {
    id: 'status-warning',
    label: '持续 · 警告',
    demos: [
      {
        id: 's2',
        kind: 'status',
        tone: 'warning',
        title: '存储有损坏记录',
        body: '原始数据已保留。',
      },
    ],
  },
  {
    id: 'result-ok',
    label: '结果 · 全部成功',
    demos: [
      {
        id: 'r1',
        kind: 'result',
        tone: 'success',
        title: '导入结果',
        items: [{label: '第一章.md'}, {label: '第二章.md'}],
      },
    ],
  },
  {
    id: 'result-failed',
    label: '结果 · 有一条失败',
    demos: [
      {
        id: 'r2',
        kind: 'result',
        tone: 'warning',
        title: '导入结果',
        items: [
          {label: '第一章.md'},
          {label: '第四章.md', detail: '格式不对，没有导入', failed: true},
        ],
      },
    ],
  },
  {
    id: 'long-name',
    label: '长文件名换行',
    demos: [
      {
        id: 'r3',
        kind: 'result',
        tone: 'info',
        title: '导入结果',
        items: [{label: '一个非常非常长的文件名，长到一行放不下必须换行才能读完.md'}],
      },
    ],
  },
  {
    id: 'many',
    label: '多条堆叠（区域限高滚动）',
    demos: [
      card('m1', 'info', '第一条消息。'),
      card('m2', 'success', '第二条消息。'),
      card('m3', 'warning', '第三条消息。'),
      card('m4', 'error', '第四条消息。'),
      card('m5', 'info', '第五条消息。'),
      card('m6', 'success', '第六条消息。'),
      card('m7', 'warning', '第七条消息。'),
      card('m8', 'error', '第八条消息。'),
    ],
  },
];

/** 视觉页本体 ✓：贴在左边 ✓ ⇒ ⇒ 右下那条区域看得见 ✓。 */
export function MessageGallery({
  demos,
  onPick,
  onClear,
  onClose,
}: {
  demos: readonly DemoMessage[];
  onPick: (demo: DemoMessage[]) => void;
  onClear: () => void;
  onClose: () => void;
}): ReactNode {
  return (
    <aside
      aria-label="消息视觉页"
      className="fixed left-4 top-16 bottom-16 z-[70] w-80 overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-950/95 p-3 text-xs text-neutral-200 shadow-2xl no-print"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-neutral-100">消息视觉页</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-1.5 py-0.5 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          aria-label="关闭消息视觉页"
        >
          关闭
        </button>
      </div>
      <p className="mt-1 text-neutral-400">点一个 ⇒ 消息出现在右下角那条真实区域里。</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {DEMO_CASES.map((item) => (
          <button
            key={item.id}
            type="button"
            data-demo-case={item.id}
            onClick={() => onPick(item.demos)}
            className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-neutral-200 hover:border-teal-600 hover:text-teal-200"
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 border-t border-neutral-800 pt-2 text-neutral-400">
        <span>当前演示 {demos.length} 条</span>
        <button
          type="button"
          onClick={onClear}
          className="rounded border border-neutral-700 px-2 py-1 hover:text-neutral-100"
        >
          清空
        </button>
      </div>
    </aside>
  );
}
