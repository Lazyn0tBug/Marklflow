import {test, expect, type Page} from './fixtures';

/**
 * 消息区在**应用页面**上的要求 ✓（设计 §9 ✓）。
 *
 * 这些是**应用里**的断言 ✓ ⇒ ⇒ 独立样例证明不了它们 ✓
 * ⇒ ⇒ 样例没有 Tailwind、没有工作台、没有键盘顺序 ✓。
 */

/** 通知面里的一条 ✓。 */
function notice(page: Page) {
  return page.getByRole('status', {name: '通知'});
}

/** 开发服务器 ✓：视觉页只在开发构建里 ✓ ⇒ ⇒ 那一条用例对着它跑 ✓。 */
const devOrigin = 'http://127.0.0.1:4175';

test('the region stays inside a narrow window and does not push the workbench', async ({page}) => {
  await page.setViewportSize({width: 360, height: 740});
  await page.goto('/');
  // 窄屏下预览不显示（一次只显示一个视图 ✓）⇒ ⇒ 这里等编辑器就绪 ✓（设计 §6 ✓）。
  await page.locator('textarea').waitFor({timeout: 30000});
  const editor = page.locator('textarea');
  const before = await editor.boundingBox();
  await page.evaluate(() => {
    setTimeout(() => {
      throw new Error('窄窗检查');
    }, 0);
  });
  await expect(notice(page).first()).toBeVisible();
  const box = await page.locator('.mf-message').boundingBox();
  expect(box).not.toBeNull();
  // 区域不越出视口 ✓。
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(360);
  expect(box!.y + box!.height).toBeLessThanOrEqual(740);
  // 消息是浮层 ⇒ ⇒ 不推挤工作台 ✓。
  const after = await editor.boundingBox();
  expect(after!.y).toBe(before!.y);
});

test('a message does not take the editing focus', async ({page}) => {
  await page.goto('/');
  await page.waitForSelector('[data-render-state="ready"]', {timeout: 30000});
  const editor = page.locator('textarea');
  await editor.click();
  await page.evaluate(() => {
    setTimeout(() => {
      throw new Error('焦点检查');
    }, 0);
  });
  await expect(notice(page).first()).toBeVisible();
  // 消息到达时不抢编辑焦点 ✓。
  await expect(editor).toBeFocused();
});

test('closing a message moves the focus to a control that remains', async ({page}) => {
  await page.goto('/');
  await page.evaluate(() => {
    setTimeout(() => {
      throw new Error('一');
    }, 0);
    setTimeout(() => {
      throw new Error('二');
    }, 10);
  });
  await expect(notice(page)).toHaveCount(2);
  await page.getByRole('button', {name: '知道了'}).first().click();
  await expect(notice(page)).toHaveCount(1);
  // 关掉的那个按钮没了 ⇒ ⇒ 焦点落到还留着的那个上 ✓（§9 ✓）。
  await expect(page.getByRole('button', {name: '知道了'})).toBeFocused();
});

test('closing a message keeps the focus when the platform does not focus the button', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(() => {
    setTimeout(() => {
      throw new Error('一');
    }, 0);
    setTimeout(() => {
      throw new Error('二');
    }, 10);
  });
  await expect(notice(page)).toHaveCount(2);
  const close = page.getByRole('button', {name: '知道了'}).first();
  // **程序化点击** ✓ ⇒ ⇒ 焦点不动 ✓ ⇒ ⇒ 这就是 macOS 上点按钮的样子 ✓
  // ⇒ ⇒ （Chromium 用鼠标点会聚焦按钮 ✓ ⇒ ⇒ 那样就测不到这一条 ✓）。
  await close.evaluate((button) => (button as HTMLElement).click());
  await expect(notice(page)).toHaveCount(1);
  // 关掉的那个没了 ⇒ ⇒ 焦点落到还留着的那个上 ✓ ⇒ ⇒ 区域不是从焦点反推的 ✓。
  await expect(page.getByRole('button', {name: '知道了'})).toBeFocused();
});

test('a message that times out does not drop the focus', async ({page}) => {
  await page.goto(devOrigin + '/');
  await page.waitForSelector('[data-render-state="ready"]', {timeout: 30000});
  await page.evaluate(async () => {
    const {noticeStore} = await import('/src/application/notices.ts');
    noticeStore.push({tone: 'info', message: '定时消失'});
  });
  const card = page.getByRole('status', {name: '通知'}).first();
  await expect(card).toBeVisible();
  const close = page.getByRole('button', {name: '关闭通知'}).first();
  await close.focus();
  await expect(close).toBeFocused();
  // **十秒后它自己走** ✓ ⇒ ⇒ 定时走的那条也要接住焦点 ✓ ⇒ ⇒ 键盘的人不能丢位置 ✓。
  await expect(card).toHaveCount(0, {timeout: 20000});
  // 落回区域本身 ✓ ⇒ ⇒ 它可编程聚焦 ✓（`tabIndex={-1}` ✓）。
  await expect
    .poll(async () => page.evaluate(() => document.activeElement?.className ?? ''))
    .toContain('mf-message');
});

