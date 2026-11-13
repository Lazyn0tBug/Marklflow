import {test, expect, type Page} from './fixtures';

test.use({viewport: {width: 1440, height: 960}});

/**
 * 面板几何 ✓：**从 CSS 的 token 按当前根字号算出来** ✓（设计 §6 ✓）。
 *
 * 断言不写死数值 ✓ ⇒ ⇒ 契约的取值改了，测试按同一规则跟着算 ✓。
 */
const paneGeometry = (page: Page) =>
  page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    const root = parseFloat(style.fontSize);
    const rem = (token: string) => {
      const raw = style.getPropertyValue(token).trim();
      const value = parseFloat(raw);
      return raw.endsWith('rem') ? value * root : value;
    };
    return {
      root,
      minimum: rem('--mf-pane-min'),
      handle: rem('--mf-split-handle'),
    };
  });
async function ready(page: Page) {
  await expect(page.locator('[data-render-state]')).toHaveAttribute('data-render-state', 'ready', {
    timeout: 30000,
  });
}
async function boot(page: Page) {
  await page.goto('/');
  await ready(page);
  await page
    .locator('textarea')
    .fill(
      '# Split check\n\n' +
        Array.from(
          {length: 70},
          (_, i) => 'Paragraph ' + i + ' with source text and selection preservation.',
        ).join('\n\n'),
    );
  await ready(page);
}
async function twoFrames(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}
async function watchCapture(page: Page) {
  await page.evaluate(() => {
    const target = document.querySelector('[role=separator]')!;
    target.addEventListener(
      'gotpointercapture',
      (event) => {
        (window as Window & {__splitPointer?: number; __splitHandle?: Element}).__splitPointer = (
          event as PointerEvent
        ).pointerId;
        (window as Window & {__splitHandle?: Element}).__splitHandle = target;
      },
      {once: true},
    );
  });
}
async function watchLostCapture(page: Page, pointerId: number) {
  await page.evaluate((id) => {
    const target = document.querySelector('[role=separator]')!;
    target.addEventListener(
      'lostpointercapture',
      (event) => {
        if ((event as PointerEvent).pointerId === id)
          (window as Window & {__splitLostPointer?: number}).__splitLostPointer = id;
      },
      {once: true},
    );
  }, pointerId);
}
const separator = (page: Page) => page.getByRole('separator', {name: '调整编辑器与 HTML 视图宽度'});

