import {it,expect,vi} from 'vitest';
vi.mock('../../src/core/export/exportContent',()=>({prepareExportContent:vi.fn(async(document)=>({document:structuredClone(document),html:'<p>prepared</p>'}))}));
vi.mock('../../src/core/render/documentPaginator',()=>({paginatePreparedContent:vi.fn(async()=>({html:'<div class="pagedjs_page">FINAL</div>',css:'.mf-doc{color:#000}',total:1}))}));
import {generatePdfHtml} from '../../src/core/export/pdfExporter';
import {prepareExportContent} from '../../src/core/export/exportContent';
import {paginatePreparedContent} from '../../src/core/render/documentPaginator';
import {createNewDocument} from '../../src/core/storage/storage';
it('builds an independent A4 delivery document using export priority and static prepared content',async()=>{vi.clearAllMocks();const doc=createNewDocument('<Source>');const result=await generatePdfHtml(doc,{mathMode:'mathml',allowRemoteAssets:false});expect(prepareExportContent).toHaveBeenCalledOnce();expect(paginatePreparedContent).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({html:'<p>prepared</p>'}),undefined,{priority:'export'});expect(result).toContain('@page{size:A4;margin:0}');expect(result).toContain('data-export-pages="1"');expect(result).toContain('&lt;Source&gt;');expect(result).toContain('FINAL')});
it('rejects a failed preparation before pagination or delivery',async()=>{vi.clearAllMocks();vi.mocked(prepareExportContent).mockRejectedValueOnce(new Error('asset unavailable'));await expect(generatePdfHtml(createNewDocument(),{mathMode:'svg',allowRemoteAssets:false})).rejects.toThrow('asset unavailable');expect(paginatePreparedContent).not.toHaveBeenCalled()});
