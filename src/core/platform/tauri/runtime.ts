import {z} from 'zod';

const platformInfoSchema=z.object({
 os:z.enum(['windows','macos','linux']),
 arch:z.string().min(1).max(64),
 version:z.string().min(1).max(64),
 windowLabel:z.string().min(1).max(256),
 webviewLabel:z.string().min(1).max(64),
}).strict();
export type TauriPlatformInfo=z.infer<typeof platformInfoSchema>;

/** Optional shell capability only; no application state, filesystem, or export ownership.
    The label pair is the caller's identity as the native side reports it (D1a-6). */
export async function readTauriPlatformInfo():Promise<TauriPlatformInfo|undefined>{
 if(typeof window==='undefined')return undefined;
 const {isTauri,invoke}=await import('@tauri-apps/api/core');
 if(!isTauri())return undefined;
 const value:unknown=await invoke('get_platform_info');
 return platformInfoSchema.parse(value);
}
