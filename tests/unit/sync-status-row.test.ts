import {it, expect, vi, beforeEach, afterEach} from 'vitest';
import {act, createElement} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {StatusBar} from '../../src/components/footer/StatusBar';
import {
  SYNC_STATUS_TEXTS,
  SYNC_FAILURE_HINT,
  SYNC_FAILURE_RETRY,
} from '../../src/application/messages';

/**
 * 状态区那一行 ✓（设计 §8.4 ✓、§8.6 ✓）。
 *
 * **失败是常驻状态** ✓ ⇒ ⇒ **不是一条通知** ✓ ⇒ ⇒ **给重试入口** ✓。
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

const render = (
  syncStatus: 'none' | 'synced' | 'unsynced' | 'failed',
  onRetrySync?: () => void,
) => {
  act(() => {
    root.render(
      createElement(StatusBar, {
        charCount: 10,
        wordCount: 2,
        lineCount: 1,
        mathMode: 'mathml',
        revision: 3,
        isDirty: false,
        syncStatus,
        onRetrySync,
      }),
    );
  });
};

it('失败就说失败，并说清草稿还在', () => {
  render('failed');
  // **失败有自己那一句** ✓ ⇒ ⇒ 不与"未同步"混着说 ✓（§8.6 ✓）。
  expect(host.textContent).toContain(SYNC_STATUS_TEXTS.failed);
  expect(host.textContent).not.toContain(SYNC_STATUS_TEXTS.unsynced);
  // **说明草稿已在工作区、失败的是文件** ✓ ⇒ ⇒ 用户知道东西还在 ✓（§8.5 ✓）。
  expect(host.textContent).toContain(SYNC_FAILURE_HINT);
});

it('失败给重试入口', () => {
  const onRetry = vi.fn();
  render('failed', onRetry);
  const retry = [...host.querySelectorAll('button')].find((node) =>
    node.textContent?.includes(SYNC_FAILURE_RETRY),
  )!;
  expect(retry).toBeTruthy();
  act(() => retry.click());
  expect(onRetry).toHaveBeenCalledTimes(1);
});

it('没有同步目标时那一行整行不显示，只剩草稿那一行', () => {
  render('none');
  // **没有同步目标时只显示草稿那一行** ✓（§8.4 ✓）。
  expect(host.textContent).not.toContain(SYNC_STATUS_TEXTS.none);
  expect(host.textContent).not.toContain(SYNC_STATUS_TEXTS.synced);
  expect(host.textContent).not.toContain(SYNC_STATUS_TEXTS.failed);
});

it('已同步与未同步各说各的', () => {
  render('synced');
  expect(host.textContent).toContain(SYNC_STATUS_TEXTS.synced);
  expect(host.textContent).not.toContain(SYNC_STATUS_TEXTS.failed);
});
