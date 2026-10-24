import {expect,it} from 'vitest';
import {parseMarkdownToHtml,parseMarkdownDocument} from '../../src/core/parser/markdownParser';
import {sanitizeDocumentHtml} from '../../src/core/render/htmlPolicy';
it('preserves static GFM task state without interactive controls',()=>{
 const html=parseMarkdownToHtml('- [x] 完成\n- [ ] 待办');
 expect(html).toContain('已完成');expect(html).toContain('未完成');expect(html).not.toContain('<input');
});
it('reports unsupported raw content and cleaned author attributes by source line',()=>{
 const result=parseMarkdownDocument('# 正文\n\n<canvas>图表替代</canvas>\n\n<p onclick="bad()" style="position:fixed;color:rgb(1,2,3)">正文</p>');
 expect(result.diagnostics.some(d=>d.severity==='error'&&d.message.includes('canvas'))).toBe(true);
 expect(result.diagnostics.some(d=>d.message.includes('onclick'))).toBe(true);
 expect(result.diagnostics.some(d=>d.message.includes('CSS'))).toBe(true);
 expect(result.html).not.toContain('position:');expect(result.html).toContain('color:rgb(1,2,3)');
});
it('rejects author SVG animation and external presentation loads',()=>{
 const result=parseMarkdownDocument('<svg><animate attributeName="href" to="https://example.com"/><rect fill="url(https://example.com/x)"/></svg>');
 expect(result.html).not.toContain('<animate');expect(result.html).not.toContain('https:');
 expect(result.diagnostics.length).toBeGreaterThan(0);
});
it('keeps SVG relative image references for the asset collector',()=>{
 expect(sanitizeDocumentHtml('<svg><image href="./image.png" width="10" height="10"/></svg>')).toContain('./image.png');
});

it('renders cyclic DOT graphs without revisiting nodes forever',async()=>{
 const {renderDotToSVG}=await import('../../src/core/render/graphvizRender');
 const svg=renderDotToSVG('digraph G {\n A -> B;\n B -> A;\n}');expect(svg).toContain('<svg');
});
