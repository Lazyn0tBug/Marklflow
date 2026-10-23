import {describe,expect,it} from 'vitest';
import {parseMarkdownToHtml,extractOutline} from '../../src/core/parser/markdownParser';
import {sanitizeDocumentHtml,documentColor} from '../../src/core/render/htmlPolicy';
describe('H1 boundaries',()=>{
 it('keeps fenced content literal and repeated headings distinct',()=>{
  const md=['# 同名','','\x60\x60\x60md','## 不是标题','---pagebreak---','<script>bad()</script>','\x60\x60\x60','','# 同名'].join('\n');
  const outline=extractOutline(md);expect(outline).toHaveLength(2);expect(outline[0].id).not.toBe(outline[1].id);
  const root=document.createElement('div');root.innerHTML=parseMarkdownToHtml(md);
  expect(root.querySelectorAll('h1')).toHaveLength(2);expect(root.querySelectorAll('.mf-page-break')).toHaveLength(0);expect(root.querySelector('code')?.textContent).toContain('<script>bad()</script>');
 });
 it('rejects executable HTML/URL injection and preserves semantics',()=>{
  const root=document.createElement('div');root.innerHTML=sanitizeDocumentHtml('<figure><figcaption>说明</figcaption><img src="x" onerror="bad()"></figure><a href="javascript:bad()">链接</a><iframe srcdoc="bad"></iframe><style>body{display:none}</style>');
  expect(root.querySelector('figcaption')?.textContent).toBe('说明');expect(root.querySelector('[onerror],iframe,style')).toBeNull();expect(root.querySelector('a')?.hasAttribute('href')).toBe(false);
 });
 it('supports nesting and table alignment without application utilities',()=>{
  const root=document.createElement('div');root.innerHTML=parseMarkdownToHtml('- 外层\n  - 内层\n\n| a | b |\n| :-- | --: |\n| 1 | 2 |');
  expect(root.querySelector('ul ul')).not.toBeNull();expect(root.querySelector('thead')).not.toBeNull();expect(root.querySelectorAll('[align="right"]')).toHaveLength(2);
 });
 it('keeps MathML/SVG and safe styles but removes CSS loads',()=>{
  const html=sanitizeDocumentHtml('<math><mfrac><mn>1</mn><mn>2</mn></mfrac></math><svg><path d="M0 0L1 1"/></svg><p style="text-align:right;position:fixed;background:url(https://x)">a</p>');
  expect(html).toContain('<mfrac>');expect(html).toContain('<path');expect(html).toContain('text-align:right');expect(html).not.toContain('position:');expect(html).not.toContain('url(');
 });
 it('checks color values before interpolation',()=>{
  expect(documentColor('#0d9488')).toBe('#0d9488');expect(documentColor('rgb(1, 2, 3)')).toContain('rgb');
  for(const v of ['red;}</style><script>x</script>','oklch(50% .1 2)','rgb(var(--x))'])expect(()=>documentColor(v)).toThrow();
 });
});
