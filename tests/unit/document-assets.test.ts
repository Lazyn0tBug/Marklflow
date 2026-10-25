import {expect,it,vi} from 'vitest';
import {collectAssets,verifyAssets,assertSelfContainedCss} from '../../src/core/export/documentAssets';
import {createNewDocument,encodeSourcePayload,extractPayloadFromHtml} from '../../src/core/storage/storage';
const data='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1S8AAAAASUVORK5CYII=';
it('keeps byte-identical embedded images with hashes',async()=>{
 const result=await collectAssets('<img src="'+data+'">');
 expect(result.assets).toHaveLength(1);await verifyAssets(result.assets);
 const asset=result.assets[0];if(!asset)throw new Error('Expected embedded asset');
 await expect(verifyAssets([{...asset,sha256:'0'.repeat(64)}])).rejects.toThrow('资产清单损坏');
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
it('reads a repeated permitted resource only once and freezes verified bytes',async()=>{
 const bytes=Uint8Array.from(atob(data.split(',')[1]!),c=>c.charCodeAt(0));
 const fetchSpy=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(bytes,{headers:{'content-type':'image/png'}}));
 try{const result=await collectAssets('<img src="https://example.com/image.png"><img src="https://example.com/image.png">',[],true);expect(fetchSpy).toHaveBeenCalledOnce();expect(result.assets).toHaveLength(1);expect(result.html.match(/data:image/g)).toHaveLength(2);await verifyAssets(result.assets)}finally{fetchSpy.mockRestore()}
});
