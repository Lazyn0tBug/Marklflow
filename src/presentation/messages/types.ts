/**
 * 消息的公共类型 ✓：**只管长什么样、做什么** ✓ ⇒ ⇒ 不含任何应用的概念 ✓。
 */

/**
 * 可选字段也允许**显式**的 undefined ✓（`exactOptionalPropertyTypes` 下 ✓）
 * ⇒ ⇒ 调用方可以把可能没有的值直接传进来 ✓ ⇒ ⇒ 不用到处写条件展开 ✓。
 */
export type Optional<T>=T|undefined;

/** 视觉语气 ✓（四种 ✓ ⇒ ⇒ 只改颜色 ✓ ⇒ ⇒ 不管播报紧急度 ✓）。 */
export type MessageTone='success'|'info'|'warning'|'error';

export interface MessageAction{
 /** 动作上的字 ✓。 */
 label:string;
 /** 动作做什么 ✓：由外面给 ✓ ⇒ ⇒ 组件不替业务决定 ✓。 */
 onClick:()=>void;
 /** 是不是主动作 ✓（主动作视觉上更重 ✓）。 */
 primary?:boolean;
 /** 无障碍名 ✓（不给就等于上面的字 ✓ ⇒ ⇒ 看得见的短、无障碍名长 ✓ 时用它 ✓）。 */
 ariaLabel?:Optional<string>;
}
