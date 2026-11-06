import {test,expect,type Page} from '@playwright/test';
test.use({viewport:{width:1280,height:900}});

const section=(title:string,level:number,body:number)=>
  `${'#'.repeat(level)} ${title}\n\n`+Array.from({length:body},(_,i)=>`段落 ${title} ${i}`).join('\n\n');
const md=[section('一级',1,6),section('二级',2,6),section('三级',3,6),section('四级',4,6),section('五级',5,30)].join('\n\n');
/** 前面一长串平铺的标题，加一条深链：深层(0) → 次层(1) → 再次层(2) → 深枝(3) → 深章(4)。 */
const flat=Array.from({length:40},(_,i)=>section('条目 '+i,1,1)).join('\n\n');
const deepMd=flat+'\n\n'+[section('深层',1,1),section('次层',2,1),section('再次层',3,1),section('深枝',4,1),section('深章',5,30)].join('\n\n');
const row=(page:Page,title:string)=>page.locator(`button[title^="${title} (第"]`);

/** 侧栏列表滚了多少，以及这一行是否落在它的可视范围内。 */
const panelState=async(target:ReturnType<Page['locator']>)=>target.evaluate(el=>{
 const scroller=el.closest('aside')!.querySelector('.overflow-y-auto') as HTMLElement;
 const box=el.getBoundingClientRect(),view=scroller.getBoundingClientRect();
 return {scrollTop:scroller.scrollTop,inView:box.top>=view.top-1&&box.bottom<=view.bottom+1};
});

