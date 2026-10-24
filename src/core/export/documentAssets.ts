import type {DocumentAsset} from '../model/document';
import {assetSchema} from '../model/documentSchema';
import {safeUrl} from '../render/htmlPolicy';
import {parse,walk} from 'css-tree';
const MAX=10*1024*1024,TOTAL=25*1024*1024;
const mimePattern=/^image\/(png|jpeg|gif|webp|avif)$/;
export function decodeImage(data:string):{mime:string;bytes:Uint8Array} {
 const match=/^data:(image\/(?:png|jpeg|gif|webp|avif));base64,([a-z0-9+/=]+)$/i.exec(data);
 if(!match)throw new Error('不支持的图片类型或编码');
 const bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0));
 if(bytes.length>MAX)throw new Error('图片超过10MB');return {mime:match[1].toLowerCase(),bytes};
}
export async function hashBytes(bytes:Uint8Array):Promise<string>{
 const copy=Uint8Array.from(bytes);
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',copy))).map(n=>n.toString(16).padStart(2,'0')).join('');
}
export async function verifyAssets(assets:DocumentAsset[]=[]):Promise<void>{
 if(assets.length>128)throw new Error('资产数量超过128');
 let total=0;const sources=new Set<string>();
 for(const input of assets){
  const a=assetSchema.parse(input);if(!a.source||!safeUrl(a.source,true))throw new Error('资产来源不允许');
  const decoded=decodeImage(a.data);total+=decoded.bytes.length;
  if(sources.has(a.source)||total>TOTAL||decoded.mime!==a.mime||decoded.bytes.length!==a.bytes||await hashBytes(decoded.bytes)!==a.sha256)throw new Error('资产清单损坏或超过限制');
  sources.add(a.source);
 }
}
function encode(bytes:Uint8Array,mime:string):string{
 let value='';for(let i=0;i<bytes.length;i+=8192)value+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return 'data:'+mime+';base64,'+btoa(value);
}
export async function collectAssets(html:string,existing:DocumentAsset[]=[],allowRemote=false):Promise<{html:string;assets:DocumentAsset[]}>{
 await verifyAssets(existing);
 const root=document.createElement('div');root.innerHTML=html;const found=new Map<string,DocumentAsset>();let total=0;
 for(const el of root.querySelectorAll('img,svg image')){
  const attribute=el.hasAttribute('src')?'src':el.hasAttribute('href')?'href':'xlink:href';
  const source=el.getAttribute(attribute);if(!source||source.startsWith('#'))throw new Error('图片来源缺失或不支持');
  if(found.has(source)){el.setAttribute(attribute,found.get(source)!.data);continue}
  if(found.size>=128||!safeUrl(source,true))throw new Error('图片数量/URL不受支持');
  const previous=existing.find(a=>a.source===source);let data=previous?.data;
  if(!data&&source.startsWith('data:'))data=source;
  if(!data){
   const url=new URL(source,location.href);
   if(!['http:','https:','blob:'].includes(url.protocol))throw new Error('无法读取本地相对图片，请先导入资产：'+source);
   if(!allowRemote&&url.origin!==location.origin)throw new Error('外部图片需允许联网收集：'+source);
   const response=await fetch(url,{credentials:'omit',redirect:'error',signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw new Error('图片读取失败：'+source);
   const mime=(response.headers.get('content-type')||'').split(';')[0].toLowerCase();
   if(!mimePattern.test(mime))throw new Error('图片类型不允许：'+source);
   if(Number(response.headers.get('content-length')||0)>MAX)throw new Error('图片超过10MB');
   const chunks:Uint8Array[]=[];let size=0;
   if(!response.body)throw new Error('图片内容不可读取');
   const reader=response.body.getReader();
   try{while(true){const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>MAX){await reader.cancel();throw new Error('图片超过10MB')}chunks.push(item.value)}}finally{reader.releaseLock()}
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}data=encode(bytes,mime);
  }
  const decoded=decodeImage(data);total+=decoded.bytes.length;if(total>TOTAL)throw new Error('文档图片总计超过25MB');
  const asset:DocumentAsset={source,mime:decoded.mime,bytes:decoded.bytes.length,sha256:await hashBytes(decoded.bytes),data,...(previous?.license?{license:previous.license}:{})};
  found.set(source,asset);el.setAttribute(attribute,data);
 }
 return {html:root.innerHTML,assets:[...found.values()]};
}
export function assertSelfContainedCss(css:string):void{
 const tree=parse(css);
 walk(tree,node=>{if(node.type==='Url'||node.type==='Atrule'&&['import','font-face'].includes(node.name.toLowerCase()))throw new Error('文档CSS含未封装的资源')});
}
export function applyDocumentAssets(html:string,assets:DocumentAsset[]=[]):string{
 const root=document.createElement('div');root.innerHTML=html;
 for(const el of root.querySelectorAll('img,svg image')){
  const attribute=el.hasAttribute('src')?'src':el.hasAttribute('href')?'href':'xlink:href';
  const a=assets.find(x=>x.source===el.getAttribute(attribute));if(a)el.setAttribute(attribute,a.data);
 }return root.innerHTML;
}
