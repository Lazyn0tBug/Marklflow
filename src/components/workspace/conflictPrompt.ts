import {useCallback, useRef, useState} from 'react';
import type {ConflictChoice, ConflictRequest} from '../../application/workspace/documentSyncer';

/**
 * **冲突那一次提问** ✓（设计 §8.6 ✓）。
 *
 * **走对话框不走通知** ✓ ⇒ ⇒ 通知是"告知" ✓ ⇒ ⇒ **决定要留在原地** ✓。
 *
 * **问的那一方持有它** ✓ ⇒ ⇒ 应用层只管问 ✓ ⇒ ⇒ **上下文里不留"待用户决定"** ✓（§4.1 ✓）。
 *
 * **一个答案一次兑现** ✓ ⇒ ⇒ 答完就把那道题收走 ✓ ⇒ ⇒ **不会问出第二道** ✓ ⇒ ⇒
 * 用户看到的就是**这一次**冲突 ✓。
 */
export interface ConflictPrompt {
  /** 当前那道题 ✓ ⇒ ⇒ 没有就是 undefined ✓ ⇒ ⇒ 界面据此决定要不要显示对话框 ✓。 */
  request: ConflictRequest | undefined;
  /** 问一句 ✓：**返回用户选的那个** ✓ ⇒ ⇒ 应用层拿它落到一项写回结果上 ✓（§6.5 ✓）。 */
  ask: (request: ConflictRequest) => Promise<ConflictChoice>;
  /** 答了 ✓ ⇒ ⇒ 把那道题收走 ✓ ⇒ ⇒ 返回选的那个 ✓。 */
  answer: (choice: ConflictChoice) => void;
}

/**
 * **一个冲突提示器** ✓ ⇒ ⇒ 界面层用它把"问"接到对话框上 ✓。
 *
 * **回调是稳的** ✓ ⇒ ⇒ 它可以直接当端口给出去 ✓ ⇒ ⇒ **不会每次渲染都换一个人** ✓。
 */
export function useConflictPrompt(): ConflictPrompt {
  const [request, setRequest] = useState<ConflictRequest | undefined>(undefined);
  // **兑现那个答案的地方** ✓ ⇒ ⇒ 用 ref 拿着 ✓ ⇒ ⇒ **重渲染不影响它** ✓。
  const settle = useRef<((choice: ConflictChoice) => void) | undefined>(undefined);

  const ask = useCallback((next: ConflictRequest) => {
    // **一道题一次** ✓ ⇒ ⇒ 上一道还没答就又来一道 ⇒ ⇒ **先把它答成取消** ✓ ⇒ ⇒
    // **不静默丢掉用户的选择** ✓ ⇒ ⇒ 两边不动 ✓ ⇒ ⇒ 下次还会再问 ✓（§6.1 ✓）。
    settle.current?.('cancel');
    return new Promise<ConflictChoice>((resolve) => {
      settle.current = resolve;
      setRequest(next);
    });
  }, []);

  const answer = useCallback((choice: ConflictChoice) => {
    const resolve = settle.current;
    settle.current = undefined;
    setRequest(undefined);
    resolve?.(choice);
  }, []);

  return {request, ask, answer};
}
