import {z} from 'zod';
import {resolve} from 'node:path';
const finite=z.number().finite().nonnegative();
const counters=z.object({stages:z.number().int().nonnegative(),styles:z.number().int().nonnegative()});
const sample=z.object({id:z.string().min(1),sha256:z.string().regex(/^[a-f0-9]{64}$/),parseMs:z.array(finite).length(3),renderMs:z.array(finite).length(3),paginateMs:finite,pages:z.number().int().positive(),artifactBytes:z.number().int().positive(),before:counters,after:counters,fonts:z.array(z.object({family:z.string(),status:z.string()})),bodyFont:z.string()});
export const baselineSchema=z.object({schemaVersion:z.literal(1),sourceCommit:z.string().regex(/^[a-f0-9]{40}$/),environment:z.object({os:z.string(),release:z.string(),cpu:z.string(),logicalCpus:z.number(),memoryBytes:z.number(),browser:z.string(),viewport:z.object({width:z.number(),height:z.number()})}),results:z.array(sample).min(1)});
export const regressionSchema=z.object({maxMultiplier:finite.positive(),parseAdditiveMs:finite,renderAdditiveMs:finite,paginationAdditiveMs:finite});
export function measurementOutput(file:string):string{
 const target=resolve(file),portable=target.replaceAll('\\','/').toLowerCase();
 const frozen=['architecture-a0-baseline.json','architecture-a1-comparison.json','architecture-a1-evidence.json'];
 if(frozen.some(name=>portable===resolve('docs/acceptance/'+name).replaceAll('\\','/').toLowerCase()))throw new Error('Frozen evidence cannot be overwritten');
 return target;
}
export function compareBaselines(original:unknown,current:unknown,budget:unknown){
 const a=baselineSchema.parse(original),b=baselineSchema.parse(current),limits=regressionSchema.parse(budget);
 if(JSON.stringify(a.environment)!==JSON.stringify(b.environment))throw new Error('Environment mismatch');
 const index=new Map(a.results.map(row=>[row.id,row]));
 if(index.size!==a.results.length||new Set(b.results.map(row=>row.id)).size!==b.results.length||a.results.length!==b.results.length)throw new Error('Duplicate or missing workloads');
 return b.results.map(row=>{
  const base=index.get(row.id);if(!base||base.sha256!==row.sha256)throw new Error('Fixture mismatch: '+row.id);
  if(base.bodyFont!==row.bodyFont||JSON.stringify(base.fonts)!==JSON.stringify(row.fonts))throw new Error('Font declaration mismatch: '+row.id);
  if(row.before.stages!==row.after.stages||row.before.styles!==row.after.styles)throw new Error('Resource leak: '+row.id);
  if(row.before.stages!==base.before.stages||row.before.styles!==base.before.styles)throw new Error('Host resource count changed: '+row.id);
  if(row.pages!==base.pages)throw new Error('Page count changed: '+row.id);
  const checks=[['outlineMax',Math.max(...base.parseMs),Math.max(...row.parseMs),limits.parseAdditiveMs],['firstRender',base.renderMs[0]!,row.renderMs[0]!,limits.renderAdditiveMs],['warmRenderMax',Math.max(...base.renderMs.slice(1)),Math.max(...row.renderMs.slice(1)),limits.renderAdditiveMs],['pagination',base.paginateMs,row.paginateMs,limits.paginationAdditiveMs]] as const;
  return {id:row.id,checks:checks.map(([metric,before,after,additive])=>({metric,before,after,limit:before*limits.maxMultiplier+additive,passed:after<=before*limits.maxMultiplier+additive}))};
 });
}
