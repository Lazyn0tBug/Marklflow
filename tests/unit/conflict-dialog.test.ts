import {it, expect, vi, beforeEach, afterEach} from 'vitest';
import {act, createElement} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {ConflictDialog} from '../../src/components/workspace/ConflictDialog';
import {CONFLICT_TEXTS} from '../../src/application/messages';

/**
 * 冲突那三个选择 ✓（设计 §8.6 ✓）。
 *
 * **走对话框不走通知** ✓ ⇒ ⇒ 它要用户**做决定** ✓ ⇒ ⇒ 决定留在原地 ✓。
 */

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const render = () => {
  const onChoose = vi.fn();
  act(() => {
    root.render(createElement(ConflictDialog, {displayName: '报告.md', onChoose}));
  });
  return onChoose;
};

const button = (text: string) =>
  [...host.querySelectorAll('button')].find((node) => node.textContent?.includes(text))!;

it('是对话框，不是通知', () => {
  render();
  const dialog = host.querySelector('[role="dialog"]');
  expect(dialog).toBeTruthy();
  expect(dialog?.getAttribute('aria-modal')).toBe('true');
  // **说清是哪一份** ✓ ⇒ ⇒ 用户知道自己在决定哪一件事 ✓。
  expect(host.textContent).toContain('报告.md');
});

it('三个选择各说清它做什么', () => {
  render();
  // **覆盖 / 重载 / 取消** ✓ ⇒ ⇒ 三个答案各落到一项写回结果上 ✓（§6.5 ✓）。
  expect(button(CONFLICT_TEXTS.overwrite).textContent).toContain(CONFLICT_TEXTS.overwriteHint);
  // **重载要写清本地改动不保留** ✓ ⇒ ⇒ 用户点之前就知道会失去什么 ✓（§6.5 ✓）。
  expect(button(CONFLICT_TEXTS.reload).textContent).toContain(CONFLICT_TEXTS.reloadHint);
  expect(button(CONFLICT_TEXTS.reload).textContent).toContain('本地改动不保留');
  expect(button(CONFLICT_TEXTS.cancel).textContent).toContain(CONFLICT_TEXTS.cancelHint);
});

it('三个选择各落到自己的那一个答案上', () => {
  const onChoose = render();
  act(() => button(CONFLICT_TEXTS.overwrite).click());
  expect(onChoose).toHaveBeenLastCalledWith('overwrite');
  act(() => button(CONFLICT_TEXTS.reload).click());
  expect(onChoose).toHaveBeenLastCalledWith('reload');
  act(() => button(CONFLICT_TEXTS.cancel).click());
  expect(onChoose).toHaveBeenLastCalledWith('cancel');
});
