import {it,expect} from 'vitest';
import corpus from '../fixtures/export-source/corpus.json';
import {mathExpressions} from '../../src/core/parse/markdown';
it('keeps an HTML-authoritative isolation fixture distinct from editable source',()=>{
 const root=document.createElement('article');root.innerHTML=corpus.isolation.html;
 expect(root.textContent).toContain(corpus.isolation.expectedText);expect(root.textContent).not.toContain(corpus.isolation.excludedText);
 expect(corpus.isolation.markdown).toContain(corpus.isolation.excludedText);
 expect(root.querySelector('ol')?.start).toBe(3);expect(root.querySelector('td')?.colSpan).toBe(2);
 expect(root.querySelector('a')?.getAttribute('href')).toBe('#html-title');expect(root.querySelector('code')?.className).toBe('language-typescript');
 expect(root.querySelector('math')?.namespaceURI).toBe('http://www.w3.org/1998/Math/MathML');
});
it('covers distinct mathematical occurrences including footnotes and document macros',()=>{
 const expressions=mathExpressions(corpus.render.markdown,true);expect(expressions).toHaveLength(corpus.render.expectedFormulaCount);
 expect(new Set(expressions.map(item=>item.sourceOffset)).size).toBe(expressions.length);
 expect(expressions.some(item=>item.value.includes('newcommand'))).toBe(true);
 expect(expressions.filter(item=>item.value.includes('begin{equation}'))).toHaveLength(2);
});
