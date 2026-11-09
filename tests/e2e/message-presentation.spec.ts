import {test, expect} from './fixtures';

/**
 * 消息样例的验证 ✓：**样例页自己就是被测对象** ✓（设计 §7 S-1、S-2 ✓）。
 *
 * 走 dev server ✓ ⇒ ⇒ 夹具页在仓库里、不进应用构建 ✓ ⇒ ⇒ 这一步不碰应用 ✓。
 */
const origin = 'http://127.0.0.1:4175';

test('the css entry alone renders the three shapes', async ({page, pageErrors}) => {
  await page.goto(origin + '/tests/fixtures/messages/messages-css-sample.html');
  const region = page.locator('.mf-message');
  await expect(region).toBeVisible();
  await expect(page.locator('.mf-message-card')).toHaveCount(2);
  await expect(page.locator('.mf-message-result')).toHaveCount(1);
  // 表面不是透明 ⇒ ⇒ 这份 CSS 自己给了底色 ✓（这一页没有别的样式表 ✓）。
  const surface = await page
    .locator('.mf-message-card')
    .first()
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(surface).not.toBe('rgba(0, 0, 0, 0)');
  // 区域固定在右下 ✓。
  expect(await region.evaluate((element) => getComputedStyle(element).position)).toBe('fixed');
  // 长文件名换行 ⇒ ⇒ 那一行自己不横向溢出 ✓（区域是固定定位 ⇒ ⇒ 量它自己才作数 ✓）。
  const longest = page.locator('.mf-message-result__list li').nth(1);
  expect(await longest.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
    true,
  );
  expect(pageErrors).toEqual([]);
});

test('the application keeps the message styles above the preflight', async ({page}) => {
  // **在应用里量** ✓ ⇒ ⇒ 样例页没有 Tailwind ⇒ ⇒ 压不住预检的问题只有在这里才现形 ✓。
  await page.goto('/');
  await page.evaluate(() => {
    setTimeout(() => {
      throw new Error('样式检查用的错误');
    }, 0);
  });
  const card = page.getByRole('status', {name: '通知'}).first();
  await expect(card).toBeVisible();
  const style = await card.evaluate((element) => {
    const computed = getComputedStyle(element);
    return {
      border: computed.borderTopWidth,
      padding: computed.paddingTop,
      radius: computed.borderTopLeftRadius,
      background: computed.backgroundColor,
    };
  });
  // 预检把 `*` 的边框与内边距清成 0 ✓ ⇒ ⇒ 消息的层若在预检之下 ⇒ ⇒ 这里就是 0 ✓。
  expect(style.border).toBe('1px');
  expect(style.padding).not.toBe('0px');
  expect(style.radius).not.toBe('0px');
  // 应用默认深色 ✓ ⇒ ⇒ 消息的底色也该是**深色那支且是半透明的** ✓
  // ⇒ ⇒ 只量边框会漏掉"模块一直是浅色"这件事 ✓ ⇒ ⇒ 这里量颜色 ✓。
  // ⇒ ⇒ **底色那个数是深色那支的实数** ✓（浅色那支是 252 ✓ ⇒ ⇒ 这里量得到 ✓）
  // ⇒ ⇒ **不透明度只要求它不是 1** ✓ ⇒ ⇒ 以后调透明度不必改这条断言 ✓。
  expect(style.background).toMatch(/^rgba\(26, 26, 28, 0\.\d+\)$/);
});

test('the css entry follows the color scheme it is given', async ({page}) => {
  await page.emulateMedia({colorScheme: 'dark'});
  await page.goto(origin + '/tests/fixtures/messages/messages-css-sample.html');
  const dark = await page
    .locator('.mf-message-card')
    .first()
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  await page.emulateMedia({colorScheme: 'light'});
  await page.goto(origin + '/tests/fixtures/messages/messages-css-sample.html');
  const light = await page
    .locator('.mf-message-card')
    .first()
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  // 明暗两套底色不同 ⇒ ⇒ `light-dark()` 那条路走通了 ✓（没有 `light-dark()` 就没有这个差别 ✓）。
  expect(dark).not.toBe(light);
});

test('the detail toggle opens with the keyboard', async ({page}) => {
  await page.goto(origin + '/tests/fixtures/messages/messages-component-sample.html');
  const toggle = page.getByRole('button', {name: '详情'});
  await toggle.focus();
  // 详情支持键盘展开 ✓（§9 ✓）⇒ ⇒ 它是个按钮，不是 div ✓。
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', {name: '收起'})).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.mf-message-card__detail')).toBeVisible();
});

test('the pure components hand the callbacks back to the caller', async ({page, pageErrors}) => {
  await page.goto(origin + '/tests/fixtures/messages/messages-component-sample.html');
  // 瞬时那条 ✓。
  const card = page.locator('.mf-message-card[data-shape="transient"]');
  await expect(card).toBeVisible();
  // 播报由调用方给 ✓（组件自己不主动播报 ✓ ⇒ ⇒ 这一张显式给了 polite ✓）。
  await expect(card).toHaveAttribute('role', 'status');
  // 动作回调回到调用方 ✓ ⇒ ⇒ 组件自己不做业务 ✓。
  await page.getByRole('button', {name: '重试'}).click();
  await expect(page.locator('[data-sample-clicks]')).toHaveAttribute('data-sample-clicks', '1');
  // 关闭回调回到调用方 ✓ ⇒ ⇒ 卡片由外面收走 ✓。
  await page.getByRole('button', {name: '关闭', exact: true}).click();
  await expect(page.locator('[data-sample-empty]')).toBeVisible();
  // 持续那条 ✓。
  const status = page.locator('.mf-message-card[data-shape="persistent"]');
  await expect(status).toBeVisible();
  await expect(status).toHaveAttribute('role', 'alert');
  // 详情默认收起 ✓ ⇒ ⇒ 展开与否由外面给 ✓。
  const toggle = page.getByRole('button', {name: '详情'});
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(page.getByRole('button', {name: '收起'})).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.mf-message-card__detail')).toBeVisible();
  // 确认是它自己的动作 ✓ ⇒ ⇒ 与瞬时那条的关闭不是一回事 ✓。
  await page.getByRole('button', {name: '知道了'}).click();
  await expect(page.locator('[data-sample-ack]')).toHaveAttribute('data-sample-ack', '1');
  await expect(status).toHaveCount(0);
  // 结果那条 ✓。
  const result = page.locator('.mf-message-result');
  await expect(result).toBeVisible();
  await expect(result.locator('li')).toHaveCount(2);
  // 失败的那一条自己偏红 ✓ ⇒ ⇒ 语气是逐条的 ✓。
  const failedColor = await result
    .locator('li[data-failed="true"]')
    .evaluate((element) => getComputedStyle(element).color);
  const plainColor = await result
    .locator('li')
    .first()
    .evaluate((element) => getComputedStyle(element).color);
  expect(failedColor).not.toBe(plainColor);
  await page.getByRole('button', {name: '关闭导入结果'}).click();
  await expect(result).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});
