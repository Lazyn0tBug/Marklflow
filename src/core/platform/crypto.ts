/** Browser crypto compatibility without weakening nonce entropy or asset hashes. */
export function createRenderNonce():string {
 const source=globalThis.crypto;
 if(typeof source?.randomUUID==='function')return source.randomUUID();
 if(typeof source?.getRandomValues!=='function')throw new Error('浏览器未提供安全随机数生成能力，请升级浏览器后重试');
 return Array.from(source.getRandomValues(new Uint8Array(16)),byte=>byte.toString(16).padStart(2,'0')).join('');
}
export async function sha256Hex(bytes:Uint8Array):Promise<string>{
 const copy=Uint8Array.from(bytes);
 if(typeof globalThis.crypto?.subtle?.digest==='function'){
  return Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',copy)),byte=>byte.toString(16).padStart(2,'0')).join('');
 }
 // hash.js already ships through docx; declare it directly and load only for this fallback.
 const {default:hash}=await import('hash.js');const digest=hash.sha256();
 for(let offset=0;offset<copy.length;offset+=65536)digest.update(copy.subarray(offset,offset+65536));
 return digest.digest('hex');
}