test('resizes with pointer and keyboard, cancels safely, and preserves editing state', async ({
  page,
}, info) => {
  await boot(page);
  const editor = page.getByRole('textbox', {name: 'Markdown 编辑器'}),
    handle = separator(page);
  await expect(handle).toHaveAttribute('aria-valuenow', '50');
  await editor.evaluate((el: HTMLTextAreaElement) => {
    el.focus();
    el.setSelectionRange(4, 15);
    el.scrollTop = 280;
  });
  const before = await editor.evaluate((el: HTMLTextAreaElement) => ({
    value: el.value,
    selection: [el.selectionStart, el.selectionEnd],
    top: el.scrollTop,
    focused: document.activeElement === el,
  }));
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + 150, box!.y + box!.height / 2, {steps: 5});
  await page.mouse.up();
  await expect.poll(() => handle.getAttribute('aria-valuenow')).not.toBe('50');
  await expect(handle).toHaveAttribute('aria-valuemin', /\d+/);
  await expect(handle).toHaveAttribute('aria-valuemax', /\d+/);
  expect(
    await editor.evaluate((el: HTMLTextAreaElement) => ({
      value: el.value,
      selection: [el.selectionStart, el.selectionEnd],
      focused: document.activeElement === el,
    })),
  ).toEqual({value: before.value, selection: before.selection, focused: before.focused});
  await handle.focus();
  const initial = Number(await handle.getAttribute('aria-valuenow'));
  await page.keyboard.press('ArrowRight');
  await expect(handle).toHaveAttribute(
    'aria-valuenow',
    String(Math.min(Number(await handle.getAttribute('aria-valuemax')), initial + 2)),
  );
  await page.keyboard.press('Home');
  await expect(handle).toHaveAttribute('aria-valuenow', '50');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await expect(handle).toHaveAttribute('aria-valuenow', '50');
  await handle.evaluate((el) => el.dispatchEvent(new MouseEvent('dblclick', {bubbles: true})));
  await expect(handle).toHaveAttribute('aria-valuenow', '50');
  const saved = await page.evaluate(() => localStorage.getItem('markflow_split_preferences_v1'));
  expect(saved).toContain('"ratio":0.5');
  const start = await handle.boundingBox();
  await watchCapture(page);
  await page.mouse.move(start!.x + 4, start!.y + start!.height / 2);
  await page.mouse.down();
  await page.mouse.move(start!.x + 100, start!.y + start!.height / 2, {steps: 3});
  const pointerId = await page.evaluate(
    () => (window as Window & {__splitPointer?: number}).__splitPointer,
  );
  expect(pointerId).toBeDefined();
  await expect(handle).not.toHaveAttribute('aria-valuenow', '50');
  await handle.evaluate(
    (el, id) =>
      el.dispatchEvent(new PointerEvent('pointercancel', {bubbles: true, pointerId: id!})),
    pointerId,
  );
  await expect(handle).toHaveAttribute('aria-valuenow', '50');
  await twoFrames(page);
  await expect(handle).toHaveAttribute('aria-valuenow', '50');
  expect(await handle.evaluate((el, id) => el.hasPointerCapture(id!), pointerId)).toBe(false);
  expect(await page.evaluate(() => localStorage.getItem('markflow_split_preferences_v1'))).toBe(
    saved,
  );
  await page.mouse.up();
  const current = await handle.boundingBox();
  await watchCapture(page);
  await page.mouse.move(current!.x + 4, current!.y + current!.height / 2);
  await page.mouse.down();
  await page.mouse.move(current!.x + 90, current!.y + current!.height / 2, {steps: 3});
  await expect(handle).not.toHaveAttribute('aria-valuenow', '50');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(handle).toHaveAttribute('aria-valuenow', '50');
  await twoFrames(page);
  await expect(handle).toHaveAttribute('aria-valuenow', '50');
  const blurPointer = await page.evaluate(
    () => (window as Window & {__splitPointer?: number}).__splitPointer,
  );
  expect(blurPointer).toBeDefined();
  expect(await handle.evaluate((el, id) => el.hasPointerCapture(id!), blurPointer)).toBe(false);
  expect(await page.evaluate(() => localStorage.getItem('markflow_split_preferences_v1'))).toBe(
    saved,
  );
  await page.mouse.up();
  const lostStart = await handle.boundingBox();
  await watchCapture(page);
  await page.mouse.move(lostStart!.x + 4, lostStart!.y + lostStart!.height / 2);
  await page.mouse.down();
  await page.mouse.move(lostStart!.x + 85, lostStart!.y + lostStart!.height / 2, {steps: 3});
  await expect(handle).not.toHaveAttribute('aria-valuenow', '50');
  const lostPointer = await page.evaluate(
    () => (window as Window & {__splitPointer?: number}).__splitPointer,
  );
  expect(lostPointer).toBeDefined();
  await watchLostCapture(page, lostPointer!);
  await handle.evaluate((el, id) => el.releasePointerCapture(id!), lostPointer);
  // Capture release is pending until the next pointer event; moving while held
  // delivers lostpointercapture before pointermove, so the resize cancels without committing.
  await page.mouse.move(lostStart!.x + 86, lostStart!.y + lostStart!.height / 2);
  await expect
    .poll(() =>
      page.evaluate(() => (window as Window & {__splitLostPointer?: number}).__splitLostPointer),
    )
    .toBe(lostPointer);
  await expect(handle).toHaveAttribute('aria-valuenow', '50');
  await twoFrames(page);
  await expect(handle).toHaveAttribute('aria-valuenow', '50');
  expect(await handle.evaluate((el, id) => el.hasPointerCapture(id!), lostPointer)).toBe(false);
  expect(await page.evaluate(() => localStorage.getItem('markflow_split_preferences_v1'))).toBe(
    saved,
  );
  await page.mouse.up();
  const hiddenStart = await handle.boundingBox();
  await watchCapture(page);
  await page.mouse.move(hiddenStart!.x + 4, hiddenStart!.y + hiddenStart!.height / 2);
  await page.mouse.down();
  await page.mouse.move(hiddenStart!.x + 70, hiddenStart!.y + hiddenStart!.height / 2, {steps: 3});
  await expect(handle).not.toHaveAttribute('aria-valuenow', '50');
  const hiddenPointer = await page.evaluate(
    () => (window as Window & {__splitPointer?: number}).__splitPointer,
  );
  expect(hiddenPointer).toBeDefined();
  await page
    .getByRole('button', {name: '预览', exact: true})
    .evaluate((el: HTMLButtonElement) => el.click());
  await expect(handle).toHaveCount(0);
  await page
    .getByRole('button', {name: '预览', exact: true})
    .evaluate((el: HTMLButtonElement) => el.click());
  await expect(handle).toHaveAttribute('aria-valuenow', '50');
  await twoFrames(page);
  await expect(handle).toHaveAttribute('aria-valuenow', '50');
  expect(
    await page.evaluate((id) => {
      const target = (window as Window & {__splitHandle?: Element}).__splitHandle;
      return target?.hasPointerCapture(id!);
    }, hiddenPointer),
  ).toBe(false);
  expect(await page.evaluate(() => localStorage.getItem('markflow_split_preferences_v1'))).toBe(
    saved,
  );
  await page.mouse.up();
  await page.screenshot({path: info.outputPath('split-desktop.png')});
});

