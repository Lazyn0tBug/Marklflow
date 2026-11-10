import {test, expect, type Page} from './fixtures';

/**
 * 顶栏那个分裂按钮 ✓（设计 §8.2 ✓、M5-7 ✓）。
 *
 * **Web 端也有这个控件** ✓ ⇒ ⇒ **整组灰掉** ✓ ⇒ ⇒ 理由与桌面端同一条 ✓
 * ⇒ ⇒ 永远没有同步目标 ✓ ⇒ ⇒ **界面两形态一致** ✓。
 */

async function storedDocuments(page: Page) {
  return page.evaluate(
    () =>
      new Promise<unknown>((resolve, reject) => {
        const open = indexedDB.open('markflow_db', 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('documents', 'readonly'),
            getAll = tx.objectStore('documents').getAll();
          getAll.onsuccess = () => resolve(getAll.result);
          getAll.onerror = () => reject(getAll.error);
          tx.oncomplete = () => db.close();
        };
      }),
  );
}

test('Web 端那个分裂按钮在，但整组灰掉', async ({page}) => {
  await page.goto('/');
  // **控件在** ✓ ⇒ ⇒ 两形态一致 ✓ ⇒ ⇒ 不是 Web 端没有这个东西 ✓。
  const writeBack = page.getByRole('button', {name: '保存', exact: true});
  await expect(writeBack).toBeVisible();
  // **主区灰掉** ✓ ⇒ ⇒ 那里永远没有同步目标 ✓。
  await expect(writeBack).toBeDisabled();
  // **箭头也灰掉** ✓ ⇒ ⇒ 菜单里没有能点的那一项 ✓ ⇒ ⇒ **另存为也不在** ✓。
  await expect(page.locator('button[aria-haspopup="menu"]')).toBeDisabled();
});

test('Ctrl/Cmd+S 立即落盘，不等去抖', async ({page}) => {
  await page.goto('/');
  const editor = page.locator('textarea');
  await expect(editor).toBeVisible();
  await editor.fill('# 快捷键落盘');
  await page.keyboard.press('ControlOrMeta+s');
  // **去抖是 700ms** ✓ ⇒ ⇒ **400ms 内就落盘 ⇒ ⇒ 只能是快捷键干的** ✓（M5-7 ✓）。
  await expect
    .poll(async () => JSON.stringify(await storedDocuments(page)), {timeout: 400})
    .toContain('# 快捷键落盘');
});
