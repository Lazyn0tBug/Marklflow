import {it,expect,vi} from 'vitest';
vi.mock('../../src/core/render/documentRenderer',()=>({renderDocument:vi.fn(async()=>({html:'<p>frozen</p>',diagnostics:[]})),assertArtifact:vi.fn()}));
vi.mock('../../src/core/export/documentAssets',()=>({collectAssets:vi.fn(async(html:string)=>({html,assets:[]}))}));
import {prepareExportContent} from '../../src/core/export/exportContent';
import {renderDocument} from '../../src/core/render/documentRenderer';
import {collectAssets} from '../../src/core/export/documentAssets';
import {createNewDocument} from '../../src/core/storage/storage';
it('freezes source and permissions and collects assets once after static rendering',async()=>{vi.clearAllMocks();const doc=createNewDocument(),original=doc.markdown,options={mathMode:'svg' as const,allowRemoteAssets:false};const pending=prepareExportContent(doc,options);doc.markdown='changed';options.allowRemoteAssets=true;const result=await pending;expect(result.document.markdown).toBe(original);expect(result.document.options.mathMode).toBe('svg');expect(result.html).toBe('<p>frozen</p>');expect(renderDocument).toHaveBeenCalledOnce();expect(collectAssets).toHaveBeenCalledExactlyOnceWith('<p>frozen</p>',undefined,false)});
it('does not publish prepared content when resource collection fails',async()=>{vi.mocked(collectAssets).mockRejectedValueOnce(new Error('asset failure'));await expect(prepareExportContent(createNewDocument())).rejects.toThrow('asset failure')});