test('scales the pane limits and the narrow threshold with the root font size', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('textarea')).toBeVisible();
  const before = await paneGeometry(page);
  await expect(page.locator('#workbench-document')).toHaveCSS(
    'min-width',
    `${before.minimum * 2 + before.handle}px`,
  );

  // 根字号放大 ⇒ ⇒ 面板下限**由 token 直接驱动** ⇒ ⇒ 跟着放大 ✓（设计 §6 ✓）。
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '24px';
  });
  await page.waitForTimeout(200);
  const scaled = await paneGeometry(page);
  expect(scaled.root).toBe(before.root * 1.5);
  expect(scaled.minimum).toBeCloseTo(before.minimum * 1.5);
  await expect(page.locator('#workbench-document')).toHaveCSS(
    'min-width',
    `${scaled.minimum * 2 + scaled.handle}px`,
  );

  // 窄屏阈值**一起放大** ⇒ ⇒ 同一个窗口宽度现在放不下两个面板 ⇒ ⇒ 进入单视图 ✓。
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '32px';
  });
  await page.setViewportSize({width: 1000, height: 900});
  await page.waitForTimeout(300);
  const widest = await paneGeometry(page);
  expect(widest.minimum * 2 + widest.handle).toBeGreaterThan(1000);
  await expect(page.locator('[data-view=outline]')).toBeHidden();
  await expect(page.locator('[data-view=editor]')).toBeVisible();
  await expect(page.locator('[data-view=html]')).toBeHidden();
});

test('shows one content view on a narrow screen and restores both when the window widens', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('textarea')).toBeVisible();
  // **窄屏** ✓ ⇒ ⇒ 连两个面板的最小宽度都放不下时，左栏收起、主区一次只显示一个视图 ✓（设计 §6 ✓）。
  await page.setViewportSize({width: 684, height: 900});
  await expect(page.locator('[data-view=outline]')).toBeHidden();
  await expect(page.locator('[data-view=editor]')).toBeVisible();
  await expect(page.locator('[data-view=html]')).toBeHidden();
  // 顶栏的视图开关在窄屏下是**切换**而不是叠加 ✓ ⇒ ⇒ 点哪一个就显示哪一个 ✓。
  await page.getByRole('button', {name: '预览', exact: true}).click();
  await expect(page.locator('[data-view=html]')).toBeVisible();
  await expect(page.locator('[data-view=editor]')).toBeHidden();
  await page.getByRole('button', {name: '编辑器', exact: true}).click();
  await expect(page.locator('[data-view=editor]')).toBeVisible();
  await expect(page.locator('[data-view=html]')).toBeHidden();
  // 左栏仍然可达 ✓ ⇒ ⇒ 顶栏的侧栏开关能把它叫回来 ✓。
  await page.getByRole('button', {name: '大纲', exact: true}).click();
  await expect(page.locator('[data-view=outline]')).toBeVisible();
  // 窗口变宽 ⇒ ⇒ 两个视图回到并排 ✓ ⇒ ⇒ 显隐意图没有被改写 ✓。
  await page.setViewportSize({width: 1600, height: 900});
  await expect(page.locator('[data-view=editor]')).toBeVisible();
  await expect(page.locator('[data-view=html]')).toBeVisible();
  await expect(page.locator('[data-view=outline]')).toBeVisible();
});

