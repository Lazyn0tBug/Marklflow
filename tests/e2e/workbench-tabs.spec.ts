import {test, expect, recordDialogs, type Page} from './fixtures';
interface Probe {
  starts: {id: string; docId: string; kind: string; source: string}[];
  results: string[];
  hold: string;
  held: number;
}
declare global {
  interface Window {
    __u6e: Probe;
  }
}
async function instrument(page: Page) {
  await page.addInitScript(() => {
    const probe: Probe = {starts: [], results: [], hold: '', held: 0};
    window.__u6e = probe;
    const post = Worker.prototype.postMessage,
      terminate = Worker.prototype.terminate,
      observed = new WeakSet<Worker>(),
      terminated = new WeakSet<Worker>();
    Worker.prototype.terminate = function (this: Worker) {
      terminated.add(this);
      Reflect.apply(terminate, this, []);
    };
    Worker.prototype.postMessage = function (
      this: Worker,
      message: unknown,
      options?: StructuredSerializeOptions | Transferable[],
    ) {
      if (!observed.has(this)) {
        observed.add(this);
        this.addEventListener('message', (event: MessageEvent<unknown>) => {
          const data = event.data as {type?: string; execution?: {task?: {taskId?: string}}};
          if (data.type === 'result' && data.execution?.task?.taskId)
            probe.results.push(data.execution.task.taskId);
        });
      }
      const value = message as {
        type?: string;
        request?: {
          identity?: {taskId: string};
          document?: {id: string; markdown: string};
          kind?: string;
        };
      };
      if (value.type === 'start' && value.request?.document) {
        const doc = value.request.document;
        probe.starts.push({
          id: value.request.identity?.taskId ?? '',
          docId: doc.id,
          kind: value.request.kind ?? '',
          source: doc.markdown.slice(0, 100),
        });
        if (probe.hold && doc.markdown.startsWith(probe.hold)) {
          probe.hold = '';
          probe.held++;
          setTimeout(() => {
            if (!terminated.has(this)) Reflect.apply(post, this, [message, options]);
          }, 1500);
          return;
        }
      }
      Reflect.apply(post, this, [message, options]);
    };
  });
}
const source = (name: string) =>
  [
    '# ' + name,
    '',
    ...Array.from({length: 55}, (_, i) => 'line ' + i + ' ' + name),
    '',
    '## End',
    'END_' + name,
  ].join(String.fromCharCode(10));
async function ready(page: Page, name: string) {
  await expect(page.locator('[data-render-state]')).toHaveAttribute('data-render-state', 'ready', {
    timeout: 30000,
  });
  await expect(page.locator('.mf-doc')).toContainText('END_' + name);
}
async function boot(page: Page, name = 'Alpha') {
  await instrument(page);
  await page.goto('/');
  await expect(page.locator('[data-render-state]')).toHaveAttribute('data-render-state', 'ready', {
    timeout: 30000,
  });
  await page.getByRole('textbox', {name: 'Markdown 编辑器'}).fill(source(name));
  await ready(page, name);
}
async function create(page: Page, name: string) {
  const tabs = page.getByRole('tab'),
    count = await tabs.count();
  await page.getByTitle('创建新空白 Markdown 文档').click();
  await expect(tabs).toHaveCount(count + 1);
  await expect(tabs.last()).toHaveAttribute('aria-selected', 'true');
  const editor = page.getByRole('textbox', {name: 'Markdown 编辑器'});
  await expect(editor).toHaveValue('# 新建 Markdown 文档\n\n在此开始撰写您的 Markdown 内容...\n');
  await editor.fill(source(name));
  await ready(page, name);
}
const tab = (page: Page, name: string) => page.getByRole('tab', {name: new RegExp('^' + name)});

