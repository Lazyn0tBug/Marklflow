import {prepareExportContent} from '../../src/core/export/exportContent';
import {expect,it,vi} from 'vitest';
vi.mock('../../src/core/render/mermaidRender',()=>({renderMermaidDiagram:vi.fn(async()=>'<svg viewBox="0 0 10 10"><defs><path id="glyph" d="M0 0L1 1"/></defs><use href="#glyph"/></svg>'),mermaidError:()=>'<pre>error</pre>'}));
import {renderDocument} from '../../src/core/render/documentRenderer';
import {generateExportHtml} from '../../src/core/export/htmlExporter';
import {createNewDocument} from '../../src/core/storage/storage';
it('completes diagrams and gives SVG references a unique scope',async()=>{
 const a=await renderDocument('\x60\x60\x60mermaid\ngraph LR\nA-->B\n\x60\x60\x60','mathml');
 const b=await renderDocument('\x60\x60\x60mermaid\ngraph LR\nA-->B\n\x60\x60\x60','mathml');
 expect(a.html).not.toContain('data-mermaid-code');expect(a.html).toContain('<svg');expect(a.html).not.toBe(b.html);
 const root=document.createElement('div');root.innerHTML=a.html;
 const href=root.querySelector('use')?.getAttribute('href');expect(root.querySelector('path')?.id).toBe(href?.slice(1));
});
it('rejects cancelled preview work',async()=>{const c=new AbortController();c.abort();await expect(renderDocument('# x','mathml',c.signal)).rejects.toThrow('已取消')});
it('freezes source before an async export yields',async()=>{
 const doc=createNewDocument('冻结');doc.markdown='# 旧版本';
 const promise=prepareExportContent(doc).then(prepared=>generateExportHtml(prepared.artifact));doc.markdown='# 新版本';
 const html=await promise;expect(html).toContain('旧版本');expect(html).not.toContain('新版本');
});

it('scopes every SVG separately within the same document',async()=>{
 const {uniqueSvgIds}=await import('../../src/core/render/documentRenderer');
 const root=document.createElement('div');root.innerHTML=Array(2).fill('<svg><defs><path id="same" d="M0 0"/></defs><use href="#same"/></svg>').join('');
 uniqueSvgIds(root);
 expect(new Set(Array.from(root.querySelectorAll('[id]')).map(n=>n.id)).size).toBe(2);
 for(const svg of root.querySelectorAll('svg'))expect(svg.querySelector('use')?.getAttribute('href')).toBe('#'+svg.querySelector('path')?.id);
});

it('does not report complete SVG when a required glyph is missing',async()=>{
 const result=await renderDocument('<svg><use href="#absent"/></svg>','mathml');expect(result.diagnostics.some(d=>d.severity==='error')).toBe(true);
});

it('freezes output options along with source before asynchronous work',async()=>{
 const doc=createNewDocument('选项');doc.markdown='# 内容';const options={title:'冻结标题',editablePayload:'frozen-source'};
 const prepared=await prepareExportContent(doc);const pending=generateExportHtml(prepared.artifact,options);options.title='后续标题';options.editablePayload='';
 const html=await pending;expect(html).toContain('<title>冻结标题</title>');expect(html).toContain('id="markflow-source-payload"');
});
