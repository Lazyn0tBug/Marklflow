import {test, expect} from './fixtures';

const url = 'http://127.0.0.1:4175/tests/fixtures/messages/message-lifecycle.html';
const selector = '[aria-label="生命周期夹具"]';

test.beforeEach(async ({page}) => {
  await page.goto(url);
});

test('observes CSS exit after commit and ignores children and unrelated transitions', async ({
  page,
  pageErrors,
}) => {
  await page.getByRole('button', {name: '挂载', exact: true}).click();
  // Capture actual animation promises inside the same event before the adapter removes the card.
  const result = await page.locator(selector).evaluate(async (element) => {
    element.querySelector<HTMLButtonElement>('button')!.click();
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    const own = element
      .getAnimations()
      .filter((a): a is CSSTransition => a instanceof CSSTransition);
    const children = element
      .getAnimations({subtree: true})
      .filter((a) => a.effect instanceof KeyframeEffect && a.effect.target !== element);
    const observed = own.filter(
      (a) =>
        a.effect instanceof KeyframeEffect &&
        a.effect.target === element &&
        !a.effect.pseudoElement &&
        ['opacity', 'transform'].includes(a.transitionProperty),
    );
    const started = performance.now();
    const statuses = await Promise.allSettled(observed.map((a) => a.finished));
    return {
      properties: observed.map((a) => a.transitionProperty).sort(),
      unrelated: own.some((a) => a.transitionProperty === 'background-color'),
      children: children.length,
      pseudo: element
        .getAnimations({subtree: true})
        .some((a) => a.effect instanceof KeyframeEffect && Boolean(a.effect.pseudoElement)),
      statuses: statuses.map((r) => r.status),
      elapsed: performance.now() - started,
    };
  });
  expect(result.properties).toEqual(['opacity', 'transform']);
  expect(result.unrelated).toBe(true);
  expect(result.children).toBeGreaterThan(0);
  expect(result.pseudo).toBe(true);
  expect(result.statuses).toEqual(['fulfilled', 'fulfilled']);
  await expect(page.locator('[data-exits]')).toHaveText('[1]');
  await expect(page.locator(selector)).toHaveCount(0);
  expect(result.elapsed).toBeLessThan(700);
  expect(pageErrors).toEqual([]);
});

for (const mode of ['零时长', '无目标变化', '减少动态效果']) {
  test(`${mode} exits without waiting for a missing transition event`, async ({page}) => {
    if (mode === '减少动态效果') await page.emulateMedia({reducedMotion: 'reduce'});
    await page
      .getByRole('button', {name: mode === '减少动态效果' ? '挂载' : mode, exact: true})
      .click();
    await page.locator(selector).getByRole('button', {name: '关闭', exact: true}).click();
    await expect(page.locator('[data-exits]')).toHaveText('[1]');
  });
}

test('cancellation and paused transitions settle or hit a finite deadline exactly once', async ({
  page,
}) => {
  await page.getByRole('button', {name: '挂载', exact: true}).click();
  const statuses = await page.locator(selector).evaluate(async (element) => {
    element.querySelector<HTMLButtonElement>('button')!.click();
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    const transitions = element
      .getAnimations()
      .filter(
        (a): a is CSSTransition =>
          a instanceof CSSTransition && ['opacity', 'transform'].includes(a.transitionProperty),
      );
    const result = Promise.allSettled(transitions.map((a) => a.finished));
    transitions.find((a) => a.transitionProperty === 'opacity')!.cancel();
    return (await result).map((r) => r.status).sort();
  });
  expect(statuses).toEqual(['fulfilled', 'rejected']);
  await expect(page.locator('[data-exits]')).toHaveText('[1]');
  await page.getByRole('button', {name: '挂载', exact: true}).click();
  await page.locator(selector).evaluate(async (element) => {
    element.querySelector<HTMLButtonElement>('button')!.click();
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    for (const a of element.getAnimations())
      if (a instanceof CSSTransition && ['opacity', 'transform'].includes(a.transitionProperty))
        a.pause();
  });
  await expect(page.locator('[data-exits]')).toHaveText('[1,2]');
});

