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

it('freezes local asset:// protocol images into Base64 data URLs during export in Tauri', async () => {
 (window as unknown as { __TAURI_INTERNALS__?: Record<string, unknown> }).__TAURI_INTERNALS__ = {};
 const pngBytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1S8AAAAASUVORK5CYII='), c => c.charCodeAt(0));

 vi.doMock('@tauri-apps/plugin-fs', () => ({
  readFile: vi.fn().mockResolvedValue(pngBytes),
 }));

 const html = '<img src="asset://localhost/%2FUsers%2Falice%2Ffigures%2Fdiag.png">';
 const result = await collectAssets(html);

 expect(result.assets).toHaveLength(1);
 expect(result.assets[0]?.mime).toBe('image/png');
 expect(result.assets[0]?.data).toContain('data:image/png;base64,');
 expect(result.html).toContain('src="data:image/png;base64,');
 await verifyAssets(result.assets);

 delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
});

it('supports SVG data URL verification in verifyAssets', async () => {
 const svgData = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==';
 const result = await collectAssets('<img src="' + svgData + '">');
 expect(result.assets).toHaveLength(1);
 expect(result.assets[0]?.mime).toBe('image/svg+xml');
 await verifyAssets(result.assets);
});
