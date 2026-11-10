import {test, expect} from './fixtures';

/**
 * 渲染期的错误：**局部降级** ✓ ＋ **各报各的** ✓。
 *
 * 这条走探针页面 ✓：产品应用不暴露"故意崩一下"的入口 ✓（那是个脚手架，不是产品 ✓）。
 *
 * - 崩了以后**不是白屏** ✓：两块降级提示都在 ✓（P-1 ✓）；
 * - 两处各报一条 ✓：最外层报"起不来" ✓，局部报"这一部分" ✓（P-3 ✓）。
 */
test('a render error degrades locally and is reported once with its category', async ({page}) => {
  const reported: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') reported.push(message.text());
  });
  await page.goto('http://127.0.0.1:4175/tests/fixtures/architecture/react-error-probe.html');
  // 降级后的提示在 ⇒ 不是白屏 ✓。
  await expect(page.locator('[data-react-fallback="root"]')).toHaveText('工作台没能完整显示');
  await expect(page.locator('[data-react-fallback="nested"]')).toHaveText('这一部分没能显示');
  // 两处各报一条 ✓ ⇒ 类别分得清 ✓。
  await expect.poll(() => reported.filter((text) => text.includes('[message]')).length).toBe(2);
  expect(reported.some((text) => text.includes('[message] startup'))).toBe(true);
  expect(reported.some((text) => text.includes('[message] render'))).toBe(true);
});
