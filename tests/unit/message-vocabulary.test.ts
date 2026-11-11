import {it, expect} from 'vitest';
import {
  nativeCategories,
  vocabularyGap,
  readVocabulary,
} from '../../scripts/check-message-vocabulary';
import {MESSAGE_CATEGORIES} from '../../src/application/messages';

/**
 * 词表对齐的回归闸：两侧那一份封闭类别表必须真的是同一份 ✓。
 *
 * **这个检查本身也要有牙齿** ✓：两侧对不上时它得报出来 ✓ ⇒ ⇒ 少一个类别要红 ✓
 * ⇒ ⇒ 少一个类别这件事不会"没人发现" ✓。
 */

it('takes the categories from the macro call, not from the macro definition', () => {
  // 宏的定义里有 `$name` ✓ ⇒ 那里不是类别 ✓。
  const text = [
    'macro_rules! web_error_categories {',
    '    ($($variant:ident => $name:literal),*) => {}',
    '}',
    '',
    'web_error_categories! {',
    '    One => "one",',
    '}',
    '',
  ].join('\n');
  expect(nativeCategories(text)).toEqual(['one']);
});

it('refuses to guess when the listing changes shape', () => {
  // 解析不出就响着失败 ✓：宁可失败 ✓，不可静默放过 ✓。
  expect(() => nativeCategories('web_error_categories! {\n    One "one",\n}\n')).toThrow();
  expect(() => nativeCategories('nothing here')).toThrow();
});

it('reports the categories the two sides do not share', () => {
  const gap = vocabularyGap(['a', 'b'], ['b', 'c']);
  expect(gap.missingInNative).toEqual(['c']);
  expect(gap.missingInWeb).toEqual(['a']);
});

it('reports a category that appears twice', () => {
  const gap = vocabularyGap(['a', 'a'], ['a']);
  expect(gap.duplicatedInNative).toEqual(['a']);
  expect(gap.duplicatedInWeb).toEqual([]);
});

it('has the two sides on the same list right now', () => {
  const {native, web} = readVocabulary();
  const gap = vocabularyGap(native, web);
  expect(gap).toEqual({
    missingInNative: [],
    missingInWeb: [],
    duplicatedInNative: [],
    duplicatedInWeb: [],
  });
  expect(native.length).toBe(MESSAGE_CATEGORIES.length);
});

it.each(['\n', '\r\n'])('reads comments and categories with %j line endings', (newline) => {
  const source = [
    'web_error_categories! {',
    '    // category comment',
    '    One => "one", // inline comment',
    '}',
  ].join(newline);
  expect(nativeCategories(source)).toEqual(['one']);
});
