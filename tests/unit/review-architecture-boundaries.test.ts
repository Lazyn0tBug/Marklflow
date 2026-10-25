// @vitest-environment node
import {it,expect} from 'vitest';
import {resolve} from 'node:path';
import {checkModuleSource} from '../../scripts/check-module-boundaries';
it('rejects bare Node builtins and global member access in browser sources',()=>{
 for(const source of ["import {readFile} from 'fs'","export * from 'path/posix'","globalThis['process'].exit()","self['Buffer']"]){expect(checkModuleSource('src/App.tsx',source).length).toBeGreaterThan(0)}
});
it('normalizes absolute source paths before enforcing pure module imports',()=>{
 expect(checkModuleSource(resolve('src/core/model/check.ts'),"export * from '../render/htmlPolicy'").length).toBeGreaterThan(0);
});
it('keeps native SDK access inside future platform adapters',()=>{
 expect(checkModuleSource('src/App.tsx',"import {readFile} from '@tauri-apps/plugin-fs'").length).toBeGreaterThan(0);
 expect(checkModuleSource('src/core/platform/tauri/files.ts',"import {readFile} from '@tauri-apps/plugin-fs'")).toEqual([]);
});
it('distinguishes data property names from references to host globals',()=>{
 expect(checkModuleSource('src/App.tsx',"const record={process:'step',Buffer:3}; record.process;")).toEqual([]);
});
