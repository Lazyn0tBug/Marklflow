import {z} from 'zod';
import type {ByteSaveTarget} from '../../../application/exports/exportService';
const selectedSchema=z.object({key:z.string().uuid(),name:z.string().min(1),size:z.number().int().nonnegative().safe()}).strict();
export type NativeSelection=z.infer<typeof selectedSchema>;
async function invoke(command:string,args?:Record<string,unknown>):Promise<unknown>{
 const native=await import('@tauri-apps/api/core');
 if(!native.isTauri())throw new Error('原生文件能力仅在桌面应用中可用');
 return native.invoke(command,args);
}
/** Independent M3 adapter. No production composition or document bindings yet. */
export async function selectNativeOpen():Promise<NativeSelection[]|undefined>{
 const value=await invoke('select_native_open');
 return value===null?undefined:z.array(selectedSchema).parse(value);
}
export async function releaseNativeFile(key:string):Promise<void>{await invoke('release_native_file',{key})}
export async function readNativeText(file:NativeSelection):Promise<string>{return z.string().parse(await invoke('read_native_text',{key:file.key}))}
export async function selectNativeSave(name:string):Promise<(ByteSaveTarget&{release():Promise<void>})|undefined>{
 const value=await invoke('select_native_save',{name});
 if(value===null)return undefined;
 const file=selectedSchema.parse(value);
 return {
  async save(blob){if(blob.size>100*1024*1024)throw new Error('导出文件超过100MiB原生写入限制');await invoke('write_native_bytes',{key:file.key,bytes:Array.from(new Uint8Array(await blob.arrayBuffer()))});return 'saved'},
  release:()=>releaseNativeFile(file.key),
 };
}

