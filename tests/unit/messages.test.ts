import {it, expect} from 'vitest';
import {
  DRAFT_STATUS_TEXTS,
  GENERIC_FAILURE_TEXT,
  MESSAGE_CATEGORIES,
  SYNC_STATUS_TEXTS,
  formatBytes,
  hasOwnText,
  messageText,
  type MessageCategory,
} from '../../src/application/messages';

/**
 * The vocabulary of failures is one closed list shared by the native side and the application, and
 * only the failures a user can act on get words of their own.
 */
it('keeps the categories unique', () => {
  expect(new Set(MESSAGE_CATEGORIES).size).toBe(MESSAGE_CATEGORIES.length);
  expect(MESSAGE_CATEGORIES.length).toBeGreaterThan(0);
});

it('gives the failures a user can act on their own wording', () => {
  expect(messageText('native-target-missing')).toBe('文件已被移走或重命名');
  expect(messageText('native-permission-denied')).toBe('没有权限访问这个文件');
  expect(messageText('export-failed')).toBe('导出失败，请重试');
  expect(hasOwnText('native-target-missing')).toBe(true);
});

it("gives the failures that are not the user's doing one generic sentence", () => {
  // 应用自己用错了授权、授权已失效、内部状态不可用 ⇒ 不是用户的错 ⇒ 不各有文案 ✓。
  expect(messageText('file-capability-mismatch')).toBe(GENERIC_FAILURE_TEXT);
  expect(messageText('native-internal-failed')).toBe(GENERIC_FAILURE_TEXT);
  expect(messageText('invalid-target')).toBe(GENERIC_FAILURE_TEXT);
  expect(hasOwnText('file-capability-mismatch')).toBe(false);
});

it('does not put a success in the vocabulary', () => {
  // 成功不是失败 ⇒ ⇒ 它的分流由回执与 result 枚举承载 ✓。
  for (const category of MESSAGE_CATEGORIES) {
    expect(category).not.toMatch(/success|completed|ok$/);
  }
});

it('falls back to the generic sentence for a category it does not know', () => {
  // 认不出的码不猜它意味着什么 ⇒ ⇒ 通用一句 ✓。
  expect(messageText('native-something-new')).toBe(GENERIC_FAILURE_TEXT);
});

it('spells every category the same way', () => {
  // 一族一种拼写 ✓：同一个字段里不会混着两种写法 ✓ ⇒ ⇒ 读日志的人不用记两套规则 ✓。
  for (const category of MESSAGE_CATEGORIES) {
    expect(category).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
  }
});

it('carries the categories the capture path needs', () => {
  // 捕获类（未捕获的错误从哪来 ✓）：渲染期、脚本、拒绝、启动、后台 ✓。
  // 设计 §3.3 列的就是这五个 ⇒ ⇒ 代码里也得有 ⇒ ⇒ 否则两侧会漂 ✓。
  for (const category of ['render', 'unhandled', 'rejection', 'startup', 'worker']) {
    expect(MESSAGE_CATEGORIES).toContain(category as MessageCategory);
  }
  // 通道类那六个是基座原有的 ⇒ ⇒ 探针在用 ⇒ 不能少 ✓。
  for (const category of [
    'no-tauri-internals',
    'invoke-rejected',
    'invalid-payload',
    'rate-limited',
    'timeout',
    'unknown',
  ]) {
    expect(MESSAGE_CATEGORIES).toContain(category as MessageCategory);
  }
});

it('states the actual limit when the caller gives one', () => {
  // **上限由拥有它的那一侧给出** ✓ ⇒ ⇒ 文案说得出是多少 ✓ ⇒ ⇒ 不猜 ✓（§8.5 ✓）。
  expect(messageText('file-too-large', {limitBytes: 50 * 1024 * 1024})).toBe(
    '文件超过 50MiB 的上限',
  );
  expect(messageText('input-too-large', {limitChars: 1024})).toBe(
    '文档超过 1024 个字符的源文上限，本次输入未应用',
  );
  // **没有上限就说一句概括的** ✓ ⇒ ⇒ 不编数字 ✓。
  expect(messageText('file-too-large')).toBe('文件超过可处理的大小上限');
  expect(messageText('input-too-large')).toBe('文档超过源文大小上限，本次输入未应用');
});

it('formats the byte limits the way a person reads them', () => {
  expect(formatBytes(50 * 1024 * 1024)).toBe('50MiB');
  expect(formatBytes(100 * 1024 * 1024)).toBe('100MiB');
  expect(formatBytes(1536 * 1024)).toBe('1.5MiB');
});

it('gives each status dimension its own wording', () => {
  // **两行各说各的** ✓（§2.2 ✓）⇒ ⇒ 草稿那一行说草稿 ✓ ⇒ ⇒ 同步那一行说文件 ✓。
  expect(DRAFT_STATUS_TEXTS.updated).toBe('草稿已更新');
  expect(DRAFT_STATUS_TEXTS.saved).toBe('草稿已保存');
  expect(SYNC_STATUS_TEXTS.none).toBe('无同步目标');
  // **目标不在了 ⇒ ⇒ 说清为什么保存灰着** ✓ ⇒ ⇒ **另存为是出路** ✓（§8.2 ✓）。
  expect(SYNC_STATUS_TEXTS['target-missing']).toBe('那个本地文件已经不在了，请另存为');
  expect(SYNC_STATUS_TEXTS.synced).toBe('已同步');
  expect(SYNC_STATUS_TEXTS.unsynced).toBe('未同步');
  expect(SYNC_STATUS_TEXTS.failed).toBe('同步失败');
  // **状态维度的那一套有五类** ✓ ⇒ ⇒ 与派生出的那个状态一一对应 ✓（§2.3 ✓ ⇒ ⇒ 失败优先于基线 ✓）。
  expect(Object.keys(SYNC_STATUS_TEXTS)).toEqual([
    'none',
    'target-missing',
    'synced',
    'unsynced',
    'failed',
  ]);
});
