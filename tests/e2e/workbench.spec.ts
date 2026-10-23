import { expect, test } from '@playwright/test';
test('production workbench loads editable source', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('textarea').first()).toBeVisible();
  await expect(page.locator('textarea').first()).not.toHaveValue('');
});