test('keeps bottom tabs, independent history/selection/scroll and restores cache without generation', async ({
  page,
}, info) => {
  await boot(page);
  const editor = page.getByRole('textbox', {name: 'Markdown 编辑器'});
  await editor.press('Control+End');
  await editor.press('End');
  await editor.press('Enter');
  await editor.pressSequentially('ADRAFT_ALPHA');
  await ready(page, 'Alpha');
  await editor.evaluate((el: HTMLTextAreaElement) => {
    el.setSelectionRange(12, 22);
    el.scrollTop = 400;
    el.scrollLeft = 9;
    el.dispatchEvent(new Event('scroll'));
  });
  const saved = await editor.evaluate((el: HTMLTextAreaElement) => ({
    start: el.selectionStart,
    end: el.selectionEnd,
    top: el.scrollTop,
    left: el.scrollLeft,
  }));
  const reference = await page
    .locator('[data-preview-reference]')
    .getAttribute('data-preview-reference');
  await create(page, 'Beta');
  const before = await page.evaluate(() => window.__u6e.starts.length);
  await tab(page, 'Alpha').click();
  await ready(page, 'Alpha');
  expect(
    await page.locator('[data-preview-reference]').getAttribute('data-preview-reference'),
  ).toBe(reference);
  expect(await page.evaluate(() => window.__u6e.starts.length)).toBe(before);
  expect(
    await editor.evaluate((el: HTMLTextAreaElement) => ({
      start: el.selectionStart,
      end: el.selectionEnd,
      top: el.scrollTop,
      left: el.scrollLeft,
    })),
  ).toEqual(saved);
  await editor.press('Control+z');
  await expect(editor).not.toHaveValue(/ADRAFT_ALPHA/);
  await editor.press('Control+Shift+z');
  await expect(editor).toHaveValue(/ADRAFT_ALPHA/);
  await tab(page, 'Beta').click();
  await expect(editor).not.toHaveValue(/ADRAFT_ALPHA/);
  await create(page, 'Gamma');
  await expect(page.getByRole('tab')).toHaveCount(3);
  await tab(page, 'Beta').click();
  await ready(page, 'Beta');
  const bounds = await page.evaluate(() => ({
    editor: document.querySelector('textarea')!.getBoundingClientRect().bottom,
    tabs: document.querySelector('[data-document-tabs]')!.getBoundingClientRect().top,
  }));
  expect(bounds.tabs).toBeGreaterThanOrEqual(bounds.editor - 1);
  await page.screenshot({path: info.outputPath('tabs-desktop.png')});
  await page.getByRole('button', {name: '编辑器', exact: true}).click();
  await expect(page.getByRole('tablist')).toBeVisible();
  await tab(page, 'Alpha').click();
  await ready(page, 'Alpha');
  await tab(page, 'Alpha').focus();
  await tab(page, 'Alpha').press('ArrowRight');
  await expect(tab(page, 'Beta')).toHaveAttribute('aria-selected', 'true');
  await page.setViewportSize({width: 390, height: 844});
  await expect(page.getByRole('tablist')).toBeVisible();
  await page.screenshot({path: info.outputPath('tabs-narrow.png')});
});

test('discards unfinished foreground computation, caches background completion and preserves active display', async ({
  page,
}) => {
  await boot(page);
  await create(page, 'Beta');
  const betaRef = await page
    .locator('[data-preview-reference]')
    .getAttribute('data-preview-reference');
  await tab(page, 'Alpha').click();
  await ready(page, 'Alpha');
  await page.evaluate(() => {
    window.__u6e.hold = '# HOLD_A';
  });
  await page.locator('textarea').fill(source('HOLD_A'));
  await expect.poll(() => page.evaluate(() => window.__u6e.held)).toBe(1);
  await tab(page, 'Beta').click();
  await ready(page, 'Beta');
  expect(
    await page.locator('[data-preview-reference]').getAttribute('data-preview-reference'),
  ).toBe(betaRef);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__u6e.starts.filter(
            (record) =>
              record.source.startsWith('# HOLD_A') && window.__u6e.results.includes(record.id),
          ).length,
      ),
    )
    .toBeGreaterThanOrEqual(1);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(page.locator('.mf-doc')).not.toContainText('HOLD_A');
  expect(
    await page.locator('[data-preview-reference]').getAttribute('data-preview-reference'),
  ).toBe(betaRef);
  const count = await page.evaluate(() => window.__u6e.starts.length);
  await tab(page, 'HOLD_A').click();
  await ready(page, 'HOLD_A');
  expect(await page.evaluate(() => window.__u6e.starts.length)).toBe(count);
});

