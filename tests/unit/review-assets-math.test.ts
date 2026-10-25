import {afterEach,expect,it,vi} from 'vitest';
import {collectAssets,applyDocumentAssets,verifyAssets} from '../../src/core/export/documentAssets';
import {prepareMath} from '../../src/core/render/mathRender';
const data='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1S8AAAAASUVORK5CYII=';
afterEach(()=>{vi.restoreAllMocks();delete window.MathJax});
it('preserves license and SVG image assets on re-export',async()=>{
 const initial=await collectAssets('<img src="'+data+'">');const first=initial.assets[0];if(!first)throw new Error('Expected embedded asset');const asset={...first,source:'picture.png',license:'CC-BY 4.0'};
 const result=await collectAssets('<svg><image href="picture.png"/></svg>',[asset]);
 expect(result.assets[0]?.license).toBe('CC-BY 4.0');expect(applyDocumentAssets('<svg><image href="picture.png"/></svg>',[asset])).toContain(data);
});
it('rejects excessive/invalid asset sources and missing SVG image sources',async()=>{
 const a=(await collectAssets('<img src="'+data+'">')).assets[0];if(!a)throw new Error('Expected embedded asset');
 await expect(verifyAssets(Array.from({length:129},(_,i)=>({...a,source:'image'+i})))).rejects.toThrow();
 await expect(verifyAssets([{...a,source:'javascript:bad()'}])).rejects.toThrow();
 await expect(collectAssets('<svg><image/></svg>')).rejects.toThrow();
});
it('rebuilds TeX input state once for each document render',async()=>{
 const getInputJax=vi.fn(()=>[{name:'TeX',compile:()=>{}}]),getDocument=vi.fn(()=>({convert:()=>{}})),makeMethods=vi.fn();
 window.MathJax={startup:{promise:Promise.resolve(),getInputJax,getDocument,makeMethods},tex2mmlPromise:vi.fn(async()=>'<math><mn>1</mn></math>'),tex2svgPromise:vi.fn()};
 await prepareMath([{value:'1',display:false}],'mathml');await prepareMath([{value:'2',display:false}],'mathml');
 expect(getInputJax).toHaveBeenCalledTimes(2);expect(getDocument).toHaveBeenCalledTimes(2);expect(makeMethods.mock.calls.length).toBeGreaterThanOrEqual(2);
});
