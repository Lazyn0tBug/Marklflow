import {test,expect} from '@playwright/test';

/**
 * The mapping layer injects generated markup as raw HTML. Without a source position on that raw node the
 * reparser anchors it to a stale line, which can fabricate a position without a start point and break the
 * render. The failure depends on the exact content, so the guard renders the hardest corpus on first load.
 */
const corpus=[
 '求和 $\\sum_{k=0}^{n} x^k$',
 '极限 $\\lim_{x\\to 0} f(x)$',
 '积分 $\\int_0^1 f(x)dx$',
 '矩阵 $\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}$',
 '对齐 $\\begin{aligned}f(x)&=x\\\\g(x)&=x^2\\end{aligned}$',
 '重音 $\\vec{v}$',
 '分式 $\\frac{a_1}{\\sqrt{1+x^2}}$',
].join('\n\n');

test('first render of complex formulas keeps the document renderable',async({page})=>{
 await page.goto('/');
 const editor=page.locator('textarea').first();await expect(editor).toBeVisible();
 await editor.fill(corpus);
 await expect(page.locator('[data-render-state]')).toHaveAttribute('data-render-state','ready',{timeout:30000});
 // The preview shows formulas as MathML or as MathJax SVG depending on the document mode.
 await expect(page.locator('article math, article mjx-container')).toHaveCount(7);
});
