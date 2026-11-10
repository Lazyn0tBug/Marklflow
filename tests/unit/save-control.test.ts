import {describe, expect, it} from 'vitest';
import {bindingState, saveControlView} from '../../src/application/workspace/saveControl';
import type {DocumentFileContext} from '../../src/application/workspace/documentFileContext';

/**
 * 顶栏那个分裂按钮的形状 ✓（设计 §8.2 ✓、§8.6 ✓）。
 *
 * **三种关联状态，三个形状** ✓ ⇒ ⇒ 一条规则 ✓ ⇒ ⇒ 两形态一致 ✓ ⇒ ⇒ 界面不自己判 ✓。
 */

/** 一份上下文 ✓ ⇒ ⇒ 那个目标在不在由 `targetPresent` 给 ✓（§8.2 ✓）。 */
const context = (targetPresent?: boolean): DocumentFileContext => ({
  documentId: 'd1',
  file: {
    reference: 'f1',
    handle: 'f1',
    displayName: '报告.md',
    sourceFormat: 'markdown',
    targetPresent,
  },
  sync: {lastSyncedRevision: 1, failure: null},
});

describe('关联是哪种状态', () => {
  it('没有绑定就是空', () => {
    expect(bindingState(undefined)).toBe('none');
  });

  it('读判断答在就是有效', () => {
    expect(bindingState(context(true))).toBe('valid');
  });

  it('读判断答不在就是无效', () => {
    // **不是写失败推出来的** ✓ ⇒ ⇒ **写失败不产生新的一类** ✓（§8.2 ✓）。
    expect(bindingState(context(false))).toBe('invalid');
  });

  it('还没失效过按有效算，它是点时事实', () => {
    expect(bindingState(context(undefined))).toBe('valid');
  });
});

describe('顶栏那个按钮', () => {
  it('关联有效时两个都可用', () => {
    const view = saveControlView('valid', true);
    expect(view.writeBackEnabled).toBe(true);
    expect(view.menuEnabled).toBe(true);
    expect(view.saveAsAvailable).toBe(true);
  });

  it('关联为空时保存可用，另存为灰掉', () => {
    // **保存 = 把这一份写到一个本地文件** ✓ ⇒ ⇒ **弹原生对话框** ✓ ⇒ ⇒ **文件名留空** ✓
    // ⇒ ⇒ 用户自己填 ✓ ⇒ ⇒ 写成功 ⇒ ⇒ **关联就在那时建立** ✓（§8.2 ✓）。
    const view = saveControlView('none', true);
    expect(view.writeBackEnabled).toBe(true);
    // **另存为…灰掉** ✓ ⇒ ⇒ 它做的事与 `保存` **完全一样** ✓ ⇒ ⇒ **不重复给入口** ✓。
    expect(view.saveAsAvailable).toBe(false);
    // **箭头仍可用** ✓ ⇒ ⇒ 菜单里还有能点的那一项 ✓。
    expect(view.menuEnabled).toBe(true);
  });

  it('关联无效时保存置灰，另存为可用', () => {
    // **不给一个必然失败的按钮** ✓（§8.2 ✓）。
    const view = saveControlView('invalid', true);
    expect(view.writeBackEnabled).toBe(false);
    // **那是出路** ✓ ⇒ ⇒ 另存为可用 ✓。
    expect(view.saveAsAvailable).toBe(true);
    expect(view.menuEnabled).toBe(true);
  });

  it('Web 端整组灰掉', () => {
    // **Web 端永远选不到新目标** ✓ ⇒ ⇒ 关联为空时保存无事可做 ⇒ ⇒ **整组灰掉** ✓
    // ⇒ ⇒ **理由与桌面端同一条** ✓（§8.2 ✓）。
    const view = saveControlView('none', false);
    expect(view.writeBackEnabled).toBe(false);
    expect(view.menuEnabled).toBe(false);
    expect(view.saveAsAvailable).toBe(false);
  });

  it('Web 端即便有关联也整组灰掉', () => {
    // **Web 端从来没有绑定** ✓ ⇒ ⇒ 这一支只是把规则说全 ✓。
    const view = saveControlView('valid', false);
    expect(view.writeBackEnabled).toBe(false);
    expect(view.menuEnabled).toBe(false);
    expect(view.saveAsAvailable).toBe(false);
  });

  it('那三种状态都传给界面，提示文案据此给', () => {
    expect(saveControlView('none', true).bindingState).toBe('none');
    expect(saveControlView('valid', true).bindingState).toBe('valid');
    expect(saveControlView('invalid', true).bindingState).toBe('invalid');
  });
});
