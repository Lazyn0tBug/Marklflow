import {parse} from '@babel/parser';
import {readFile,readdir} from 'node:fs/promises';
import {resolve,relative,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
const pureRoots=['src/core/model/','src/core/parse/','src/core/policy/'];
const allowed=new Set(['zod','css-tree','unified','remark-parse','remark-gfm','remark-math','unist-util-visit']);
function portable(file:string){return file.replaceAll('\\','/')}
export function checkModuleSource(file:string,source:string,root=process.cwd()):string[]{
 const failures:string[]=[],path=portable(file),pure=pureRoots.some(p=>path.startsWith(p));
 const tree=parse(source,{sourceType:'module',plugins:['typescript',...(file.endsWith('tsx')?['jsx' as const]:[])],createImportExpressions:true});
 function dependency(name:string,typeOnly=false){
  if(name.startsWith('node:'))failures.push('browser/core cannot import '+name);
  if(!pure)return;
  if(name.startsWith('.')){
   const target=portable(relative(root,resolve(root,dirname(file),name)));
   if(!pureRoots.some(p=>target.startsWith(p)))failures.push('pure module cannot import '+name);
  }else if(!allowed.has(name)&&!(typeOnly&&['mdast','hast','unist'].includes(name)))failures.push('pure dependency not approved: '+name);
 }
 function literal(value:unknown):string|undefined{
  return value&&typeof value==='object'&&'type'in value&&value.type==='StringLiteral'&&'value'in value&&typeof value.value==='string'?value.value:undefined;
 }
 function visit(node:unknown):void{
  if(!node||typeof node!=='object')return;
  if(Array.isArray(node)){node.forEach(visit);return}
  if('type'in node){
   if(['ImportDeclaration','ExportNamedDeclaration','ExportAllDeclaration'].includes(String(node.type))&&'source'in node){const name=literal(node.source);if(name!==undefined)dependency(name,'importKind'in node&&node.importKind==='type'||'exportKind'in node&&node.exportKind==='type')}
   if(node.type==='TSImportType'&&'argument'in node){const name=literal(node.argument);if(name!==undefined)dependency(name,true)}
   if(node.type==='ImportExpression'&&'source'in node){const name=literal(node.source);if(name!==undefined)dependency(name);else if(pure)failures.push('pure module cannot use computed dynamic import')}
   if(node.type==='Identifier'&&'name'in node&&['process','Buffer','NodeJS','Bun','require'].includes(String(node.name)))failures.push('browser/core cannot use host global '+String(node.name));
  }
  for(const [key,value]of Object.entries(node))if(!['loc','extra','comments','tokens'].includes(key))visit(value);
 }
 visit(tree);return failures;
}

async function inspect(directory:string):Promise<string[]>{
 const errors:string[]=[];
 for(const entry of await readdir(directory,{withFileTypes:true})){
  const file=directory+'/'+entry.name;
  if(entry.isDirectory())errors.push(...await inspect(file));
  else if(/\.tsx?$/.test(file))errors.push(...checkModuleSource(file,await readFile(file,'utf8')).map(message=>file+': '+message));
 }return errors;
}
if(import.meta.url===pathToFileURL(resolve(process.argv[1]||'')).href){
 const failures=await inspect('src');if(failures.length){console.error(failures.join('\n'));process.exitCode=1}
}
