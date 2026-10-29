import type {ByteSaveTarget} from '../../../application/exports/exportService';
import type {ExportFile} from '../../../application/exports/exportFile';
import {apiObject,apiMethod,apiPromise} from '../externalApi';
function downloadBlob(blob:Blob,name:string):void{
 const link=document.createElement('a'),url=URL.createObjectURL(blob);
 try{link.href=url;link.download=name;document.body.appendChild(link);link.click()}
 finally{link.remove();URL.revokeObjectURL(url)}
}
/** Selection runs on the original click; native handles never leave this adapter. */
export async function selectWebSave(file:ExportFile):Promise<ByteSaveTarget|undefined>{
 const {name,mime,extension}=file,host=apiObject(window,'Web');
 if(!window.isSecureContext||typeof host.showSaveFilePicker!=='function'||!navigator.userActivation?.isActive){
  return {async save(blob){downloadBlob(blob,name);return 'download-started'}};
 }
 let handle:Record<string,unknown>;
 try{
  handle=apiObject(await apiPromise(apiMethod(host,'showSaveFilePicker','Web')({suggestedName:name,types:[{description:extension+' 文件',accept:{[mime]:[extension]}}]}),'选择保存位置'),'保存文件');
 }catch(error){
  if(error&&typeof error==='object'&&'name'in error&&error.name==='AbortError')return undefined;
  throw error;
 }
 return {async save(blob){
  // No writable stream is opened until content and any DOCX consent are ready.
  const stream=apiObject(await apiPromise(apiMethod(handle,'createWritable','保存文件')(),'打开写入流'),'文件写入流');
  try{
   await apiPromise(apiMethod(stream,'write','文件写入流')(blob),'写入文件');
   await apiPromise(apiMethod(stream,'close','文件写入流')(),'提交文件');
   return 'saved';
  }catch(error){
   try{await apiPromise(apiMethod(stream,'abort','文件写入流')(),'中止文件写入')}catch{/* Keep the original write/close failure. */}
   throw error;
  }
 }};
}