test('non-finite engine timing uses the bounded exception deadline', async ({page}) => {
  await page.getByRole('button', {name: '挂载', exact: true}).click();
  await page.locator(selector).evaluate((element) => {
    const original = element.getAnimations.bind(element);
    element.getAnimations = () => {
      const animations = original();
      for (const animation of animations) {
        if (
          !(animation instanceof CSSTransition) ||
          !(animation.effect instanceof KeyframeEffect) ||
          animation.effect.target !== element ||
          animation.effect.pseudoElement ||
          !['opacity', 'transform'].includes(animation.transitionProperty)
        )
          continue;
        const timing = animation.effect.getComputedTiming.bind(animation.effect);
        animation.effect.getComputedTiming = () => ({...timing(), endTime: Infinity});
        animation.pause();
      }
      return animations;
    };
    element.querySelector<HTMLButtonElement>('button')!.click();
  });
  await expect(page.locator('[data-exits]')).toHaveText('[1]', {timeout: 1500});
  await page.waitForTimeout(100);
  await expect(page.locator('[data-exits]')).toHaveText('[1]');
});

test('unmount clears both expiry and exit waits without callbacks into a replacement', async ({
  page,
}) => {
  await page.getByRole('button', {name: '自动', exact: true}).click();
  await page.getByRole('button', {name: '卸载', exact: true}).click();
  await page.waitForTimeout(260);
  await expect(page.locator('[data-hides]')).toHaveText('0');
  await page.getByRole('button', {name: '挂载', exact: true}).click();
  await page.locator(selector).getByRole('button', {name: '关闭', exact: true}).click();
  await page.getByRole('button', {name: '挂载', exact: true}).click();
  await page.waitForTimeout(450);
  await expect(page.locator(selector)).toContainText('实例 3');
  await expect(page.locator('[data-exits]')).toHaveText('[]');
});

test('same-task mount and close and repeated close remain idempotent in StrictMode', async ({
  page,
}) => {
  await page.getByRole('button', {name: '同任务挂载关闭', exact: true}).click();
  await expect(page.locator('[data-exits]')).toHaveText('[1]');
  await page.getByRole('button', {name: '挂载', exact: true}).click();
  await page.locator(selector).evaluate((element) => {
    const button = element.querySelector<HTMLButtonElement>('button')!;
    button.click();
    button.click();
  });
  await expect(page.locator('[data-exits]')).toHaveText('[1,2]');
  await expect(page.locator('[data-hides]')).toHaveText('2');
});

test('leaving cards are inert and closing does not steal editor focus', async ({page}) => {
  await page.getByRole('button', {name: '挂载', exact: true}).click();
  const editor = page.getByRole('textbox', {name: '编辑器'});
  await editor.focus();
  await page
    .locator(selector)
    .evaluate((element) => element.querySelector<HTMLButtonElement>('button')!.click());
  await expect(page.locator(selector)).toHaveAttribute('inert');
  await expect(page.locator('[data-exits]')).toHaveText('[1]');
  await expect(editor).toBeFocused();
});

test('import batches keep failures, expire successes, and cannot clear replacements', async ({
  page,
}) => {
  await page.getByRole('button', {name: '导入失败', exact: true}).click();
  await page.getByRole('button', {name: '关闭导入结果', exact: true}).click();
  await page.getByRole('button', {name: '导入成功', exact: true}).click();
  await page.waitForTimeout(450);
  await expect(page.locator('.mf-message-result')).toContainText('2.md');
  await expect(page.locator('.mf-message-result')).toHaveCount(0, {timeout: 12000});
  await page.getByRole('button', {name: '导入失败', exact: true}).click();
  await page.getByRole('button', {name: '保存失败', exact: true}).click();
  await page.waitForTimeout(10400);
  await expect(page.locator('.mf-message-result')).toBeVisible();
  await expect(page.getByRole('status', {name: '通知'})).toBeVisible();
});
