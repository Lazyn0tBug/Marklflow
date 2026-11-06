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
  expect(messageText('export-failed')).toBe('导出失败，请重试');
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

it('spells every category the same way',()=>{
  // 一族一种拼写 ✓：同一个字段里不会混着两种写法 ✓ ⇒ ⇒ 读日志的人不用记两套规则 ✓。
  for(const category of MESSAGE_CATEGORIES){
    expect(category).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
  }
});

it('carries the categories the capture path needs',()=>{
  // 捕获类（未捕获的错误从哪来 ✓）：渲染期、脚本、拒绝、启动、后台 ✓。
  // 设计 §3.3 列的就是这五个 ⇒ ⇒ 代码里也得有 ⇒ ⇒ 否则两侧会漂 ✓。
  for(const category of ['render','unhandled','rejection','startup','worker']){
    expect(MESSAGE_CATEGORIES).toContain(category as MessageCategory);
  }
  // 通道类那六个是基座原有的 ⇒ ⇒ 探针在用 ⇒ 不能少 ✓。
  for(const category of ['no-tauri-internals','invoke-rejected','invalid-payload','rate-limited','timeout','unknown']){
    expect(MESSAGE_CATEGORIES).toContain(category as MessageCategory);
  }
});