test('a closing message fades out before it is gone', async ({page}) => {
  await page.goto('/');
  await page.evaluate(() => {
    setTimeout(() => {
      throw new Error('退场检查');
    }, 0);
  });
  const card = page.getByRole('status', {name: '通知'}).first();
  await expect(card).toBeVisible();
  await page.getByRole('button', {name: '知道了'}).first().click();
  // **先退场、后收走** ✓ ⇒ ⇒ 这一刻它还在 ✓ ⇒ ⇒ 动画走完才真的没 ✓。
  // ⇒ ⇒ **盯属性，不盯那个元素** ✓ ⇒ ⇒ 元素在过渡完成后就没了 ✓ ⇒ ⇒ 盯元素会撞上那个窗口 ✓。
  await page.waitForFunction(
    () => document.querySelector('.mf-message-card[data-leaving="true"]') !== null,
  );
  await expect(card).toHaveCount(0);
});

test('a leaving message does not take clicks', async ({page}) => {
  await page.goto('/');
  await page.evaluate(() => {
    setTimeout(() => {
      throw new Error('退场不点');
    }, 0);
  });
  const card = page.getByRole('status', {name: '通知'}).first();
  await expect(card).toBeVisible();
  await page.getByRole('button', {name: '知道了'}).first().click();
  // **退场中的那条不吃点击** ✓ ⇒ ⇒ 看不见了就不该占着右下角那一块 ✓
  // ⇒ ⇒ （`pointer-events` 没有过渡 ✓ ⇒ ⇒ 读到的那一刻就是生效的那一刻 ✓）。
  const pointerEvents = await page
    .waitForFunction(() => {
      const leaving = document.querySelector('.mf-message-card[data-leaving="true"]');
      return leaving ? getComputedStyle(leaving).pointerEvents : null;
    })
    .then((handle) => handle.jsonValue());
  expect(pointerEvents).toBe('none');
});

test('the visual page surfaces a shape in the real region', async ({page}) => {
  // **对着开发服务器跑** ✓ ⇒ ⇒ 视觉页只在开发构建里 ✓。
  await page.goto(devOrigin + '/');
  await page.waitForSelector('[data-render-state="ready"]', {timeout: 30000});
  await page.getByRole('button', {name: '消息', exact: true}).click();
  const panel = page.getByRole('complementary', {name: '消息视觉页'});
  await expect(panel).toBeVisible();
  // 点一个用例 ⇒ ⇒ 消息出现在**真实的右下区域**里 ✓（不是静态样板 ✓）。
  await panel.getByRole('button', {name: '持续 · 失败（待确认）'}).click();
  const region = page.locator('.mf-message');
  await expect(region.locator('.mf-message-card[data-shape="persistent"]')).toBeVisible();
  await expect(region.locator('.mf-message-card[data-shape="persistent"]')).toContainText(
    '保存失败',
  );
  // 清空 ⇒ ⇒ 演示的消息不留在工作台里 ✓。
  await panel.getByRole('button', {name: '清空'}).click();
  await expect(region.locator('.mf-message-card[data-shape="persistent"]')).toHaveCount(0);
});

test('the visual page dismisses a transient message on its own', async ({page}) => {
  // **对着开发服务器跑** ✓ ⇒ ⇒ 视觉页只在开发构建里 ✓。
  await page.goto(devOrigin + '/');
  await page.waitForSelector('[data-render-state="ready"]', {timeout: 30000});
  await page.getByRole('button', {name: '消息', exact: true}).click();
  const panel = page.getByRole('complementary', {name: '消息视觉页'});
  await expect(panel).toBeVisible();
  await panel.getByRole('button', {name: '瞬时 · 成功'}).click();
  const region = page.locator('.mf-message');
  const transient = region.locator('.mf-message-card[data-shape="transient"]');
  await expect(transient).toBeVisible();
  // **一次告知不用手动关** ✓ ⇒ ⇒ 它定时自己走 ✓ ⇒ ⇒ 视觉页与产品一致 ✓
  // ⇒ ⇒ （产品是 10 秒 ✓ ⇒ ⇒ 演示是 6 秒 ✓ ⇒ ⇒ 演示短一点，看得见 ✓）。
  await page.waitForFunction(
    () => document.querySelector('.mf-message-card[data-leaving="true"]') !== null,
    {timeout: 15000},
  );
  await expect(transient).toHaveCount(0);
});

