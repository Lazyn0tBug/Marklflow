import {z} from 'zod';
const key='markflow_editor_preferences_v1';
const schema=z.object({version:z.literal(1),softWrap:z.boolean()}).strict();
export function readSoftWrapPreference():boolean {
 try{const raw=localStorage.getItem(key);if(!raw||raw.length>256)return true;const result=schema.safeParse(JSON.parse(raw));return result.success?result.data.softWrap:true}catch{return true}
}
export function writeSoftWrapPreference(softWrap:boolean):void {
 try{localStorage.setItem(key,JSON.stringify({version:1,softWrap}))}catch{/* The active preference remains in memory when storage is unavailable. */}
}