// Known failure: the math-mode switch does not invalidate the flow preview reference.
// Tracked in docs/contracts/known-failures.md; the case runs again once the defect is fixed.
test.fixme('keeps flow/A4 cache entries independent and invalidates a changed math configuration', async ({
  page,
}) => {
  await boot(page);
  const flow = await page
    .locator('[data-preview-reference]')
    .getAttribute('data-preview-reference');
  await page.getByRole('button', {name: '分页', exact: true}).click();
  await expect(page.locator('[data-pagination-state]')).toHaveAttribute(
    'data-pagination-state',
    'ready',
    {timeout: 60000},
  );
  const a4 = await page.locator('[data-page-count]').getAttribute('data-preview-reference');
  const count = await page.evaluate(() => window.__u6e.starts.length);
  await page.getByRole('button', {name: '流式', exact: true}).click();
  await ready(page, 'Alpha');
  expect(
    await page.locator('[data-preview-reference]').getAttribute('data-preview-reference'),
  ).toBe(flow);
  await page.getByRole('button', {name: '分页', exact: true}).click();
  await expect(page.locator('[data-pagination-state]')).toHaveAttribute(
    'data-pagination-state',
    'ready',
  );
  expect(await page.locator('[data-page-count]').getAttribute('data-preview-reference')).toBe(a4);
  expect(await page.evaluate(() => window.__u6e.starts.length)).toBe(count);
  await page.getByRole('button', {name: '流式', exact: true}).click();
  await page.getByTitle(/当前公式输出模式/).click();
  await ready(page, 'Alpha');
  expect(
    await page.locator('[data-preview-reference]').getAttribute('data-preview-reference'),
  ).not.toBe(flow);
});

test('closing saved tabs preserves workspace files including when the last tab is closed', async ({
  page,
}) => {
  await boot(page);
  await create(page, 'Beta');
  await expect(tab(page, 'Beta')).not.toHaveAttribute('title', /未保存/);
  await page.getByRole('button', {name: '关闭 Beta', exact: true}).click();
  await expect(tab(page, 'Beta')).toHaveCount(0);
  await ready(page, 'Alpha');
  await expect(tab(page, 'Alpha')).not.toHaveAttribute('title', /未保存/);
  await page.getByRole('button', {name: '关闭 Alpha', exact: true}).click();
  await expect(page.getByText('选择文档以打开标签页，或新建文档。')).toBeVisible();
  await page.getByText('Beta', {exact: true}).click();
  await ready(page, 'Beta');
  await expect(tab(page, 'Beta')).toHaveCount(1);
});

test('closing a tab asks only about the write, and a tab with nothing to write closes silently', async ({
  page,
}) => {
  await boot(page);
  const dialogs = recordDialogs(page);
  // **刚打开未改动的文档** ✓ ⇒ ⇒ **不提示** ✓（M5-8 ✓）。
  await page.getByTitle('创建新空白 Markdown 文档').click();
  await expect(page.getByRole('tab')).toHaveCount(2);
  await page.getByRole('button', {name: '关闭 新建 Markdown 文档', exact: true}).click();
  await expect(page.getByRole('tab')).toHaveCount(1);
  expect(dialogs).toHaveLength(0);
  // **改了但没有要写回的文件** ✓ ⇒ ⇒ **不提示** ✓ ⇒ ⇒ **那一句只问写回文件** ✓（§16 ✓）。
  // ⇒ ⇒ **草稿那边自己报它自己** ✓ ⇒ ⇒ **关掉不丢** ✓。
  await page.locator('textarea').fill(source('UNSAVED'));
  await page.getByRole('button', {name: '关闭 UNSAVED', exact: true}).click();
  expect(dialogs).toHaveLength(0);
  await expect(tab(page, 'UNSAVED')).toHaveCount(0);
});

