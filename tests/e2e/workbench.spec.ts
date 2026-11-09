import {expect, test} from './fixtures';
test('production workbench loads editable source', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('textarea').first()).toBeVisible();
  await expect(page.locator('textarea').first()).not.toHaveValue('');
});
