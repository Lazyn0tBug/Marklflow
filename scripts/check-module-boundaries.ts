import {parse} from '@babel/parser';
import {readFile,readdir} from 'node:fs/promises';
import {resolve,relative,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {builtinModules} from 'node:module';
const pureRoots=['src/core/model/','src/core/parse/','src/core/policy/'];
const taskRoot='src/application/tasks/';
const builtins=new Set(builtinModules.map(name=>name.replace(/^node:/,'')));
const hostGlobals=new Set(['process','Buffer','NodeJS','Bun','require']);
const domGlobals=new Set(['window','document','HTMLElement','DOMParser','localStorage','indexedDB']);
const allowed=new Set(['zod','css-tree','unified','remark-parse','remark-gfm','remark-math','unist-util-visit']);
function portable(file:string){return file.replaceAll('\\','/')}
export function checkModuleSource(file:string,source:string,root=process.cwd()):string[]{
 const failures:string[]=[],path=portable(relative(root,resolve(root,file))).toLowerCase(),corePure=pureRoots.some(p=>path.startsWith(p)),taskPure=path.startsWith(taskRoot),pure=corePure||taskPure;
 const tree=parse(source,{sourceType:'module',plugins:['typescript',...(file.endsWith('tsx')?['jsx' as const]:[])],createImportExpressions:true});
 function dependency(name:string,typeOnly=false){
  if(name.startsWith('node:')||builtins.has(name)||name==='bun'||name.startsWith('bun:'))failures.push('browser/core cannot import '+name);
  if(name.startsWith('@tauri-apps/')&&!['src/core/platform/tauri/','src/platform/tauri/'].some(p=>path.startsWith(p)))failures.push('native SDK must stay inside a platform adapter: '+name);
  if(!pure)return;
  if(name.startsWith('.')){
   const target=portable(relative(root,resolve(root,dirname(file),name))).toLowerCase();
   if(!pureRoots.some(p=>target.startsWith(p))&&!(taskPure&&(target.startsWith(taskRoot)||target==='docs/contracts/architecture-runtime-budget.json')))failures.push('pure module cannot import '+name);
  }else if(!allowed.has(name)&&!(typeOnly&&['mdast','hast','unist'].includes(name)))failures.push('pure dependency not approved: '+name);
 }
 function literal(value:unknown):string|undefined{
  return value&&typeof value==='object'&&'type'in value&&value.type==='StringLiteral'&&'value'in value&&typeof value.value==='string'?value.value:undefined;
 }
 function visit(node:unknown,parent:object|undefined=undefined,position=''):void{
  if(!node||typeof node!=='object')return;
  if(Array.isArray(node)){node.forEach(item=>visit(item,parent,position));return}
  if('type'in node){
   if(['ImportDeclaration','ExportNamedDeclaration','ExportAllDeclaration'].includes(String(node.type))&&'source'in node){const name=literal(node.source);if(name!==undefined)dependency(name,'importKind'in node&&node.importKind==='type'||'exportKind'in node&&node.exportKind==='type')}
   if(node.type==='TSImportType'&&'argument'in node){const name=literal(node.argument);if(name!==undefined)dependency(name,true)}
   if(node.type==='ImportExpression'&&'source'in node){const name=literal(node.source);if(name!==undefined)dependency(name);else if(pure)failures.push('pure module cannot use computed dynamic import')}
   if(['MemberExpression','OptionalMemberExpression'].includes(String(node.type))&&'object'in node&&node.object&&typeof node.object==='object'&&'type'in node.object&&node.object.type==='Identifier'&&'name'in node.object&&['globalThis','self','window'].includes(String(node.object.name))&&'property'in node){
    const prop=node.property;
    const name=literal(prop)??(prop&&typeof prop==='object'&&'type'in prop&&prop.type==='Identifier'&&'name'in prop?String(prop.name):undefined);
    if(name&&(hostGlobals.has(name)||pure&&domGlobals.has(name)))failures.push('forbidden environment member: '+name);
    if(pure&&'computed'in node&&node.computed&&literal(prop)===undefined)failures.push('pure module cannot read computed environment members');
   }
   const parentType=parent&&'type'in parent?parent.type:undefined,computed=parent&&'computed'in parent?parent.computed:false;
   const dataKey=(position==='key'&&['ObjectProperty','ObjectMethod','TSPropertySignature'].includes(String(parentType))&&!computed)||(position==='property'&&['MemberExpression','OptionalMemberExpression'].includes(String(parentType))&&!computed);
   if(node.type==='Identifier'&&'name'in node&&(hostGlobals.has(String(node.name))||taskPure&&domGlobals.has(String(node.name)))&&!dataKey)failures.push('browser/core cannot use host global '+String(node.name));
  }
  for(const [key,value]of Object.entries(node))if(!['loc','extra','comments','tokens'].includes(key))visit(value,node,key);
 }
 visit(tree);return failures;
}

async function inspect(directory:string):Promise<string[]>{
 const errors:string[]=[];
 for(const entry of await readdir(directory,{withFileTypes:true})){
  const file=directory+'/'+entry.name;
  if(entry.isDirectory())errors.push(...await inspect(file));
  else if(/\.(?:[cm]?ts|tsx)$/i.test(file))errors.push(...checkModuleSource(file,await readFile(file,'utf8')).map(message=>file+': '+message));
 }return errors;
}
if(import.meta.url===pathToFileURL(resolve(process.argv[1]||'')).href){
 const failures=await inspect('src');if(failures.length){console.error(failures.join('\n'));process.exitCode=1}
}
