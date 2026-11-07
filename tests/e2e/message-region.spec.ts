import {test,expect,type Page} from './fixtures';

/**
 * 消息区在**应用页面**上的要求 ✓（设计 §9 ✓）。
 *
 * 这些是**应用里**的断言 ✓ ⇒ ⇒ 独立样例证明不了它们 ✓
 * ⇒ ⇒ 样例没有 Tailwind、没有工作台、没有键盘顺序 ✓。
 */

/** 通知面里的一条 ✓。 */
function notice(page:Page){return page.getByRole('status',{name:'通知'})}

test('the region stays inside a narrow window and does not push the workbench',async({page})=>{
 await page.setViewportSize({width:360,height:740});
 await page.goto('/');
 await page.waitForSelector('[data-render-state="ready"]',{timeout:30000});
 const editor=page.locator('textarea');
 const before=await editor.boundingBox();
 await page.evaluate(()=>{setTimeout(()=>{throw new Error('窄窗检查')},0);});
 await expect(notice(page).first()).toBeVisible();
 const box=await page.locator('.mf-message').boundingBox();
 expect(box).not.toBeNull();
 // 区域不越出视口 ✓。
 expect(box!.x).toBeGreaterThanOrEqual(0);
 expect(box!.x+box!.width).toBeLessThanOrEqual(360);
 expect(box!.y+box!.height).toBeLessThanOrEqual(740);
 // 消息是浮层 ⇒ ⇒ 不推挤工作台 ✓。
 const after=await editor.boundingBox();
 expect(after!.y).toBe(before!.y);
});

test('a message does not take the editing focus',async({page})=>{
 await page.goto('/');
 await page.waitForSelector('[data-render-state="ready"]',{timeout:30000});
 const editor=page.locator('textarea');
 await editor.click();
 await page.evaluate(()=>{setTimeout(()=>{throw new Error('焦点检查')},0);});
 await expect(notice(page).first()).toBeVisible();
 // 消息到达时不抢编辑焦点 ✓。
 await expect(editor).toBeFocused();
});

test('closing a message moves the focus to a control that remains',async({page})=>{
 await page.goto('/');
 await page.evaluate(()=>{setTimeout(()=>{throw new Error('一')},0);setTimeout(()=>{throw new Error('二')},10);});
 await expect(notice(page)).toHaveCount(2);
 await page.getByRole('button',{name:'关闭通知'}).first().click();
 await expect(notice(page)).toHaveCount(1);
 // 关掉的那个按钮没了 ⇒ ⇒ 焦点落到还留着的那个上 ✓（§9 ✓）。
 await expect(page.getByRole('button',{name:'关闭通知'})).toBeFocused();
});

test('the visual page surfaces a shape in the real region',async({page})=>{
 await page.goto('/');
 await page.waitForSelector('[data-render-state="ready"]',{timeout:30000});
 await page.getByRole('button',{name:'消息',exact:true}).click();
 const panel=page.getByRole('complementary',{name:'消息视觉页'});
 await expect(panel).toBeVisible();
 // 点一个用例 ⇒ ⇒ 消息出现在**真实的右下区域**里 ✓（不是静态样板 ✓）。
 await panel.getByRole('button',{name:'持续 · 失败（待确认）'}).click();
 const region=page.locator('.mf-message');
 await expect(region.locator('.mf-message-card[data-shape="persistent"]')).toBeVisible();
 await expect(region.locator('.mf-message-card[data-shape="persistent"]')).toContainText('保存失败');
 // 清空 ⇒ ⇒ 演示的消息不留在工作台里 ✓。
 await panel.getByRole('button',{name:'清空'}).click();
 await expect(region.locator('.mf-message-card[data-shape="persistent"]')).toHaveCount(0);
});

test('the message region follows the workbench theme switch',async({page})=>{
 await page.goto('/');
 await page.waitForSelector('[data-render-state="ready"]',{timeout:30000});
 const region=page.locator('.mf-message');
 // 应用默认深色 ✓ ⇒ ⇒ 区域跟着深色 ✓。
 expect(await region.evaluate(node=>getComputedStyle(node).colorScheme)).toBe('dark');
 await page.getByRole('button',{name:'切换浅色模式'}).click();
 expect(await region.evaluate(node=>getComputedStyle(node).colorScheme)).toBe('light');
 // **颜色**也跟着换 ✓ ⇒ ⇒ 只看 color-scheme 是不够的 ✓（`light-dark()` 被改坏时
 // ⇒ ⇒ color-scheme 还是对的、颜色却是旧的 ✓ ⇒ ⇒ 这里量真的底色 ✓）。
 await page.getByRole('button',{name:'消息',exact:true}).click();
 await page.getByRole('complementary',{name:'消息视觉页'}).getByRole('button',{name:'瞬时 · 信息'}).click();
 const card=page.locator('.mf-message-card[data-shape="transient"]').first();
 await expect(card).toBeVisible();
 expect(await card.evaluate(node=>getComputedStyle(node).backgroundColor)).toBe('rgb(255, 255, 255)');
});
