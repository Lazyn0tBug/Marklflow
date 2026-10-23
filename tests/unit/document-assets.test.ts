import {expect,it,vi} from 'vitest';
import {collectAssets,verifyAssets,assertSelfContainedCss} from '../../src/core/export/documentAssets';
import {createNewDocument,encodeSourcePayload,extractPayloadFromHtml} from '../../src/core/storage/storage';
const data='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1S8AAAAASUVORK5CYII=';
it('keeps byte-identical embedded images with hashes',async()=>{
 const result=await collectAssets('<img src="'+data+'">');
 expect(result.assets).toHaveLength(1);await verifyAssets(result.assets);
 await expect(verifyAssets([{...result.assets[0],sha256:'0'.repeat(64)}])).rejects.toThrow('资产清单损坏');
});
it('does not silently fetch external assets without permission',async()=>{
 const fetchSpy=vi.spyOn(globalThis,'fetch');
 await expect(collectAssets('<img src="https://example.com/private.png">')).rejects.toThrow('需允许联网');
 expect(fetchSpy).not.toHaveBeenCalled();fetchSpy.mockRestore();
});
it('rejects CSS imports and invalid v1 payload structure',()=>{
 expect(()=>assertSelfContainedCss('@import "https://x";')).toThrow();expect(()=>assertSelfContainedCss('p{background:url(x)}')).toThrow();
 const doc=createNewDocument('坏数据');const bad={...doc,theme:{...doc.theme,lineHeight:-1}};
 expect(extractPayloadFromHtml('<script id="markflow-source-payload">'+encodeSourcePayload(bad)+'</script>')).toBeNull();
});
