import {useState, type ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import {
  MessageCard,
  MessageResult,
  MessageStatusBar,
  type MessageTone,
} from '../../../src/presentation/messages';
// 样式是**另一个入口** ✓：宿主自己引进它 ✓（这里引进是为了让样例自己站得住 ✓）。
import '../../../src/presentation/messages/messages.css';

/**
 * 消息组件的独立样例 ✓：**不碰工作台、不碰通知存储、不碰平台端口** ✓
 * ⇒ ⇒ 数据是假的 ✓、回调是假的 ✓ ⇒ ⇒ 样例自己站得住 ✓。
 *
 * **三种形状都在这一页** ✓（瞬时 ✓、持续 ✓、结果 ✓）⇒ ⇒ 它们共用一个区域 ✓
 * ⇒ ⇒ 形状的差别只看得见，不靠不同的位置 ✓。
 */

interface SampleState {
  /** 瞬时那条的动作被点了几次 ✓。 */
  clicks: number;
  /** 持续那条被确认了几次 ✓。 */
  acknowledged: number;
  /** 详情展开没有 ✓（展开由外面给 ✓）。 */
  open: boolean;
  /** 语气 ✓。 */
  tone: MessageTone;
  /** 三条还在没有 ✓（关掉由外面收走 ✓）。 */
  card: boolean;
  status: boolean;
  result: boolean;
}

function Sample(): ReactNode {
  const [state, setState] = useState<SampleState>({
    clicks: 0,
    acknowledged: 0,
    open: false,
    tone: 'info',
    card: true,
    status: true,
    result: true,
  });
  return (
    <div
      style={{
        maxWidth: '28rem',
        margin: '2rem auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
      }}
    >
      <p data-sample-clicks={state.clicks}>动作被点了 {state.clicks} 次</p>
      <p data-sample-ack={state.acknowledged}>确认被点了 {state.acknowledged} 次</p>
      <button
        type="button"
        data-sample-tone
        onClick={() =>
          setState((previous) => ({...previous, tone: previous.tone === 'info' ? 'error' : 'info'}))
        }
      >
        换语气
      </button>
      {state.card ? (
        <MessageCard
          tone={state.tone}
          title="导出完成"
          body="文件已经保存。"
          actions={[
            {
              label: '重试',
              onClick: () => setState((previous) => ({...previous, clicks: previous.clicks + 1})),
            },
          ]}
          onClose={() => setState((previous) => ({...previous, card: false}))}
          role="status"
        />
      ) : (
        <p data-sample-empty>这张卡片被关掉了。</p>
      )}
      {state.status ? (
        <MessageStatusBar
          tone="error"
          title="保存失败"
          body="内容仍在工作区里，存进去才算完。"
          detail="诊断 id：e-1"
          expanded={state.open}
          onToggleDetail={() => setState((previous) => ({...previous, open: !previous.open}))}
          onAcknowledge={() =>
            setState((previous) => ({
              ...previous,
              acknowledged: previous.acknowledged + 1,
              status: false,
            }))
          }
          role="alert"
        />
      ) : null}
      {state.result ? (
        <MessageResult
          title="导入结果"
          tone="warning"
          items={[
            {label: '第一章.md'},
            {label: '第四章.md', detail: '格式不对，没有导入', failed: true},
          ]}
          closeLabel="关闭导入结果"
          onClose={() => setState((previous) => ({...previous, result: false}))}
        />
      ) : null}
    </div>
  );
}

const host = document.querySelector<HTMLElement>('[data-message-sample]');
if (!host) throw new Error('Missing message sample container');
createRoot(host).render(<Sample />);
