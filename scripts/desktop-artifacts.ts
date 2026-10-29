import {createHash} from 'node:crypto';
import {mkdir,readFile,readdir,stat,writeFile} from 'node:fs/promises';
import {basename,join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import JSZip from 'jszip';

export type DesktopPlatform='windows-x64'|'macos-universal'|'linux-x64';
interface Artifact {name:string;bytes:number;sha256:string}
export interface DesktopArtifactManifest {
 schemaVersion:1;platform:DesktopPlatform;appVersion:string;artifacts:Artifact[];
 executableZip?:{content:'markflow.exe only';runtime:'system WebView2 required; clean-install acceptance pending'};
}
export function desktopPlatform(value:string|undefined):DesktopPlatform {
 if(value==='windows-x64'||value==='macos-universal'||value==='linux-x64')return value;
 throw new Error('Expected windows-x64, macos-universal, or linux-x64');
}
const digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
async function nonemptyFile(path:string):Promise<void>{
 const info=await stat(path);
 if(!info.isFile()||info.size===0)throw new Error('Expected nonempty artifact: '+path);
}
async function bundleFiles(directory:string,extension:string):Promise<string[]>{
 const names=(await readdir(directory,{withFileTypes:true})).filter(entry=>entry.isFile()&&entry.name.endsWith(extension)).map(entry=>join(directory,entry.name)).sort();
 if(!names.length)throw new Error('Missing required '+extension+' bundle: '+directory);
 for(const path of names)await nonemptyFile(path);
 return names;
}
/** Build output only: never searches debug/fallback directories or creates a release. */
export async function collectDesktopArtifacts(root:string,platform:DesktopPlatform):Promise<DesktopArtifactManifest>{
 const config:unknown=JSON.parse(await readFile(join(root,'src-tauri/tauri.conf.json'),'utf8'));
 if(!config||typeof config!=='object'||!('version'in config)||typeof config.version!=='string'||!/^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/.test(config.version))throw new Error('Expected a literal application version');
 const version=config.version;
 const release=join(root,'src-tauri/target',...(platform==='macos-universal'?['universal-apple-darwin']:[]),'release');
 const kinds=platform==='windows-x64'?[['msi','.msi'],['nsis','.exe']]:platform==='linux-x64'?[['deb','.deb'],['appimage','.AppImage']]:[['dmg','.dmg']];
 const inputs:string[]=[];
 for(const [kind,extension] of kinds){if(!kind||!extension)throw new Error('Invalid bundle contract');inputs.push(...await bundleFiles(join(release,'bundle',kind),extension))}
 let executable:Uint8Array|undefined;
 if(platform==='windows-x64'){const path=join(release,'markflow.exe');await nonemptyFile(path);executable=await readFile(path)}
 const output=join(root,'desktop-artifacts',platform);await mkdir(join(root,'desktop-artifacts'),{recursive:true});
 // A fresh output directory prevents stale files being uploaded on a local rerun.
 await mkdir(output);
 const artifacts:Artifact[]=[];
 for(const input of inputs){const name=basename(input),bytes=await readFile(input);await writeFile(join(output,name),bytes);artifacts.push({name,bytes:bytes.byteLength,sha256:digest(bytes)})}
 if(executable){
  const zip=new JSZip();zip.file('markflow.exe',executable);
  const bytes=await zip.generateAsync({type:'uint8array',compression:'DEFLATE'}),name='MarkFlow_'+version+'_windows_x64_portable.zip';
  await writeFile(join(output,name),bytes);artifacts.push({name,bytes:bytes.byteLength,sha256:digest(bytes)});
 }
 const manifest:DesktopArtifactManifest={schemaVersion:1,platform,appVersion:version,artifacts,...(executable?{executableZip:{content:'markflow.exe only' as const,runtime:'system WebView2 required; clean-install acceptance pending' as const}}:{})};
 await writeFile(join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 return manifest;
}
if(import.meta.url===pathToFileURL(resolve(process.argv[1]||'')).href){
 const manifest=await collectDesktopArtifacts(process.cwd(),desktopPlatform(process.argv[2]));
 console.log('Verified '+manifest.artifacts.length+' desktop artifacts for '+manifest.platform);
}
