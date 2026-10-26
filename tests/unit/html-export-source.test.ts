import {it,expect} from 'vitest';
import {generateExportHtml} from '../../src/core/export/htmlExporter';
import {htmlArtifact} from './export-fixtures';
import corpus from '../fixtures/export-source/corpus.json';
it('reads only canonical HTML while treating editable source as an opaque attachment',async()=>{
 const input=htmlArtifact(corpus.isolation.html),payload=btoa(encodeURIComponent(corpus.isolation.markdown)),output=await generateExportHtml(input,{editablePayload:payload});
 const root=document.createElement('html');root.innerHTML=output;const article=root.querySelector('article')!;
 expect(article.textContent).toContain(corpus.isolation.expectedText);expect(article.textContent).not.toContain(corpus.isolation.excludedText);expect(root.querySelector('#markflow-source-payload')?.textContent).toBe(payload);expect(article.querySelector('ol')?.start).toBe(3);expect(article.querySelector('td')?.colSpan).toBe(2);
});