for (const width of [1600, 800]) {
  test(`body portal notifications stay above the open export dialog at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({width, height: 840});
    await page.goto('/');
    await page.waitForSelector('[data-render-state="ready"]', {timeout: 30000});
    await page.evaluate(() =>
      setTimeout(() => {
        throw new Error('Portal 消息可读性检查');
      }, 0),
    );
    const card = notice(page).first();
    await expect(card).toBeVisible();
    await page.getByRole('button', {name: '导出', exact: true}).click();
    const dialog = page.getByRole('dialog', {name: '导出与发布文档'});
    const region = page.getByRole('region', {name: '工作台消息'});
    await expect(dialog).toBeVisible();
    const layers = await region.evaluate((element) => ({
      body: element.parentElement === document.body,
      z: Number(getComputedStyle(element).zIndex),
      overlay: Number(getComputedStyle(document.querySelector('[data-export-overlay]')!).zIndex),
    }));
    expect(layers.body).toBe(true);
    expect(layers.z).toBeGreaterThan(layers.overlay);
    const close = card.getByRole('button', {name: '知道了'});
    expect(
      await close.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return top === element || element.contains(top);
      }),
    ).toBe(true);
    const filename = dialog.getByLabel('导出文件主名称');
    await filename.fill('保留导出设置');
    const submit = dialog.getByRole('button', {name: '立即导出并保存', exact: true});
    await submit.evaluate((button) => {
      button.dataset.testClicks = '0';
      button.addEventListener('click', () => {
        button.dataset.testClicks = String(Number(button.dataset.testClicks) + 1);
      });
    });
    await close.click();
    await expect(card).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(filename).toHaveValue('保留导出设置');
    await expect(filename).toBeFocused();
    await expect(submit).toBeEnabled();
    await expect(submit).toHaveAttribute('data-test-clicks', '0');
    await expect(page.getByRole('button', {name: '正在生成...'})).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', {name: '导出', exact: true})).toBeFocused();
  });
}

test('export focus stays in the dialog and message island without dismissing either accidentally', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForSelector('[data-render-state="ready"]', {timeout: 30000});
  await page.evaluate(() => {
    setTimeout(() => {
      throw new Error('焦点隔离一');
    }, 0);
    setTimeout(() => {
      throw new Error('焦点隔离二');
    }, 10);
  });
  await expect(notice(page)).toHaveCount(2);
  await page.getByRole('button', {name: '导出', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: '导出与发布文档'});
  const filename = dialog.getByLabel('导出文件主名称');
  await expect(filename).toBeFocused();
  await page.locator('textarea').evaluate((element) => element.focus());
  await expect(filename).toBeFocused();
  await dialog.getByRole('checkbox', {name: /允许联网/}).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(notice(page).last().getByRole('button', {name: '知道了'})).toBeFocused();
  const count = await page.evaluate(
    () =>
      document.querySelectorAll('[role="dialog"] button, [role="dialog"] input, .mf-message button')
        .length,
  );
  for (let i = 0; i < count + 2; i++) {
    await page.keyboard.press('Tab');
    expect(
      await page.evaluate(() =>
        Boolean(document.activeElement?.closest('[role="dialog"], .mf-message')),
      ),
    ).toBe(true);
  }
  const message = notice(page).first();
  await message.getByRole('button', {name: '知道了'}).focus();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(notice(page)).toHaveCount(2);
  expect(
    await filename.evaluate((element) =>
      element.closest('[role="dialog"]')?.contains(document.activeElement),
    ),
  ).toBe(true);
  await message.getByRole('button', {name: '知道了'}).click();
  await expect(notice(page)).toHaveCount(1);
  await expect(notice(page).getByRole('button', {name: '知道了'})).toBeFocused();
  await notice(page).getByRole('button', {name: '知道了'}).click();
  await expect(notice(page)).toHaveCount(0);
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
});

test('auto-expiring portal notification returns focus to the still-open export dialog', async ({
  page,
}) => {
  await page.goto(devOrigin + '/');
  await page.waitForSelector('[data-render-state="ready"]', {timeout: 30000});
  await page.evaluate(async () => {
    const {noticeStore} = await import('/src/application/notices.ts');
    noticeStore.push({tone: 'info', message: '导出期间自动消息'});
  });
  await page.getByRole('button', {name: '导出', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: '导出与发布文档'});
  const filename = dialog.getByLabel('导出文件主名称');
  await notice(page).getByRole('button', {name: '关闭通知'}).focus();
  await expect(notice(page)).toHaveCount(0, {timeout: 15000});
  await expect(dialog).toBeVisible();
  await expect(filename).toBeFocused();
});
test('the production build carries no message visual page', async ({page}) => {
  // 它是核对用的工具 ✓ ⇒ ⇒ 生产构建里没有那个入口 ✓。
  await page.goto('/');
  await page.waitForSelector('[data-render-state="ready"]', {timeout: 30000});
  await expect(page.getByRole('button', {name: '消息', exact: true})).toHaveCount(0);
});

test('the message region follows the workbench theme switch', async ({page}) => {
  await page.goto('/');
  await page.waitForSelector('[data-render-state="ready"]', {timeout: 30000});
  const region = page.locator('.mf-message');
  // 应用默认深色 ✓ ⇒ ⇒ 区域跟着深色 ✓。
  expect(await region.evaluate((node) => getComputedStyle(node).colorScheme)).toBe('dark');
  await page.getByRole('button', {name: '切换浅色模式'}).click();
  expect(await region.evaluate((node) => getComputedStyle(node).colorScheme)).toBe('light');
});