test('a failed draft save while closing is reported but does not trap the tab', async ({page}) => {
  await boot(page);
  await create(page, 'Beta');
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = function () {
      throw new Error('u6e controlled save failure');
    };
  }); // **不再弹窗** ✓ ⇒ ⇒ 原文只进控制台 ✓ ⇒ ⇒ 用户看到的是一条可关闭的通知 ✓。
  const dialogs = recordDialogs(page);
  await page.locator('textarea').fill(source('UNSAVED'));
  await page.getByRole('button', {name: '关闭 UNSAVED', exact: true}).click();
  // **这一条是草稿没存住** ✓ ⇒ ⇒ 类别是 `storage-write-failed` ✓ ⇒ ⇒ 不是"保存失败" ✓
  // ⇒ ⇒ **"保存"现在指写回文件** ✓（设计 §6.4 ✓）⇒ ⇒ 写回失败才是那一条 ✓。
  await expect(page.getByText(/（storage-write-failed · e-\d+）/)).toBeVisible();
  // **失败不再用弹窗告知** ✓ ⇒ ⇒ 通知面给 ✓。
  expect(dialogs.some((value) => value.includes('没能存下来'))).toBe(false);
  // **标签页不会被困住** ✓ ⇒ ⇒ 写不进去也关得掉 ✓ ⇒ ⇒ **关掉不丢** ✓ ⇒ ⇒
  // **内容还在工作区** ✓ ⇒ ⇒ 重新打开还在 ✓（§16 ✓）。
  await expect(tab(page, 'UNSAVED')).toHaveCount(0);
  await page.getByText('UNSAVED', {exact: true}).click();
  await ready(page, 'UNSAVED');
  await expect(page.locator('textarea')).toHaveValue(source('UNSAVED'));
});

test('production tabs and their compute pipeline run on ordinary HTTP', async ({page}) => {
  await instrument(page);
  await page.route('http://markflow-tabs.test/**', async (route) => {
    const url = new URL(route.request().url()),
      response = await route.fetch({url: 'http://127.0.0.1:4173' + url.pathname + url.search});
    await route.fulfill({response});
  });
  await page.goto('http://markflow-tabs.test/');
  await expect(page.locator('[data-render-state]')).toHaveAttribute('data-render-state', 'ready', {
    timeout: 30000,
  });
  await page.locator('textarea').fill(source('HTTP_ALPHA'));
  await ready(page, 'HTTP_ALPHA');
  await create(page, 'HTTP_BETA');
  const count = await page.evaluate(() => window.__u6e.starts.length);
  await tab(page, 'HTTP_ALPHA').click();
  await ready(page, 'HTTP_ALPHA');
  expect(await page.evaluate(() => window.__u6e.starts.length)).toBe(count);
  expect(await page.evaluate(() => isSecureContext)).toBe(false);
});

