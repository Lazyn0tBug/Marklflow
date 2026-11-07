/**
 * 消息的**组件入口** ✓（设计 §5 ✓）。
 *
 * **样式入口是 `messages.css`** ✓：那份 CSS 自己站得住 ✓ ⇒ ⇒ 也能单独加载 ✓
 * ⇒ ⇒ 纯 HTML 样例不依赖这里的任何东西 ✓。
 *
 * **样式由这个入口带进来** ✓ ⇒ ⇒ 组件文件里不再各自 import ✓
 * ⇒ ⇒ 只有一个地方会漏 ✓ ⇒ ⇒ 从这里 import 就有样式 ✓。
 */
import './messages.css';

export {MessageCard} from './MessageCard';
export type {MessageCardProps} from './MessageCard';
export {MessageStatusBar} from './MessageStatusBar';
export type {MessageStatusBarProps} from './MessageStatusBar';
export {MessageResult} from './MessageResult';
export type {MessageResultItem,MessageResultProps} from './MessageResult';
export type {MessageAction,MessageTone} from './types';
