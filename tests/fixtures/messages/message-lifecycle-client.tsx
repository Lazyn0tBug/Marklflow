import {StrictMode, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {MessageCard, useMessageLifecycle} from '../../../src/presentation/messages';
import {ImportResultNotice} from '../../../src/components/message/ImportResultNotice';
import {NoticeList} from '../../../src/components/notice/NoticeList';
import {noticeStore} from '../../../src/application/notices';
import '../../../src/presentation/messages/messages.css';

type Mode = 'normal' | 'zero' | 'no-change';
function Item({
  id,
  mode,
  auto,
  onExit,
  onHide,
}: {
  id: number;
  mode: Mode;
  auto: boolean;
  onExit: (id: number) => void;
  onHide: () => void;
}) {
  const elementRef = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);
  const dismiss = useMessageLifecycle({
    elementRef,
    leaving,
    autoHideMs: auto ? 160 : undefined,
    onHide: () => {
      onHide();
      setLeaving(true);
    },
    onExited: () => onExit(id),
  });
  return (
    <MessageCard
      elementRef={elementRef}
      className={`lifecycle-${mode}`}
      leaving={leaving}
      body={`实例 ${id}`}
      onClose={dismiss}
      ariaLabel="生命周期夹具"
      role="status"
      detail="子元素过渡不得影响父卡片退出"
      expanded
    />
  );
}

function Sample() {
  const serial = useRef(0);
  const [item, setItem] = useState<{id: number; mode: Mode; auto: boolean} | null>(null);
  const [exits, setExits] = useState<number[]>([]);
  const [hides, setHides] = useState(0);
  const [batch, setBatch] = useState<{id: number; failed: boolean} | null>(null);
  const mount = (mode: Mode = 'normal', auto = false) =>
    setItem({id: ++serial.current, mode, auto});
  return (
    <>
      <style>{`
      .mf-message-card[class*="lifecycle-"] { transition: opacity 90ms, transform 180ms, background-color 1200ms; }
      .mf-message-card[class*="lifecycle-"][data-leaving] { background-color: #777; }
      .mf-message-card[class*="lifecycle-"] .mf-message-card__detail { transition: opacity 1500ms; }
      .mf-message-card[class*="lifecycle-"][data-leaving] .mf-message-card__detail { opacity: .1; }
      .mf-message-card[class*="lifecycle-"]::after { content: ''; display: block; width: 1px; height: 1px; background: currentColor; opacity: 1; transition: opacity 1500ms; }
      .mf-message-card[class*="lifecycle-"][data-leaving]::after { opacity: .1; }
      .mf-message-card.lifecycle-zero { transition-duration: 0s; }
      .mf-message-card.lifecycle-no-change[data-leaving] { opacity: 1; transform: none; }
      @starting-style { .mf-message-card[class*="lifecycle-"] { opacity: 1; transform: none; } }
      @media (prefers-reduced-motion: reduce) { .mf-message-card[class*="lifecycle-"] { transition-duration: 0s; } }
    `}</style>
      <nav>
        <button onClick={() => mount()}>挂载</button>
        <button onClick={() => mount('zero')}>零时长</button>
        <button onClick={() => mount('no-change')}>无目标变化</button>
        <button onClick={() => mount('normal', true)}>自动</button>
        <button onClick={() => setItem(null)}>卸载</button>
        <button
          onClick={() => {
            flushSync(() => mount());
            document
              .querySelector<HTMLButtonElement>('[aria-label="生命周期夹具"] button')
              ?.click();
          }}
        >
          同任务挂载关闭
        </button>
        <button onClick={() => noticeStore.push({tone: 'success', message: '普通成功通知'})}>
          成功通知
        </button>
        <button
          onClick={() =>
            noticeStore.push({tone: 'error', message: '保存失败通知', category: 'save-failed'})
          }
        >
          保存失败
        </button>
        <button onClick={() => setBatch({id: ++serial.current, failed: false})}>导入成功</button>
        <button onClick={() => setBatch({id: ++serial.current, failed: true})}>导入失败</button>
      </nav>
      <output data-exits>{JSON.stringify(exits)}</output>
      <output data-hides>{hides}</output>
      <textarea aria-label="编辑器" />
      <div className="mf-message" tabIndex={-1}>
        {item && (
          <Item
            key={item.id}
            {...item}
            onHide={() => setHides((count) => count + 1)}
            onExit={(id) => {
              setExits((previous) => [...previous, id]);
              setItem((current) => (current?.id === id ? null : current));
            }}
          />
        )}
        <NoticeList />
        {batch && (
          <ImportResultNotice
            key={batch.id}
            items={[
              {
                name: `${batch.id}.md`,
                status: batch.failed ? 'failed' : 'opened',
                message: batch.failed ? '失败' : '完成',
              },
            ]}
            onClose={() => setBatch((current) => (current?.id === batch.id ? null : current))}
          />
        )}
      </div>
    </>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing lifecycle fixture root');
createRoot(root).render(
  <StrictMode>
    <Sample />
  </StrictMode>,
);
