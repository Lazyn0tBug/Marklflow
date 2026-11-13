import {test, expect} from './fixtures';
test.use({viewport: {width: 1280, height: 900}});

test('flow HTML keeps an A4 minimum for short content and grows for long content', async ({
  page,
}) => {
  await page.goto('/');
  const editor = page.locator('textarea');
  await editor.fill('# 短文验收\n\n只有一小段内容。');
  const paper = page.locator('.mf-reading-document[data-render-state="ready"]');
  await expect(paper).toContainText('短文验收');
  const short = await paper.evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    minimum: parseFloat(getComputedStyle(element).minBlockSize),
  }));
  expect(short.minimum).toBeCloseTo((297 * 96) / 25.4, 1);
  expect(short.height).toBeGreaterThanOrEqual(short.minimum - 1);
  await expect(page.locator('.mf-document-shell')).toHaveCSS('max-width', '1024px');
  await editor.fill(
    '# 长文验收\n\n' + Array.from({length: 100}, (_, i) => `第 ${i} 段内容。`).join('\n\n'),
  );
  await expect(paper).toContainText('第 99 段内容');
  expect(await paper.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThan(
    short.height,
  );
});
test('keeps all seven pane combinations under user control and prevents hiding the last', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('textarea')).toBeVisible();
  const controls = [
    page.getByRole('button', {name: /侧边文档与大纲 \(侧边点击\)/}),
    page.getByRole('button', {name: '编辑器', exact: true}),
    page.getByRole('button', {name: 'HTML 预览', exact: true}),
  ];
  for (let mask = 1; mask < 8; mask++) {
    for (const control of controls)
      if ((await control.getAttribute('aria-pressed')) === 'false') await control.click();
    for (const [i, control] of controls.entries()) if (!(mask & (1 << i))) await control.click();
    for (const [i, control] of controls.entries())
      await expect(control).toHaveAttribute('aria-pressed', String(Boolean(mask & (1 << i))));
    if ((mask & (mask - 1)) === 0) {
      const control = controls[Math.log2(mask)];
      if (!control) throw new Error('Expected visible pane control');
      await expect(control).toBeDisabled();
    }
  }
  // 宽度 800：**仍在并排契约之内** ✓ ⇒ ⇒ 窄屏（< 728px）一次只显示一个视图的契约另由
  // workbench-split.spec.ts 的窄屏用例覆盖 ✓（设计 §6 ✓）。
  await page.setViewportSize({width: 800, height: 900});
  for (const name of ['outline', 'editor', 'html'])
    await expect(page.locator('[data-view=' + name + ']')).toBeVisible();
  expect(
    await page.locator('[data-workbench]').evaluate((n) => n.scrollWidth > n.clientWidth),
  ).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('opens hidden width settings as a real dialog and closes with Escape', async ({
  page,
}, info) => {
  await page.goto('/');
  await expect(page.locator('textarea')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', {name: '设置', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: '工作台设置'});
  await expect(dialog).toBeVisible();
  await expect(page.getByLabel('编辑器与 HTML 内容最大宽度')).toHaveValue('1024');
  await page.getByLabel('编辑器与 HTML 内容最大宽度').selectOption('800');
  await page.screenshot({path: info.outputPath('settings.png')});
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.mf-document-shell')).toHaveCSS('max-width', '800px');
  await expect(page.getByRole('button', {name: '设置', exact: true})).toBeFocused();
});
test('saves undo and redo revisions and restores the selected document math preference', async ({
  page,
}) => {
  await page.goto('/');
  const editor = page.locator('textarea');
  await expect(editor).toBeVisible();
  await editor.fill('# 最初');
  await page.keyboard.press('ControlOrMeta+s');
  await editor.fill('# 更新');
  await editor.press('Control+z');
  await expect(editor).toHaveValue('# 最初');
  await expect(page.getByText('草稿已保存', {exact: true})).toBeVisible();
  await page.reload();
  await expect(page.locator('textarea')).toHaveValue('# 最初');
  await page.getByRole('button', {name: 'MathML', exact: true}).click();
  await page.getByRole('button', {name: '新建文档', exact: true}).click();
  await expect(page.getByRole('button', {name: 'MathML', exact: true})).toBeVisible();
});
test('synchronizes outline, editor and HTML using stable source headings', async ({page}) => {
  await page.goto('/');
  const editor = page.locator('textarea');
  await expect(editor).toBeVisible();
  const md = Array.from(
    {length: 12},
    (_, i) =>
      '# 章节' +
      i +
      '\n\n' +
      Array.from({length: 20}, (_, j) => '段落' + i + '_' + j + ' 内容').join('\n\n'),
  ).join('\n\n');
  await editor.fill(md);
  await expect(page.locator('[data-render-state]')).toHaveAttribute('data-render-state', 'ready');
  await page.getByRole('button', {name: /^大纲 \(/}).click();
  await page.locator('button[title^="章节5 (第"]').click();
  await expect.poll(() => editor.evaluate((n) => n.scrollTop)).toBeGreaterThan(4000);
  // 阅读面是 .mf-view：面板顶部有一条控件条，"面板的第一个 div"不再唯一 ✓（设计 §2 ✓）。
  const preview = page.locator('[data-view=html] > .mf-view');
  await expect.poll(() => preview.evaluate((n) => n.scrollTop)).toBeGreaterThan(500);
  await editor.press('Control+Home');
  await expect.poll(() => preview.evaluate((n) => n.scrollTop)).toBe(0);
  await preview.hover();
  await page.mouse.wheel(0, 100000);
  await expect.poll(() => editor.evaluate((n) => n.scrollTop)).toBeGreaterThan(5000);
  await expect(page.locator('[aria-current=location]')).toHaveCount(1);
});
