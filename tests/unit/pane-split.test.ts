import {afterEach, expect, it, vi} from 'vitest';
import {constrainSplit, splitBounds, type PaneGeometry} from '../../src/core/model/paneSplit';
import {
  readSplitPreference,
  writeSplitPreference,
} from '../../src/core/platform/web/splitPreferences';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

/** 宿主给的几何 ✓：单位是 px ✓，值来自 CSS 的 token ✓（设计 §6 ✓）。 */
const geometry: PaneGeometry = {minimumPaneWidth: 360, splitHandleWidth: 8};

it('keeps the preferred ratio inside 15–85% and the pane limits the host gave', () => {
  expect(splitBounds(1200, geometry)).toEqual({
    minimum: 360 / 1192,
    maximum: 1 - 360 / 1192,
    available: 1192,
  });
  expect(constrainSplit(0.15, 728, geometry)).toBeCloseTo(0.5);
  expect(constrainSplit(0.9, 1200, geometry)).toBeCloseTo(splitBounds(1200, geometry).maximum);
  expect(constrainSplit(Number.NaN, 1200, geometry)).toBe(0.5);
  expect(splitBounds(500, geometry).available).toBe(720);
});

it('follows the geometry it is given instead of a fixed pane width', () => {
  /** 根字号放大 ⇒ ⇒ 面板下限跟着放大 ⇒ ⇒ 纯模块照着算 ✓。 */
  const scaled: PaneGeometry = {minimumPaneWidth: 450, splitHandleWidth: 10};
  expect(splitBounds(1200, scaled).available).toBe(1190);
  expect(splitBounds(500, scaled).available).toBe(900);
  expect(constrainSplit(0.9, 1200, scaled)).toBeCloseTo(splitBounds(1200, scaled).maximum);
});

it('imports only a valid same-origin legacy value without rewriting it', () => {
  localStorage.setItem('markflow_split_ratio', '0.7200');
  expect(readSplitPreference()).toBe(0.72);
  expect(localStorage.getItem('markflow_split_ratio')).toBe('0.7200');
  expect(localStorage.getItem('markflow_split_preferences_v1')).toBeNull();
  for (const value of ['0.1499', '0.8501', '0.5garbage', '1e-1', '0.'.padEnd(40, '1')]) {
    localStorage.clear();
    localStorage.setItem('markflow_split_ratio', value);
    expect(readSplitPreference()).toBe(0.5);
  }
});

it('prefers the bounded v1 value and safely defaults malformed or unavailable storage', () => {
  localStorage.setItem('markflow_split_ratio', '0.8');
  writeSplitPreference(0.63);
  expect(readSplitPreference()).toBe(0.63);
  localStorage.setItem('markflow_split_preferences_v1', 'x'.repeat(257));
  expect(readSplitPreference()).toBe(0.5);
  localStorage.setItem(
    'markflow_split_preferences_v1',
    JSON.stringify({version: 1, ratio: 0.5, extra: true}),
  );
  expect(readSplitPreference()).toBe(0.5);
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  expect(readSplitPreference()).toBe(0.5);
  expect(() => writeSplitPreference(0.7)).not.toThrow();
});