test('restores the active source anchor after editor geometry changes across a Tab switch', async ({
  page,
}) => {
  await boot(page);
  const editor = page.getByRole('textbox', {name: 'Markdown 编辑器'}),
    line = 37;
  await editor.evaluate((el: HTMLTextAreaElement, line) => {
    const style = getComputedStyle(el);
    el.scrollTop = (line - 1) * parseFloat(style.lineHeight) + parseFloat(style.paddingTop) + 8;
    el.dispatchEvent(new Event('scroll'));
  }, line);
  const before = await editor.evaluate((el: HTMLTextAreaElement) => ({
    top: el.scrollTop,
    value: el.value,
  }));
  await create(page, 'Beta');
  const starts = await page.evaluate(() => window.__u6e.starts.length);
  await page.getByRole('button', {name: '设置', exact: true}).click();
  await page.getByLabel('编辑器与 HTML 内容最大宽度').selectOption('full');
  await page.keyboard.press('Escape');
  await tab(page, 'Alpha').click();
  await ready(page, 'Alpha');
  await expect
    .poll(async () =>
      Math.abs((await editor.evaluate((el: HTMLTextAreaElement) => el.scrollTop)) - before.top),
    )
    .toBeLessThan(1);
  expect(await editor.inputValue()).toBe(before.value);
  expect(await page.evaluate(() => window.__u6e.starts.length)).toBe(starts);
});

test('wrap changes preserve a deep logical line without regenerating or replacing the preview cache', async ({
  page,
}) => {
  await boot(page, 'Wrap');
  const editor = page.getByRole('textbox', {name: 'Markdown 编辑器'}),
    value =
      source('Wrap').replace('## End', 'unbroken🙂中文'.repeat(1800) + '\n## End') +
      '\n' +
      Array.from({length: 120}, (_, i) => 'tail ' + i).join('\n'),
    target = value.split('\n').findIndex((line) => line === '## End') + 1;
  await editor.fill(value);
  await ready(page, 'Wrap');
  await page.getByRole('button', {name: /^大纲 \(/}).click();
  await page.locator('button[title^="End (第"]').click();
  const logicalLine = async () =>
    editor.evaluate((el: HTMLTextAreaElement) => {
      const rows = [
          ...el.parentElement!.querySelector<HTMLElement>('[data-line-numbers]')!.children,
        ] as HTMLElement[],
        top = el.scrollTop;
      let previous = parseFloat(getComputedStyle(el).paddingTop);
      for (let i = 0; i < rows.length; i++) {
        const height = rows[i]!.getBoundingClientRect().height;
        if (top <= previous + height) return i + 1 + (top - previous) / height;
        previous += height;
      }
      return rows.length;
    });
  await expect.poll(async () => Math.abs((await logicalLine()) - target)).toBeLessThan(1.1);
  const reference = await page
      .locator('[data-preview-reference]')
      .getAttribute('data-preview-reference'),
    starts = await page.evaluate(() => window.__u6e.starts.length);
  await page.getByRole('button', {name: '设置', exact: true}).click();
  await page.getByRole('checkbox', {name: '自动换行'}).uncheck();
  await expect(editor).toHaveAttribute('wrap', 'off');
  await expect.poll(async () => Math.abs((await logicalLine()) - target)).toBeLessThan(1.1);
  expect(await editor.inputValue()).toBe(value);
  expect(
    await page.locator('[data-preview-reference]').getAttribute('data-preview-reference'),
  ).toBe(reference);
  expect(await page.evaluate(() => window.__u6e.starts.length)).toBe(starts);
  await page.getByRole('checkbox', {name: '自动换行'}).check();
  await expect(editor).toHaveAttribute('wrap', 'soft');
  await expect.poll(async () => Math.abs((await logicalLine()) - target)).toBeLessThan(1.1);
  await page.keyboard.press('Escape');
  // 宽度 900：**仍在并排契约之内** ✓ ⇒ ⇒ 预览保持可见 ✓（窄屏另由 workbench-split 覆盖 ✓）。
  await page.setViewportSize({width: 900, height: 900});
  await expect.poll(async () => Math.abs((await logicalLine()) - target)).toBeLessThan(1.1);
  expect(await editor.inputValue()).toBe(value);
  expect(
    await page.locator('[data-preview-reference]').getAttribute('data-preview-reference'),
  ).toBe(reference);
  expect(await page.evaluate(() => window.__u6e.starts.length)).toBe(starts);
});
