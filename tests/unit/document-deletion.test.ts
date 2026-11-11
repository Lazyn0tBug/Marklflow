import {it, expect} from 'vitest';
import {nextDocumentAfterDeletion} from '../../src/application/workspace/documentDeletion';

/**
 * 删掉当前打开的那份之后，工作区的落点 ✓。
 *
 * **不能空着** ✓ ⇒ ⇒ 打开列表里的下一个 ✓ ⇒ ⇒ 下一个没有了就退到上一个 ✓。
 */

const list = (...ids: string[]) => ids.map((id) => ({id}));

it('删掉中间那份，落点是列表里的下一个', () => {
  expect(nextDocumentAfterDeletion(list('a', 'b', 'c'), 'b')?.id).toBe('c');
});

it('删掉最后一份，落点退到上一个', () => {
  expect(nextDocumentAfterDeletion(list('a', 'b', 'c'), 'c')?.id).toBe('b');
});

it('删掉唯一一份，就没有落点了', () => {
  expect(nextDocumentAfterDeletion(list('a'), 'a')).toBeUndefined();
});

it('列表里没有这一份，就没有落点', () => {
  expect(nextDocumentAfterDeletion(list('a', 'b'), 'z')).toBeUndefined();
});
