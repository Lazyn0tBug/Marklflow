import {useCallback, useRef, useState} from 'react';

/**
 * **一次确认那一次提问** ✓ ⇒ ⇒ 与冲突那一次同一套规矩 ✓（问的那一方持有它 ✓）。
 *
 * **一道题一次** ✓ ⇒ ⇒ 上一道还没答就又来一道 ⇒ ⇒ **先把它答成取消** ✓ ⇒ ⇒
 * 不静默丢掉用户的选择 ✓ ⇒ ⇒ 两边不动 ✓。
 */
export interface ConfirmRequest {
  title: string;
  description: string;
  /** 说的是哪一份 ✓ ⇒ ⇒ 用户知道自己在决定哪一件事 ✓。 */
  subject: string | undefined;
  confirmLabel: string;
  cancelLabel: string;
}

export interface ConfirmPrompt {
  /** 当前那道题 ✓ ⇒ ⇒ 没有就是 undefined ✓ ⇒ ⇒ 界面据此决定要不要显示对话框 ✓。 */
  request: ConfirmRequest | undefined;
  /** 问一句 ✓ ⇒ ⇒ **返回用户答的是"是"还是"否"** ✓。 */
  ask: (request: ConfirmRequest) => Promise<boolean>;
  /** 答了 ✓ ⇒ ⇒ 把那道题收走 ✓。 */
  answer: (confirmed: boolean) => void;
}

/**
 * **一个确认提示器** ✓ ⇒ ⇒ 界面层用它把"问"接到对话框上 ✓。
 *
 * **回调是稳的** ✓ ⇒ ⇒ 它可以直接当端口给出去 ✓ ⇒ ⇒ **不会每次渲染都换一个人** ✓。
 */
export function useConfirmPrompt(): ConfirmPrompt {
  const [request, setRequest] = useState<ConfirmRequest | undefined>(undefined);
  // **兑现那个答案的地方** ✓ ⇒ ⇒ 用 ref 拿着 ✓ ⇒ ⇒ **重渲染不影响它** ✓。
  const settle = useRef<((confirmed: boolean) => void) | undefined>(undefined);

  const ask = useCallback((next: ConfirmRequest) => {
    settle.current?.(false);
    return new Promise<boolean>((resolve) => {
      settle.current = resolve;
      setRequest(next);
    });
  }, []);

  const answer = useCallback((confirmed: boolean) => {
    const resolve = settle.current;
    settle.current = undefined;
    setRequest(undefined);
    resolve?.(confirmed);
  }, []);

  return {request, ask, answer};
}
