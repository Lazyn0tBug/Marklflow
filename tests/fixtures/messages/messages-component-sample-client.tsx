import {useState,type ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import {MessageCard,type MessageTone} from '../../../src/presentation/messages';

/**
 * 消息组件的独立样例 ✓：**不碰工作台、不碰通知存储、不碰平台端口** ✓
 * ⇒ ⇒ 数据是假的 ✓、回调是假的 ✓ ⇒ ⇒ 样例自己站得住 ✓。
 */

interface SampleState{
 /** 动作被点了几次 ✓（证明回调回到了调用方 ✓）。 */
 clicks:number;
 /** 详情展开没有 ✓（展开由外面给 ✓）。 */
 open:boolean;
 /** 语气 ✓。 */
 tone:MessageTone;
 /** 卡片还在没有 ✓（关掉由外面收走 ✓）。 */
 visible:boolean;
}

function Sample():ReactNode{
 const [state,setState]=useState<SampleState>({clicks:0,open:false,tone:'info',visible:true});
 if(!state.visible)return <p data-sample-empty>这张卡片被关掉了。</p>;
 return <div>
  <p data-sample-clicks={state.clicks}>动作被点了 {state.clicks} 次</p>
  <button type="button" data-sample-tone onClick={()=>setState(previous=>({...previous,tone:previous.tone==='info'?'error':'info'}))}>换语气</button>
  <MessageCard
   tone={state.tone}
   title="保存失败"
   body="内容仍在工作区里，存进去才算完。"
   detail="诊断 id：e-1"
   expanded={state.open}
   onToggleDetail={()=>setState(previous=>({...previous,open:!previous.open}))}
   actions={[{label:'重试',primary:true,onClick:()=>setState(previous=>({...previous,clicks:previous.clicks+1}))}]}
   onClose={()=>setState(previous=>({...previous,visible:false}))}
   role="alert"
  />
 </div>;
}

const host=document.querySelector<HTMLElement>('[data-message-sample]');
if(!host)throw new Error('Missing message sample container');
createRoot(host).render(<Sample/>);
