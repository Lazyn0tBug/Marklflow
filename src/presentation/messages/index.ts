/**
 * 消息的**组件入口** ✓（设计 §5 ✓）。
 *
 * **样式入口是 `messages.css`** ✓：那份 CSS 自己站得住 ✓ ⇒ ⇒ 也能单独加载 ✓
 * ⇒ ⇒ 纯 HTML 样例不依赖这里的任何东西 ✓。
 */

export {MessageCard} from './MessageCard';
export type {MessageAction,MessageCardProps,MessageTone} from './MessageCard';
