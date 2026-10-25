import {readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
export function uncoveredSources(required:string[],covered:Set<string>):string[]{return required.filter(file=>!covered.has(file))}
async function discover(directory:string):Promise<string[]>{
 const result:string[]=[];
 for(const entry of await readdir(directory,{withFileTypes:true})){const path=directory+'/'+entry.name;if(entry.isDirectory())result.push(...await discover(path));else if(/\.(?:[cm]?ts|tsx)$/i.test(entry.name))result.push(path)}return result;
}
if(import.meta.url===pathToFileURL(resolve(process.argv[1]||'')).href){
 const required=(await Promise.all(['src','tests','scripts'].map(discover))).flat();
 for(const entry of await readdir('.',{withFileTypes:true}))if(entry.isFile()&&/\.config\.[cm]?ts$/i.test(entry.name))required.push(entry.name);
 const canonical=(file:string)=>resolve(file).replaceAll('\\','/').toLowerCase();
 const covered=new Set<string>();
 for(const config of ['tsconfig.json','tsconfig.worker.json','tsconfig.tools.json','tsconfig.integration.json']){
  const output=execFileSync(process.execPath,['node_modules/typescript/bin/tsc','--listFilesOnly','-p',config],{encoding:'utf8',maxBuffer:16*1024*1024});
  output.split(/\r?\n/).filter(Boolean).forEach(file=>covered.add(canonical(file)));
 }
 const missing=uncoveredSources(required.map(canonical),covered);if(missing.length){console.error('Managed TypeScript is not covered by any profile:\n'+missing.join('\n'));process.exitCode=1}else console.log('Type coverage: '+required.length+' managed sources/configs covered');
}
