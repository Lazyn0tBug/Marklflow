import {sha256Hex} from '../../src/core/platform/crypto';
import {it,expect,vi} from 'vitest';
vi.mock('../../src/core/render/documentRenderer',()=>({renderDocument:vi.fn(async()=>({html:'<p>frozen</p>',diagnostics:[]})),assertArtifact:vi.fn()}));
vi.mock('../../src/core/export/documentAssets',async importOriginal=>({...await importOriginal<typeof import('../../src/core/export/documentAssets')>(),collectAssets:vi.fn(async(html:string)=>({html,assets:[]}))}));
import {exportHtmlSchema} from '../../src/core/model/exportHtml';
import {prepareExportContent} from '../../src/core/export/exportContent';
import {renderDocument} from '../../src/core/render/documentRenderer';
import {collectAssets} from '../../src/core/export/documentAssets';
import {createNewDocument} from '../../src/core/storage/storage';
it('freezes source and permissions and collects assets once after static rendering',async()=>{vi.clearAllMocks();const doc=createNewDocument(),original=doc.markdown,options={mathMode:'svg' as const,allowRemoteAssets:false};const pending=prepareExportContent(doc,options);doc.markdown='changed';options.allowRemoteAssets=true;const result=await pending;expect(result.source.mdHash).toBe(await sha256Hex(new TextEncoder().encode(original)));expect(result.mathMode).toBe('svg');expect(result.html).toBe('<p>frozen</p>');expect(renderDocument).toHaveBeenCalledOnce();expect(collectAssets).toHaveBeenCalledExactlyOnceWith('<p>frozen</p>',undefined,false)});
it('does not publish prepared content when resource collection fails',async()=>{vi.mocked(collectAssets).mockRejectedValueOnce(new Error('asset failure'));await expect(prepareExportContent(createNewDocument())).rejects.toThrow('asset failure')});

it('returns an owned serializable HTML contract without editable source or mutable references',async()=>{
 vi.clearAllMocks();const doc=createNewDocument('Owned'),originalSize=doc.theme.fontSize;doc.meta.tags=['before'];
 const pending=prepareExportContent(doc);doc.meta.title='changed';doc.meta.tags[0]='after';doc.theme.fontSize=18;doc.theme.margins.top=99;
 const artifact=await pending;
 expect(artifact.meta.title).toBe('Owned');expect(artifact.meta.tags).toEqual(['before']);expect(artifact.presentation.variables['--mf-size']).toBe(originalSize+'px');expect(artifact.presentation.page.margins.top).toBe(20);
 expect(artifact).not.toHaveProperty('markdown');expect(artifact).not.toHaveProperty('document');expect(artifact.source.mdHash).toMatch(/^[a-f0-9]{64}$/);
 for(const value of [artifact,artifact.source,artifact.meta,artifact.meta.tags,artifact.presentation,artifact.presentation.variables,artifact.presentation.page,artifact.presentation.page.margins,artifact.assets,artifact.diagnostics])expect(Object.isFrozen(value)).toBe(true);
 expect(exportHtmlSchema.parse(JSON.parse(JSON.stringify(artifact)))).toEqual(artifact);
 expect(()=>exportHtmlSchema.parse({...artifact,markdown:'second source'})).toThrow();
});
it('versions content separately from rendering configuration and includes frozen asset bytes',async()=>{
 const doc=createNewDocument('Config');const first=(await prepareExportContent(doc));doc.markdown+=' changed';
 const second=(await prepareExportContent(doc));expect(second.source.mdHash).not.toBe(first.source.mdHash);expect(second.source.renderConfigVersion).toBe(first.source.renderConfigVersion);
 doc.theme.fontSize=18;const themed=(await prepareExportContent(doc));expect(themed.source.renderConfigVersion).not.toBe(second.source.renderConfigVersion);
 const data='data:image/png;base64,AA==',asset={source:'/a.png',data,mime:'image/png',bytes:1,sha256:'0'.repeat(64)};
 vi.mocked(collectAssets).mockResolvedValueOnce({html:'<img src="'+data+'">',assets:[asset]});
 const withAsset=(await prepareExportContent(doc));asset.data='changed';expect(withAsset.assets[0]?.data).toBe(data);expect(Object.isFrozen(withAsset.assets[0])).toBe(true);expect(withAsset.source.renderConfigVersion).not.toBe(themed.source.renderConfigVersion);
});
