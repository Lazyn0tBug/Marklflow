/**
 * 消息的**组件入口** ✓（设计 §5 ✓）。
 *
 * **样式入口是 `messages.css`** ✓：那份 CSS 自己站得住 ✓ ⇒ ⇒ 也能单独加载 ✓
 * ⇒ ⇒ 纯 HTML 样例不依赖这里的任何东西 ✓。
 *
 * **这个入口不 import 那份 CSS** ✓ ⇒ ⇒ 样式只有一个主人 ✓ ⇒ ⇒ 宿主按第 5 节的办法引进它 ✓
 * ⇒ ⇒ 引进的位置决定它落在哪一层 ✓ ⇒ ⇒ 在这里 import 会让它跑到最低那一层 ✓
 * ⇒ ⇒ 预检就压过它了 ✓ ⇒ ⇒ 卡片会没有边框、没有内边距 ✓（实测过 ✓）。
 */

export {MessageCard} from './MessageCard';
export type {MessageCardProps} from './MessageCard';
export {MessageStatusBar} from './MessageStatusBar';
export type {MessageStatusBarProps} from './MessageStatusBar';
export {MessageResult} from './MessageResult';
export type {MessageResultItem, MessageResultProps} from './MessageResult';
export type {MessageAction, MessageTone} from './types';
export {useMessageLifecycle} from './useMessageLifecycle';
