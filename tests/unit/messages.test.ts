import {it,expect} from 'vitest';
import {
  GENERIC_FAILURE_TEXT,
  MESSAGE_CATEGORIES,
  hasOwnText,
  messageText,
  type MessageCategory,
} from '../../src/application/messages';

/**
 * The vocabulary of failures is one closed list shared by the native side and the application, and
 * only the failures a user can act on get words of their own.
 */
it('keeps the categories unique',()=>{
  expect(new Set(MESSAGE_CATEGORIES).size).toBe(MESSAGE_CATEGORIES.length);
  expect(MESSAGE_CATEGORIES.length).toBeGreaterThan(0);
});

it('gives the failures a user can act on their own wording',()=>{
  expect(messageText('native-target-missing')).toBe('文件已被移走或重命名');
  expect(messageText('native-permission-denied')).toBe('没有权限访问这个文件');
  expect(messageText('export_failed')).toBe('导出失败，请重试');
  expect(hasOwnText('native-target-missing')).toBe(true);
});

it('gives the failures that are not the user\'s doing one generic sentence',()=>{
  // 应用自己用错了授权、授权已失效、内部状态不可用 ⇒ 不是用户的错 ⇒ 不各有文案 ✓。
  expect(messageText('file-capability-mismatch')).toBe(GENERIC_FAILURE_TEXT);
  expect(messageText('native-internal-failed')).toBe(GENERIC_FAILURE_TEXT);
  expect(messageText('invalid-target')).toBe(GENERIC_FAILURE_TEXT);
  expect(hasOwnText('file-capability-mismatch')).toBe(false);
});

it('does not put a success in the vocabulary',()=>{
  // 成功不是失败 ⇒ ⇒ 它的分流由回执与 result 枚举承载 ✓。
  for(const category of MESSAGE_CATEGORIES){
    expect(category).not.toMatch(/success|completed|ok$/);
  }
});

it('falls back to the generic sentence for a category it does not know',()=>{
  // 认不出的码不猜它意味着什么 ⇒ ⇒ 通用一句 ✓。
  expect(messageText('native-something-new')).toBe(GENERIC_FAILURE_TEXT);
});
