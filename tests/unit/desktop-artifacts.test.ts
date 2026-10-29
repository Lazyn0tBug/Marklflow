// @vitest-environment node
import {afterEach,beforeEach,expect,it} from 'vitest';
import {createHash} from 'node:crypto';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename,dirname,join,resolve} from 'node:path';
import JSZip from 'jszip';
import {collectDesktopArtifacts,desktopPlatform,type DesktopPlatform} from '../../scripts/desktop-artifacts';

let root:string;
beforeEach(async()=>{
 root=await mkdtemp(join(tmpdir(),'markflow-m2-'));
 await mkdir(join(root,'src-tauri'),{recursive:true});
 await writeFile(join(root,'src-tauri/tauri.conf.json'),JSON.stringify({version:'0.9.1'}));
});
afterEach(async()=>{
 if(dirname(resolve(root))!==resolve(tmpdir())||!basename(root).startsWith('markflow-m2-'))throw new Error('Unexpected test directory');
 await rm(root,{recursive:true,force:true});
});
async function file(path:string,content:string){await mkdir(dirname(join(root,path)),{recursive:true});await writeFile(join(root,path),content)}
async function fixtures(platform:DesktopPlatform){
 if(platform==='windows-x64'){
  await file('src-tauri/target/release/bundle/msi/MarkFlow.msi','msi-content');
  await file('src-tauri/target/release/bundle/nsis/MarkFlow-setup.exe','nsis-content');
  await file('src-tauri/target/release/markflow.exe','release-executable-fixture');
 }else if(platform==='linux-x64'){
  await file('src-tauri/target/release/bundle/deb/MarkFlow.deb','deb-content');
  await file('src-tauri/target/release/bundle/appimage/MarkFlow.AppImage','appimage-content');
 }else await file('src-tauri/target/universal-apple-darwin/release/bundle/dmg/MarkFlow.dmg','dmg-content');
}
it('stages required Windows installers and an exact single-executable ZIP with hashes',async()=>{
 await fixtures('windows-x64');
 const result=await collectDesktopArtifacts(root,'windows-x64');expect(result.artifacts).toHaveLength(3);
 const output=join(root,'desktop-artifacts/windows-x64');
 const zip=await JSZip.loadAsync(await readFile(join(output,'MarkFlow_0.9.1_windows_x64_portable.zip')));
 expect(Object.keys(zip.files)).toEqual(['markflow.exe']);expect(await zip.file('markflow.exe')!.async('string')).toBe('release-executable-fixture');
 for(const artifact of result.artifacts){const bytes=await readFile(join(output,artifact.name));expect(bytes.length).toBe(artifact.bytes);expect(createHash('sha256').update(bytes).digest('hex')).toBe(artifact.sha256)}
 expect(JSON.parse(await readFile(join(output,'manifest.json'),'utf8'))).toEqual(result);
 expect(result.executableZip?.runtime).toContain('WebView2');
});
for(const platform of ['macos-universal','linux-x64'] as const)it('collects only the required formats for '+platform,async()=>{
 await fixtures(platform);const result=await collectDesktopArtifacts(root,platform);
 expect(result.artifacts).toHaveLength(platform==='macos-universal'?1:2);expect(result.executableZip).toBeUndefined();
});
it('rejects a missing Linux format even when another expected format exists',async()=>{
 await file('src-tauri/target/release/bundle/deb/MarkFlow.deb','present');
 await expect(collectDesktopArtifacts(root,'linux-x64')).rejects.toThrow();
 await expect(readFile(join(root,'desktop-artifacts/linux-x64/manifest.json'))).rejects.toThrow();
});
it('requires the universal macOS target instead of falling back to a host-only bundle',async()=>{
 await file('src-tauri/target/release/bundle/dmg/host-only.dmg','not-universal');
 await expect(collectDesktopArtifacts(root,'macos-universal')).rejects.toThrow();
});
it('does not substitute a stale debug executable for the Windows release output',async()=>{
 await file('src-tauri/target/release/bundle/msi/MarkFlow.msi','present');await file('src-tauri/target/release/bundle/nsis/MarkFlow.exe','present');
 await file('src-tauri/target/debug/markflow.exe','stale-debug');
 await expect(collectDesktopArtifacts(root,'windows-x64')).rejects.toThrow();
 expect(await readFile(join(root,'src-tauri/target/debug/markflow.exe'),'utf8')).toBe('stale-debug');
});
it('rejects an empty installer',async()=>{
 await fixtures('windows-x64');await writeFile(join(root,'src-tauri/target/release/bundle/msi/MarkFlow.msi'),'');
 await expect(collectDesktopArtifacts(root,'windows-x64')).rejects.toThrow('nonempty artifact');
});
it('rejects unsafe or nonliteral application versions',async()=>{
 await fixtures('windows-x64');await writeFile(join(root,'src-tauri/tauri.conf.json'),JSON.stringify({version:'../../escape'}));
 await expect(collectDesktopArtifacts(root,'windows-x64')).rejects.toThrow('literal application version');
});
it('does not reuse or delete an existing output directory',async()=>{
 await fixtures('windows-x64');await file('desktop-artifacts/windows-x64/keep.txt','keep');
 await expect(collectDesktopArtifacts(root,'windows-x64')).rejects.toThrow();
 expect(await readFile(join(root,'desktop-artifacts/windows-x64/keep.txt'),'utf8')).toBe('keep');
});
it('limits platform selection to the configured CI matrix',()=>{
 for(const value of ['windows-x64','macos-universal','linux-x64'])expect(desktopPlatform(value)).toBe(value);
 expect(()=>desktopPlatform('windows-arm64')).toThrow();expect(()=>desktopPlatform(undefined)).toThrow();
});
