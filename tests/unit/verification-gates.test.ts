// @vitest-environment node
import {expect, it} from 'vitest';
import {readFile} from 'node:fs/promises';

/**
 * **流程节点的清单** ✓：**每一档跑哪些门，写在脚本里** ✓ ⇒ ⇒ 清单就是那几条命令 ✓。
 *
 * **为什么要有这条测试** ✓：档是"整道跑"的单位 ✓ ⇒ ⇒ 漏一个节点 ⇒ ⇒ 那一档就不完整 ✓
 * ⇒ ⇒ 而"不完整"没人看得出来 ✓ ⇒ ⇒ 除非有一条东西盯着它 ✓ ⇒ ⇒ 就是这条 ✓。
 *
 * **格式检查必须是节点** ✓ ⇒ ⇒ **不是 lint 里的一个子项** ✓ ⇒ ⇒ "我跑了 lint"不等于"格式过了" ✓
 * ⇒ ⇒ 少一个节点 ⇒ ⇒ 那一档就不完整 ✓ ⇒ ⇒ 所以它单列 ✓。
 */
const scripts = JSON.parse(await readFile('package.json', 'utf8')).scripts as Record<
  string,
  string
>;

/** 一条命令里提到的那些脚本名 ✓。 */
function steps(command: string): string[] {
  return [...command.matchAll(/bun run ([\w:.-]+)/g)].map((match) => match[1] ?? '');
}

it('runs the format check as a step of the everyday tier', () => {
  // **日常档含格式检查** ✓ ⇒ ⇒ 那一档整道跑 ⇒ ⇒ 格式一定被查过 ✓。
  expect(steps(scripts['check'] ?? '')).toContain('format:check');
  // **它在 lint 之前** ✓ ⇒ ⇒ 排版不对时**先看见它** ✓ ⇒ ⇒ 不用等后面几道才发现 ✓。
  const order = steps(scripts['check'] ?? '');
  expect(order.indexOf('format:check')).toBeLessThan(order.indexOf('lint'));
});

it('keeps the format check out of lint so the two are separate steps', () => {
  // **lint 不含它** ✓ ⇒ ⇒ "跑了 lint"不等于"格式过了" ✓ ⇒ ⇒ 少一个节点那一档就不完整 ✓。
  expect(steps(scripts['lint'] ?? '')).not.toContain('format:check');
});

it('keeps every step of the everyday tier in the tier the doc names', () => {
  // **日常档的节点清单** ✓ ⇒ ⇒ 文档里写的那几个一字不差 ✓ ⇒ ⇒ 文档与脚本不会各说各话 ✓。
  expect(steps(scripts['check'] ?? '')).toEqual([
    'typecheck',
    'format:check',
    'lint',
    'test:unit',
    'build',
  ]);
});

it('keeps the native and closing tiers on top of the everyday one', () => {
  // **原生档** ✓ ⇒ ⇒ Rust 那两道的命令在那儿 ✓ ⇒ ⇒ 日常档之外再加它 ✓。
  const native = scripts['check:rust'] ?? '';
  expect(native).toContain('cargo test');
  expect(native).toContain('cargo clippy');
  // **收口档** ✓ ⇒ ⇒ 日常档 → e2e → 原生档 ✓ ⇒ ⇒ 每一档都是整道的 ✓。
  const closing = steps(scripts['check:full'] ?? '');
  expect(closing).toContain('check');
  expect(closing).toContain('test:e2e');
  expect(closing).toContain('check:rust');
});
