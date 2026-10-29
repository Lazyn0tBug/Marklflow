import {afterEach,expect,it,vi} from 'vitest';
import {collectAssets,verifyAssets,decodeImage,hashBytes} from '../../src/core/export/documentAssets';
import fixtures from '../fixtures/image-signature/samples.json';
const data=(mime:string,base64:string)=>'data:'+mime+';base64,'+base64;
afterEach(()=>vi.restoreAllMocks());
for(const key of ['png','jpeg','gif','webp','avif','apng','animatedWebp'] as const){
 it('preserves declared MIME, original bytes and hash for '+key,async()=>{
  const sample=fixtures.samples[key],uri=data(sample.declaredMime,sample.base64);
  const result=await collectAssets('<img src="'+uri+'">');
  const asset=result.assets[0]!;
  expect(asset.mime).toBe(sample.declaredMime);expect(asset.data).toBe(uri);
  expect(asset.bytes).toBe(sample.bytes);expect(asset.sha256).toBe(await hashBytes(decodeImage(uri).bytes));
  await verifyAssets(result.assets);
 });
}
it('rejects false declarations and text without changing existing source assets',async()=>{
 const png=fixtures.samples.png;
 const original=(await collectAssets('<img src="'+data('image/png',png.base64)+'">')).assets;
 const before=JSON.stringify(original);
 await expect(collectAssets('<img src="'+data('image/jpeg',png.base64)+'">',original)).rejects.toThrow('声明类型与签名不一致');
 await expect(collectAssets('<img src="'+data('image/png',btoa('<html>fake image</html>'))+'">')).rejects.toThrow('签名无法识别');
 await expect(collectAssets('<img src="data:image/svg+xml;base64,PHN2Zy8+">')).rejects.toThrow('不受支持');
 expect(JSON.stringify(original)).toBe(before);
 const badData=data('image/jpeg',png.base64);
 const mismatched={...original[0]!,mime:'image/jpeg' as const,data:badData};
 await expect(verifyAssets([mismatched])).rejects.toThrow('声明类型与签名不一致');
});
it('checks already-read HTTP bytes once and normalizes header case and parameters',async()=>{
 const png=fixtures.samples.png,bytes=decodeImage(data('image/png',png.base64)).bytes;
 const fetchSpy=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(new Uint8Array(bytes).buffer,{headers:{'content-type':' IMAGE/PNG ; charset=binary '}}));
 const result=await collectAssets('<img src="https://example.com/a.png"><img src="https://example.com/a.png">',[],true);
 expect(fetchSpy).toHaveBeenCalledOnce();expect(result.assets).toHaveLength(1);expect(result.assets[0]?.data).toBe(data('image/png',png.base64));
});
it('rejects HTTP signature mismatch, unknown bytes and missing streams without refetch',async()=>{
 const png=decodeImage(data('image/png',fixtures.samples.png.base64)).bytes;
 for(const response of [new Response(new Uint8Array(png).buffer,{headers:{'content-type':'image/jpeg'}}),new Response('fake',{headers:{'content-type':'image/png'}}),new Response(null,{headers:{'content-type':'image/png'}})]){
  const fetchSpy=vi.spyOn(globalThis,'fetch').mockResolvedValue(response);
  await expect(collectAssets('<img src="https://example.com/bad.png">',[],true)).rejects.toThrow();
  expect(fetchSpy).toHaveBeenCalledOnce();fetchSpy.mockRestore();
 }
});
it('does not equate a recognized PNG header with a completely decoded image',async()=>{
 const uri=data('image/png',fixtures.samples.pngIhdrOnly.base64);
 expect((await collectAssets('<img src="'+uri+'">')).assets[0]?.bytes).toBe(33);
 // P0 browser evidence separately proves Image.decode rejects this same fixture.
});



it('cancels an oversized body and releases the stream lock before rejecting',async()=>{
 const cancel=vi.fn();
 const stream=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new Uint8Array(10*1024*1024+1))},cancel});
 vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(stream,{headers:{'content-type':'image/png'}}));
 await expect(collectAssets('<img src="https://example.com/large.png">',[],true)).rejects.toThrow('超过10MB');
 expect(cancel).toHaveBeenCalledOnce();expect(stream.locked).toBe(false);
});
