import {readdir} from 'node:fs/promises';
import {extname,join} from 'node:path';

/** Source policy complements allowJs=false, which only excludes JavaScript from tsc. */
const failures:string[]=[];
async function inspect(directory:string):Promise<void>{
 for(const entry of await readdir(directory,{withFileTypes:true})){
  const file=join(directory,entry.name);
  if(entry.isDirectory())await inspect(file);
  else if(/\.(?:[cm]?js|jsx)$/i.test(extname(file)))failures.push(file);
 }
}
for(const directory of ['src','tests','scripts'])await inspect(directory);
for(const entry of await readdir('.',{withFileTypes:true})){
 if(entry.isFile()&&/\.config\.(?:[cm]?js|jsx)$/i.test(entry.name))failures.push(entry.name);
}
if(failures.length){
 console.error('First-party source/config must use TypeScript:\n'+failures.join('\n'));process.exitCode=1;
}
