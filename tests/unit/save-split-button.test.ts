import {it, expect, vi, beforeEach, afterEach} from 'vitest';
import {act, createElement} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {SaveSplitButton} from '../../src/components/header/SaveSplitButton';
import {saveControlView, type BindingState} from '../../src/application/workspace/saveControl';
import {SAVE_CONTROL_TEXTS} from '../../src/application/messages';

/**
 * 顶栏那个分裂按钮 ✓（设计 §8.2 ✓）。
 *
 * **界面不自己判** ✓ ⇒ ⇒ 形状由派生给 ✓ ⇒ ⇒ 这里只验它照着渲染 ✓（§8.6 ✓）。
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

const button = (text: string) =>
  [...host.querySelectorAll('button')].find((node) => node.textContent?.includes(text))!;

const render = (state: BindingState, canSelectTarget: boolean) => {
  const onWriteBack = vi.fn();
  const onSaveAs = vi.fn();
  act(() => {
    root.render(
      createElement(SaveSplitButton, {
        view: saveControlView(state, canSelectTarget),
        onWriteBack,
        onSaveAs,
      }),
    );
  });
  return {onWriteBack, onSaveAs};
};

it('主区就是"保存"，点它写回文件', () => {
  const {onWriteBack} = render('valid', true);
  expect(button(SAVE_CONTROL_TEXTS.writeBack)).toBeTruthy();
  expect(button(SAVE_CONTROL_TEXTS.writeBack).disabled).toBe(false);
  act(() => button(SAVE_CONTROL_TEXTS.writeBack).click());
  expect(onWriteBack).toHaveBeenCalledTimes(1);
});

it('关联为空时主区可用，菜单里没有另存为', () => {
  const {onWriteBack, onSaveAs} = render('none', true);
  // **主区可用** ✓ ⇒ ⇒ 点击会选一个目标 ✓ ⇒ ⇒ **文件名留空** ✓（§8.2 ✓）。
  expect(button(SAVE_CONTROL_TEXTS.writeBack).disabled).toBe(false);
  const arrow = host.querySelector('[aria-haspopup="menu"]') as HTMLButtonElement;
  expect(arrow.disabled).toBe(false);
  act(() => arrow.click());
  // **另存为…灰掉 ⇒ ⇒ 不给入口** ✓ ⇒ ⇒ 菜单里根本没有那一项 ✓（§8.2 ✓）。
  const saveAsItem = [...host.querySelectorAll('[role="menuitem"]')].find((node) =>
    node.textContent?.includes(SAVE_CONTROL_TEXTS.saveAs),
  );
  expect(saveAsItem).toBeUndefined();
  expect(onSaveAs).not.toHaveBeenCalled();
  // **它做的事与"保存"完全一样** ✓ ⇒ ⇒ 不重复给入口 ✓。
  expect(onWriteBack).not.toHaveBeenCalled();
});

it('关联无效时主区灰掉，另存为可用', () => {
  const {onWriteBack, onSaveAs} = render('invalid', true);
  // **不给一个必然失败的按钮** ✓ ⇒ ⇒ **状态在动作之前就说清了** ✓（§8.2 ✓）。
  expect(button(SAVE_CONTROL_TEXTS.writeBack).disabled).toBe(true);
  const arrow = host.querySelector('[aria-haspopup="menu"]') as HTMLButtonElement;
  act(() => arrow.click());
  const saveAsItem = [...host.querySelectorAll('[role="menuitem"]')].find((node) =>
    node.textContent?.includes(SAVE_CONTROL_TEXTS.saveAs),
  ) as HTMLButtonElement;
  expect(saveAsItem.disabled).toBe(false);
  act(() => saveAsItem.click());
  expect(onSaveAs).toHaveBeenCalledTimes(1);
  expect(onWriteBack).not.toHaveBeenCalled();
});

it('Web 端整组灰掉，菜单开不出来', () => {
  const {onWriteBack} = render('none', false);
  expect(button(SAVE_CONTROL_TEXTS.writeBack).disabled).toBe(true);
  const arrow = host.querySelector('[aria-haspopup="menu"]') as HTMLButtonElement;
  // **整组灰掉** ✓ ⇒ ⇒ **界面两形态一致** ✓（§8.2 ✓）。
  expect(arrow.disabled).toBe(true);
  act(() => arrow.click());
  expect(host.querySelector('[role="menu"]')).toBeNull();
  expect(onWriteBack).not.toHaveBeenCalled();
});
