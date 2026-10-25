import {SourceImport} from '../../../application/workspace/sourceImport';
import type {DocumentRecord} from '../../model/document';
import {createNewDocument,extractPayloadFromHtml} from '../../storage/storage';
import {verifyAssets} from '../../export/documentAssets';
import {sha256Hex} from '../crypto';
/** Browser picker files are transient; native paths and permissions belong to a future Tauri adapter. */
export function readSourceFile(file:File):Promise<string>{
 return new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onerror=()=>reject(new Error('文件读取失败：'+file.name));
  reader.onabort=()=>reject(new Error('文件读取已取消：'+file.name));
  reader.onload=()=>{try{if(!(reader.result instanceof ArrayBuffer))throw new Error('文件读取结果无效');resolve(new TextDecoder('utf-8',{fatal:true}).decode(reader.result))}catch{reject(new Error('文件不是有效的 UTF-8 文本：'+file.name))}};
  reader.readAsArrayBuffer(file);
 });
}
export function createWebSourceImport(open:(doc:DocumentRecord)=>Promise<'opened'|'focused'>){
 return new SourceImport<File>({read:readSourceFile,decodeHtml:extractPayloadFromHtml,verify:doc=>verifyAssets(doc.assets),open,
  createMarkdown:(name,content)=>{const doc=createNewDocument(name.replace(/\.[^/.]+$/,''));return {...doc,markdown:content,meta:{...doc.meta,author:'Imported'}}},
  markdownKey:async(name,content)=>name+'\0'+await sha256Hex(new TextEncoder().encode(content)),
 });
}
