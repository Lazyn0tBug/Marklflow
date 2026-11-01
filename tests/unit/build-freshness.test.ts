// @vitest-environment node
import {it,expect} from 'vitest';
import {mkdtemp,mkdir,writeFile,utimes} from 'node:fs/promises';
import {readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {inspectBuild,staleReason} from '../../scripts/check-fresh-build';

/**
 * The end-to-end suite runs against dist/, so a build older than the sources would test the
 * previous code and report it as current. The gate has to tell the two apart, and it has to
 * stay wired into the entry points that run the suite.
 */
async function tree(options:{build?:boolean;buildAgeSeconds:number;sourceAgeSeconds:number}){
 const root=await mkdtemp(join(tmpdir(),'mf-build-'));
 const source=join(root,'src','app.ts'),build=join(root,'dist','index.html');
 await mkdir(join(root,'src'),{recursive:true});
 await writeFile(source,'export const value=1;\n');
 if(options.build!==false){await mkdir(join(root,'dist'),{recursive:true});await writeFile(build,'<!doctype html>\n')}
 const now=Date.now();
 await utimes(source,new Date(now-options.sourceAgeSeconds*1000),new Date(now-options.sourceAgeSeconds*1000));
 if(options.build!==false)await utimes(build,new Date(now-options.buildAgeSeconds*1000),new Date(now-options.buildAgeSeconds*1000));
 return {root,buildDir:join(root,'dist'),sources:[join(root,'src')]};
}

it('accepts a build that is newer than the sources',async()=>{
 const fixture=await tree({buildAgeSeconds:10,sourceAgeSeconds:60});
 expect(staleReason(await inspectBuild(fixture.buildDir,fixture.sources))).toBeUndefined();
});

it('rejects a build that is older than the sources and names the command',async()=>{
 const fixture=await tree({buildAgeSeconds:60,sourceAgeSeconds:10});
 const reason=staleReason(await inspectBuild(fixture.buildDir,fixture.sources));
 expect(reason).toContain('older than the sources');
 expect(reason).toContain('bun run build');
});

it('rejects a missing build',async()=>{
 const fixture=await tree({build:false,buildAgeSeconds:10,sourceAgeSeconds:60});
 expect(staleReason(await inspectBuild(fixture.buildDir,fixture.sources))).toContain('no build output');
});

it('builds before the suite runs and refuses a stale build',async()=>{
 const scripts=JSON.parse(await readFile('package.json','utf8')).scripts as Record<string,string>;
 expect(scripts['test:e2e']).toMatch(/build\s*&&\s*playwright test/);
 const config=await readFile('playwright.config.ts','utf8');
 expect(config).toContain('globalSetup');
 expect(config).toContain('check-fresh-build');
});
