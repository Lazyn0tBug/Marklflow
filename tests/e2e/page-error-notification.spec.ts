import { test, expect } from './fixtures';

/**
 * 页面抛出的未捕获错误：**被捕获**（机制可断言 ✓）⇒ 且**不判失败** ✓。
 *
 * 这条是机制自己的回归闸：
 * - 捕获得到 ⇒ 失败时输出里带着原文（§5 测试侧 ✓）；
 * - 用例仍然通过 ⇒ 有意触发错误的用例不会被误伤（P-7 ✓）。
 */
test('records the page errors without failing the test', async ({ page, pageErrors }) => {
  await page.goto('/');
  await page.evaluate(() => {
    setTimeout(() => { throw new Error('页面里的错误'); }, 0);
  });
  await expect.poll(() => pageErrors.length).toBeGreaterThan(0);
  expect(pageErrors.join('\n')).toContain('页面里的错误');
});