test('keeps all seven visibility combinations and scrolls the workbench on narrow screens', async ({
  page,
}, info) => {
  await boot(page);
  const controls = [
    page.getByRole('button', {name: '大纲', exact: true}),
    page.getByRole('button', {name: '编辑器', exact: true}),
    page.getByRole('button', {name: '预览', exact: true}),
  ];
  for (let mask = 1; mask < 8; mask++) {
    for (const control of controls)
      if ((await control.getAttribute('aria-pressed')) === 'false') await control.click();
    for (const [index, control] of controls.entries())
      if (!(mask & (1 << index))) await control.click();
    for (const [index, control] of controls.entries()) {
      await expect(control).toHaveAttribute('aria-pressed', String(Boolean(mask & (1 << index))));
      if (mask === 1 << index) await expect(control).toBeDisabled();
    }
    if ((mask & 6) === 6) await expect(separator(page)).toBeVisible();
    else await expect(separator(page)).toHaveCount(0);
  }
  // 宽度 800：**仍在并排契约之内** ✓ ⇒ ⇒ 窄屏（< 728px）一次只显示一个视图的契约另由
  // workbench-split.spec.ts 的窄屏用例覆盖 ✓（设计 §6 ✓）。
  await page.setViewportSize({width: 800, height: 900});
  const workbench = page.locator('[data-workbench]');
  expect(await workbench.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  const geometry = await paneGeometry(page);
  await expect(page.locator('#workbench-document')).toHaveCSS(
    'min-width',
    `${geometry.minimum * 2 + geometry.handle}px`,
  );
  const panes = await page.evaluate(() => ({
    editor: document.querySelector('[data-view=editor]')!.getBoundingClientRect().width,
    html: document.querySelector('[data-view=html]')!.getBoundingClientRect().width,
  }));
  expect(panes.editor).toBeGreaterThanOrEqual(359);
  expect(panes.html).toBeGreaterThanOrEqual(359);
  await page.screenshot({path: info.outputPath('split-narrow.png')});
});

test('does not alter source, revision-bound preview identity or A4 artifact when resizing', async ({
  page,
}, info) => {
  await boot(page);
  await page.getByRole('button', {name: '分页', exact: true}).click();
  await expect(page.locator('[data-pagination-state]')).toHaveAttribute(
    'data-pagination-state',
    'ready',
    {timeout: 60000},
  );
  const source = await page.locator('textarea').inputValue(),
    reference = await page
      .locator('[data-preview-reference]')
      .getAttribute('data-preview-reference');
  const pageState = await page.locator('[data-page-count]').evaluate((el: HTMLElement) => ({
    count: el.dataset.pageCount,
    width: el.querySelector<HTMLElement>('.pagedjs_page')?.getBoundingClientRect().width,
    height: el.querySelector<HTMLElement>('.pagedjs_page')?.getBoundingClientRect().height,
  }));
  const revisions = await page.evaluate(() => ({
    hash: document
      .querySelector('[data-preview-reference]')
      ?.getAttribute('data-preview-reference'),
    source: document.querySelector('textarea')?.value,
  }));
  const handle = separator(page),
    box = await handle.boundingBox();
  await page.mouse.move(box!.x + 4, box!.y + 100);
  await page.mouse.down();
  await page.mouse.move(box!.x + 120, box!.y + 100, {steps: 4});
  await page.mouse.up();
  await expect(handle).not.toHaveAttribute('aria-valuenow', '50');
  expect(await page.locator('textarea').inputValue()).toBe(source);
  expect(
    await page.locator('[data-preview-reference]').getAttribute('data-preview-reference'),
  ).toBe(reference);
  expect(revisions.source).toBe(source);
  expect(
    await page.locator('[data-page-count]').evaluate((el: HTMLElement) => ({
      count: el.dataset.pageCount,
      width: el.querySelector<HTMLElement>('.pagedjs_page')?.getBoundingClientRect().width,
      height: el.querySelector<HTMLElement>('.pagedjs_page')?.getBoundingClientRect().height,
    })),
  ).toEqual(pageState);
  await page.getByRole('button', {name: '设置', exact: true}).click();
  await expect(page.getByLabel('编辑器与 HTML 内容最大宽度')).toHaveValue('1024');
  await page.keyboard.press('Escape');
  await page.screenshot({path: info.outputPath('split-a4.png')});
});
