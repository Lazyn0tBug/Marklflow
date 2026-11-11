import {it, expect, vi, beforeEach, afterEach} from 'vitest';
import {act, createElement} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {ConfirmDialog} from '../../src/components/workspace/ConfirmDialog';
import {CONFIRM_TEXTS} from '../../src/application/messages';

/**
 * 删除那一次确认 ✓。
 *
 * **走应用内的对话框** ✓ ⇒ ⇒ 不靠宿主的 confirm ✓ ⇒ ⇒ 每一处都长一个样 ✓。
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
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  act(() => {
    root.render(
      createElement(ConfirmDialog, {
        title: CONFIRM_TEXTS.delete.title,
        description: CONFIRM_TEXTS.delete.description,
        subject: '报告.md',
        confirmLabel: CONFIRM_TEXTS.delete.confirm,
        cancelLabel: CONFIRM_TEXTS.cancel,
        onConfirm,
        onCancel,
      }),
    );
  });
  return {onConfirm, onCancel};
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

it('两个答案各落到自己那一个上', () => {
  const {onConfirm, onCancel} = render();
  act(() => button(CONFIRM_TEXTS.delete.confirm).click());
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(onCancel).not.toHaveBeenCalled();
  act(() => button(CONFIRM_TEXTS.cancel).click());
  expect(onCancel).toHaveBeenCalledTimes(1);
});

it('打开就落在取消上，回车不会顺手删掉东西', () => {
  render();
  expect(document.activeElement).toBe(button(CONFIRM_TEXTS.cancel));
});
