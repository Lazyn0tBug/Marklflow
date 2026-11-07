import {test,expect} from './fixtures';

/**
 * 消息样例的验证 ✓：**样例页自己就是被测对象** ✓（设计 §7 S-1、S-2 ✓）。
 *
 * 走 dev server ✓ ⇒ ⇒ 夹具页在仓库里、不进应用构建 ✓ ⇒ ⇒ 这一步不碰应用 ✓。
 */
const origin='http://127.0.0.1:4175';

test('the css entry alone renders the three shapes',async({page,pageErrors})=>{
 await page.goto(origin+'/tests/fixtures/messages/messages-css-sample.html');
 const region=page.locator('.mf-message');
 await expect(region).toBeVisible();
 await expect(page.locator('.mf-message-card')).toHaveCount(2);
 await expect(page.locator('.mf-message-result')).toHaveCount(1);
 // 表面不是透明 ⇒ ⇒ 这份 CSS 自己给了底色 ✓（这一页没有别的样式表 ✓）。
 const surface=await page.locator('.mf-message-card').first().evaluate(element=>getComputedStyle(element).backgroundColor);
 expect(surface).not.toBe('rgba(0, 0, 0, 0)');
 // 区域固定在右下 ✓。
 expect(await region.evaluate(element=>getComputedStyle(element).position)).toBe('fixed');
 // 长文件名换行 ⇒ ⇒ 那一行自己不横向溢出 ✓（区域是固定定位 ⇒ ⇒ 量它自己才作数 ✓）。
 const longest=page.locator('.mf-message-result__list li').nth(1);
 expect(await longest.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
 expect(pageErrors).toEqual([]);
});

test('the css entry follows the color scheme it is given',async({page})=>{
 await page.emulateMedia({colorScheme:'dark'});
 await page.goto(origin+'/tests/fixtures/messages/messages-css-sample.html');
 const dark=await page.locator('.mf-message-card').first().evaluate(element=>getComputedStyle(element).backgroundColor);
 await page.emulateMedia({colorScheme:'light'});
 await page.goto(origin+'/tests/fixtures/messages/messages-css-sample.html');
 const light=await page.locator('.mf-message-card').first().evaluate(element=>getComputedStyle(element).backgroundColor);
 // 明暗两套底色不同 ⇒ ⇒ `light-dark()` 那条路走通了 ✓（没有 `light-dark()` 就没有这个差别 ✓）。
 expect(dark).not.toBe(light);
});

test('the pure component hands the callbacks back to the caller',async({page,pageErrors})=>{
 await page.goto(origin+'/tests/fixtures/messages/messages-component-sample.html');
 const card=page.locator('.mf-message-card');
 await expect(card).toBeVisible();
 // 播报由调用方给 ✓（组件自己不主动播报 ✓ ⇒ ⇒ 这一张显式给了 assertive ✓）。
 await expect(card).toHaveAttribute('role','alert');
 // 详情默认收起 ✓ ⇒ ⇒ 展开与否由外面给 ✓。
 const toggle=page.getByRole('button',{name:'详情'});
 await expect(toggle).toHaveAttribute('aria-expanded','false');
 await toggle.click();
 await expect(page.getByRole('button',{name:'收起'})).toHaveAttribute('aria-expanded','true');
 await expect(page.locator('.mf-message-card__detail')).toBeVisible();
 // 动作回调回到调用方 ✓ ⇒ ⇒ 组件自己不做业务 ✓。
 await page.getByRole('button',{name:'重试'}).click();
 await expect(page.locator('[data-sample-clicks]')).toHaveAttribute('data-sample-clicks','1');
 // 关闭回调回到调用方 ✓ ⇒ ⇒ 卡片由外面收走 ✓。
 await page.getByRole('button',{name:'关闭'}).click();
 await expect(page.locator('[data-sample-empty]')).toBeVisible();
 expect(pageErrors).toEqual([]);
});
