import {it, expect, vi} from 'vitest';
import {act, createElement} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {useConflictPrompt} from '../../src/components/workspace/conflictPrompt';
import {ConflictDialog} from '../../src/components/workspace/ConflictDialog';
import {CONFLICT_TEXTS} from '../../src/application/messages';

/**
 * 冲突那一次提问 ✓（设计 §8.6 ✓）。
 *
 * **问的那一方持有它** ✓ ⇒ ⇒ 上下文里不留"待用户决定" ✓。
 */

it('问一次，答一次，那道题就收走', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root: Root = createRoot(host);
  const request = {documentId: 'd1', revision: 7, displayName: '报告.md'};
  let prompt: ReturnType<typeof useConflictPrompt> | undefined;
  const Probe = () => {
    prompt = useConflictPrompt();
    return null;
  };
  try {
    await act(async () => {
      root.render(createElement(Probe));
    });
    // **问出去** ✓ ⇒ ⇒ 那道题就在那儿了 ✓。
    let answer: Promise<string> | undefined;
    await act(async () => {
      answer = prompt!.ask(request) as Promise<string>;
    });
    expect(prompt!.request).toEqual(request);
    // **答了** ✓ ⇒ ⇒ 那道题收走 ✓ ⇒ ⇒ 用户看到的就是这一次冲突 ✓。
    await act(async () => {
      prompt!.answer('reload');
    });
    expect(prompt!.request).toBeUndefined();
    expect(await answer!).toBe('reload');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it('对话框接到提示器上，点了就落到那个答案上', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root: Root = createRoot(host);
  const request = {documentId: 'd1', revision: 7, displayName: '报告.md'};
  let prompt: ReturnType<typeof useConflictPrompt> | undefined;
  const Probe = () => {
    prompt = useConflictPrompt();
    return prompt.request
      ? createElement(ConflictDialog, {
          displayName: prompt.request.displayName,
          onChoose: (choice) => prompt!.answer(choice),
        })
      : null;
  };
  try {
    await act(async () => {
      root.render(createElement(Probe));
    });
    let answer: Promise<string> | undefined;
    await act(async () => {
      answer = prompt!.ask(request) as Promise<string>;
    });
    expect(host.querySelector('[role="dialog"]')).toBeTruthy();
    const cancel = [...host.querySelectorAll('button')].find((node) =>
      node.textContent?.includes(CONFLICT_TEXTS.cancel),
    )!;
    await act(async () => {
      cancel.click();
    });
    expect(await answer!).toBe('cancel');
    // **答完对话框就走了** ✓ ⇒ ⇒ **不留一道没答的题** ✓。
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
