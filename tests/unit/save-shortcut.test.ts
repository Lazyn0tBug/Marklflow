import {expect, it} from 'vitest';
import {isSaveShortcut} from '../../src/application/workspace/saveShortcut';

/**
 * 那一个快捷键 ✓（设计 §6.3 ✓）。
 *
 * **`Ctrl/Cmd+S`** ✓ ⇒ ⇒ 两端同一个键 ✓ ⇒ ⇒ 别的键不管 ✓。
 */

it('Ctrl+S 与 Cmd+S 都是那一个键', () => {
  expect(isSaveShortcut({key: 's', metaKey: false, ctrlKey: true})).toBe(true);
  expect(isSaveShortcut({key: 's', metaKey: true, ctrlKey: false})).toBe(true);
  expect(isSaveShortcut({key: 'S', metaKey: true, ctrlKey: false})).toBe(true);
});

it('没有那个修饰键就不是', () => {
  expect(isSaveShortcut({key: 's', metaKey: false, ctrlKey: false})).toBe(false);
});

it('别的键不是，哪怕带着那个修饰键', () => {
  expect(isSaveShortcut({key: 'p', metaKey: false, ctrlKey: true})).toBe(false);
  expect(isSaveShortcut({key: 'o', metaKey: true, ctrlKey: false})).toBe(false);
  expect(isSaveShortcut({key: 'Enter', metaKey: true, ctrlKey: false})).toBe(false);
});
