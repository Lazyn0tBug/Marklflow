import {afterEach,expect,it,vi} from 'vitest';
import {createHash,webcrypto} from 'node:crypto';
import {parseMarkdownDocument} from '../../src/core/parser/markdownParser';
import {createRenderNonce} from '../../src/core/platform/crypto';
import {hashBytes} from '../../src/core/export/documentAssets';
afterEach(()=>vi.unstubAllGlobals());
it('renders headings and rejects forged metadata when randomUUID is absent',()=>{
 vi.stubGlobal('crypto',{getRandomValues:webcrypto.getRandomValues.bind(webcrypto)});
 const result=parseMarkdownDocument('# 兼容性\n\n<div data-line="9999" data-mf-origin="guessed">正文</div>');
 expect(result.html).toContain('<h1');expect(result.html).not.toContain('9999');expect(result.html).not.toContain('guessed');
});
it('keeps SHA-256 correct without SubtleCrypto at padding and block boundaries',async()=>{
 vi.stubGlobal('crypto',{getRandomValues:webcrypto.getRandomValues.bind(webcrypto)});
 for(const size of [0,3,55,56,63,64,65,1000000]){
  const input=Uint8Array.from({length:size},(_,i)=>i%251);
  expect(await hashBytes(input)).toBe(createHash('sha256').update(input).digest('hex'));
 }
});

it('uses unpredictable 128-bit nonces when randomUUID is missing',()=>{
 vi.stubGlobal('crypto',{getRandomValues:webcrypto.getRandomValues.bind(webcrypto)});
 const nonces=Array.from({length:100},()=>createRenderNonce());expect(new Set(nonces).size).toBe(100);expect(nonces.every(n=>/^[0-9a-f]{32}$/.test(n))).toBe(true);
});
it('does not silently substitute Math.random when secure randomness is absent',()=>{
 vi.stubGlobal('crypto',undefined);expect(()=>createRenderNonce()).toThrow('安全随机数');
});
