import {it,expect,vi} from 'vitest';
vi.mock('../../src/core/render/htmlPaginator',()=>({paginatePreparedContent:vi.fn(async()=>({html:'<div class="pagedjs_page">FINAL</div>',css:'.mf-doc{color:#000}',total:1}))}));
import {generatePdfHtml} from '../../src/core/export/pdfExporter';
import {paginatePreparedContent} from '../../src/core/render/htmlPaginator';
import {htmlArtifact} from './export-fixtures';
it('builds A4 delivery from the accepted HTML with no source or rendering call',async()=>{
 vi.clearAllMocks();const input=htmlArtifact('<p>HTML SOURCE</p>');const result=await generatePdfHtml(input,{title:'<Source>'});
 expect(paginatePreparedContent).toHaveBeenCalledExactlyOnceWith(input,undefined,{priority:'export'});expect(result).toContain('@page{size:A4;margin:0}');expect(result).toContain('data-export-pages="1"');expect(result).toContain('&lt;Source&gt;');expect(result).toContain('FINAL');
});
it('rejects failed layout instead of returning partial delivery HTML',async()=>{vi.mocked(paginatePreparedContent).mockRejectedValueOnce(new Error('pagination unavailable'));await expect(generatePdfHtml(htmlArtifact('<p>x</p>'))).rejects.toThrow('pagination unavailable')});
it('uses the chosen PDF name as an escaped nonempty document title',async()=>{const input=htmlArtifact('');const html=await generatePdfHtml(input,{title:' chosen <名> '});expect(html).toContain('<title>chosen &lt;名&gt;</title>');expect(await generatePdfHtml({...input,meta:{...input.meta,title:' '}},{title:' '})).toContain('<title>MarkFlow-Document</title>')});
