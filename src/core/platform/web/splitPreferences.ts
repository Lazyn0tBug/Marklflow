import {z} from 'zod';
const key='markflow_split_preferences_v1';
const schema=z.object({version:z.literal(1),ratio:z.number().min(0.15).max(0.85)}).strict();
export function readSplitPreference():number {
 try{
  const raw=localStorage.getItem(key);
  if(raw!==null){if(raw.length>256)return 0.5;const result=schema.safeParse(JSON.parse(raw));return result.success?result.data.ratio:0.5}
  // Same-origin legacy value is read only. Do not silently rewrite old preferences.
  const legacy=localStorage.getItem('markflow_split_ratio');
  if(!legacy||legacy.length>32||!/^0\.\d+$/.test(legacy))return 0.5;
  const ratio=Number(legacy);return ratio>=0.15&&ratio<=0.85?ratio:0.5;
 }catch{return 0.5}
}
export function writeSplitPreference(ratio:number):void {
 const value=schema.parse({version:1,ratio});
 try{localStorage.setItem(key,JSON.stringify(value))}catch{/* Keep the current in-memory preference. */}
}