async function openOutline(page:Page,source=md){
 await page.goto('/');
 const editor=page.locator('textarea');
 await expect(editor).toBeVisible();
 await editor.fill(source);
 await expect(page.locator('[data-render-state]')).toHaveAttribute('data-render-state','ready');
 await page.getByRole('button',{name:/^大纲 \(/}).click();
 return editor;
}

test('collapses the deep branches by default and expands them on demand',async({page})=>{
 await openOutline(page);
 // 深度 3 的「四级」默认收起：它自己仍然可见，五级不可见。
 await expect(row(page,'四级')).toHaveCount(1);
 await expect(row(page,'五级')).toHaveCount(0);
 await expect(page.getByRole('button',{name:/^展开 四级/})).toBeVisible();
 await page.getByRole('button',{name:/^展开 四级/}).click();
 await expect(row(page,'五级')).toHaveCount(1);
 await page.getByRole('button',{name:/^折叠 四级/}).click();
 await expect(row(page,'五级')).toHaveCount(0);
 // 收起时标题行与折叠按钮仍在，可以直接展开。
 await expect(row(page,'四级')).toHaveCount(1);
 await expect(page.getByRole('button',{name:/^展开 四级/})).toBeVisible();
});

test('folds and unfolds every branch from the toolbar',async({page})=>{
 await openOutline(page);
 // 默认状态下深分支已收起，工具按钮的动作是"展开全部"。
 await expect(row(page,'五级')).toHaveCount(0);
 await page.getByRole('button',{name:'展开全部大纲'}).click();
 await expect(row(page,'五级')).toHaveCount(1);
 await expect(row(page,'四级')).toHaveCount(1);
 await page.getByRole('button',{name:'折叠全部大纲'}).click();
 await expect(row(page,'五级')).toHaveCount(0);
 await expect(row(page,'四级')).toHaveCount(0);
 await expect(row(page,'一级')).toHaveCount(1);
});

test('jumps to a heading and keeps the active row marked',async({page})=>{
 const editor=await openOutline(page);
 await page.getByRole('button',{name:/^展开 四级/}).click();
 await row(page,'五级').click();
 await expect.poll(()=>editor.evaluate(node=>node.scrollTop)).toBeGreaterThan(100);
 await expect(page.locator('[aria-current=location]')).toHaveCount(1);
 await expect(page.locator('[aria-current=location]')).toHaveAttribute('title',/^五级 \(第/);
});

test('finds a hidden heading by search without folding the result',async({page})=>{
 await openOutline(page);
 await expect(row(page,'五级')).toHaveCount(0);
 await page.getByPlaceholder('搜索标题大纲...').fill('五级');
 await expect(row(page,'五级')).toHaveCount(1);
 // 搜索期间没有可折叠的对象，折叠按钮不渲染。
 await expect(page.locator('button[aria-expanded]')).toHaveCount(0);
 await page.getByPlaceholder('搜索标题大纲...').fill('');
 await expect(row(page,'五级')).toHaveCount(0);
});

test('marks the branch that holds the active heading instead of opening it',async({page})=>{
 const editor=await openOutline(page);
 // 把视口中线落到文末，当前章节就是收在里面的五级。
 await editor.evaluate(node=>{node.scrollTop=node.scrollHeight;});
 await expect.poll(()=>editor.evaluate(node=>node.scrollTop)).toBeGreaterThan(100);
 // 五级在收起的分支里：高亮行不在列表里，收起它的按钮带标记。
 await expect(page.locator('[aria-current=location]')).toHaveCount(0);
 await expect(page.getByRole('button',{name:/^展开 四级/})).toHaveAttribute('data-contains-active','true');
});

test('keeps the folded branch folded when the text above it changes',async({page})=>{
 const editor=await openOutline(page);
 await page.getByRole('button',{name:/^展开 四级/}).click();
 await expect(row(page,'五级')).toHaveCount(1);
 await page.getByRole('button',{name:/^折叠 四级/}).click();
 await expect(row(page,'五级')).toHaveCount(0);
 // 键与行号无关：在上方插入内容，收起状态不变。
 await editor.fill('插入的段落\n\n'+md);
 await expect(page.locator('[data-render-state]')).toHaveAttribute('data-render-state','ready');
 await expect(row(page,'四级')).toHaveCount(1);
 await expect(row(page,'五级')).toHaveCount(0);
});

test('toggles a branch from the keyboard',async({page})=>{
 await openOutline(page);
 const toggle=page.getByRole('button',{name:/^展开 四级/});
 await toggle.focus();
 await expect(toggle).toBeFocused();
 await page.keyboard.press('Enter');
 await expect(row(page,'五级')).toHaveCount(1);
 await page.keyboard.press('Space');
 await expect(row(page,'五级')).toHaveCount(0);
});

test('starts from the default state again after another document was open',async({page})=>{
 await openOutline(page);
 await page.getByRole('button',{name:/^展开 四级/}).click();
 await expect(row(page,'五级')).toHaveCount(1);
 // 折叠状态只属于当前激活文档：新建文档再切回来，是默认状态。
 await page.getByRole('button',{name:/^文档 \(/}).click();
 await page.getByTitle('创建新空白 Markdown 文档').click();
 await expect(page.getByRole('tab')).toHaveCount(2);
 await page.getByRole('tab',{name:/^一级/}).click();
 await page.getByRole('button',{name:/^大纲 \(/}).click();
 await expect(row(page,'四级')).toHaveCount(1);
 await expect(row(page,'五级')).toHaveCount(0);
});

test('shows where the active heading is and scrolls to the branch that holds it',async({page})=>{
 const editor=await openOutline(page,deepMd);
 // 视口落到文末，当前章节就是收在「深枝」里的「深章」。
 await editor.evaluate(node=>{node.scrollTop=node.scrollHeight;});
 await expect.poll(()=>editor.evaluate(node=>node.scrollTop)).toBeGreaterThan(100);
 // 高亮行不在列表里；收起它的按钮带标记。
 await expect(page.locator('[aria-current=location]')).toHaveCount(0);
 await expect(page.getByRole('button',{name:/^展开 深枝/})).toHaveAttribute('data-contains-active','true');
 // 位置可读：告诉用户当前章节在哪个分支里。
 await expect(page.locator('[data-outline-location]')).toHaveText('当前章节位于「深层 › 次层 › 再次层 › 深枝」');
 await expect(page.locator('[data-outline-location]')).toBeInViewport();
 // 够得到：列表滚到那个入口行，它落在侧栏的可视范围内。
 await expect(row(page,'深枝')).toBeVisible();
 const entry=await panelState(row(page,'深枝'));
 expect(entry.scrollTop).toBeGreaterThan(0);
 expect(entry.inView).toBe(true);
 // 仍然不自动展开。
 await expect(row(page,'深章')).toHaveCount(0);
});

test('keeps the position readable when the branch that holds it is folded away too',async({page})=>{
 const editor=await openOutline(page,deepMd);
 // 再收起「再次层」：挡住「深章」的收起祖先变成两层。
 // 用 evaluate 触发点击：Playwright 的点击会先把元素滚进视口，那样列表就自己滚过了，断言会空过。
 await page.getByRole('button',{name:/^折叠 再次层/}).evaluate(el=>el.click());
 await expect(row(page,'深枝')).toHaveCount(0);
 await editor.evaluate(node=>{node.scrollTop=node.scrollHeight;});
 await expect.poll(()=>editor.evaluate(node=>node.scrollTop)).toBeGreaterThan(100);
 // 位置指向仍然可见的那一层，不依赖被挡住的那一行。
 await expect(page.locator('[data-outline-location]')).toHaveText('当前章节位于「深层 › 次层 › 再次层」');
 await expect(page.locator('[data-outline-location]')).toBeInViewport();
 // 入口是「再次层」那一行，它可见，且被列表滚到可视范围内。
 await expect(row(page,'再次层')).toBeVisible();
 const entry=await panelState(row(page,'再次层'));
 expect(entry.scrollTop).toBeGreaterThan(0);
 expect(entry.inView).toBe(true);
});
