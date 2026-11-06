import { test, expect } from './fixtures';

/**
 * 页面抛出的未捕获错误：**被捕获**（机制可断言 ✓）⇒ 且**不判失败** ✓。
 *
 * 这条是机制自己的回归闸：
 * - 捕获得到 ⇒ 失败时输出里带着原文（§5 测试侧 ✓）；
 * - 用例仍然通过 ⇒ 有意触发错误的用例不会被误伤（P-7 ✓）。
 *
 * **同一个信号，两个消费者** ✓：测试侧读浏览器的 `pageerror` ✓，
 * 应用侧读同一个事件的另一个出口（`window.onerror` ✓）⇒ ⇒
 * 控制台里那条 `[message] unhandled` 就是应用自己报的 ✓ ⇒ ⇒ 捕获点装上了 ✓。
 */
test('records the page errors without failing the test', async ({ page, pageErrors }) => {
  const reported:string[]=[];
  page.on('console', message => {
    if (message.type()==='error')reported.push(message.text());
  });
  await page.goto('/');
  await page.evaluate(() => {
    setTimeout(() => { throw new Error('页面里的错误'); }, 0);
  });
  await expect.poll(() => pageErrors.length).toBeGreaterThan(0);
  expect(pageErrors.join('\n')).toContain('页面里的错误');
  // 应用自己也报了一条 ⇒ 类别是"未捕获的脚本错误" ✓。
  await expect.poll(() => reported.filter(text => text.includes('[message]')).length).toBeGreaterThan(0);
  expect(reported.some(text => text.includes('[message] unhandled'))).toBe(true);
});
