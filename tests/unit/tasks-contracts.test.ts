// @vitest-environment node
import {it,expect} from 'vitest';
import {snapshotRequest,executorMessageSchema,artifactSchema} from '../../src/application/tasks/contracts';
import {checkModuleSource} from '../../scripts/check-module-boundaries';
import {request,artifact} from './task-fixtures';
it('owns the snapshot and rejects mismatched identities or unknown protocol/kind',()=>{
 const input=request();const owned=snapshotRequest(input);input.document.markdown='changed';expect(owned.document.markdown).toBe('# Test');
 for(const value of [{}, {...owned,kind:'user.dag'},{...owned,identity:{...owned.identity,protocolVersion:2}},{...owned,document:{...owned.document,id:'different'}}])expect(()=>snapshotRequest(value)).toThrow();
});
it('validates messages and rejects nonserializable/unsupported artifacts',()=>{
 expect(executorMessageSchema.safeParse({type:'result',artifact:artifact()}).success).toBe(false);
 expect(artifactSchema.safeParse({...artifact(),content:()=>undefined}).success).toBe(false);
 expect(artifactSchema.safeParse({...artifact(),sourceMap:[{nodeId:'x',start:{line:1,column:1,offset:10},end:{line:1,column:1,offset:1}}]}).success).toBe(false);
});
it('keeps task governance free of renderers, UI and native runtime access',()=>{
 for(const source of ["import '../../core/render/mathRender'","document.createElement('div')","import React from 'react'","import {readFile} from '@tauri-apps/plugin-fs'"])expect(checkModuleSource('src/application/tasks/sample.ts',source).length).toBeGreaterThan(0);
 expect(checkModuleSource('src/core/model/sample.ts',"import '../../application/tasks/contracts'").length).toBeGreaterThan(0);
});

it('rejects export kinds and binary export artifacts at the preview boundary',()=>{expect(()=>snapshotRequest({...request(),kind:'export.html'})).toThrow();expect(artifactSchema.safeParse({...artifact(),mediaType:'application/zip',encoding:'base64',content:'UEs='}).success).toBe(false);expect(artifactSchema.safeParse({...artifact(),mediaType:'text/html',encoding:'utf8'}).success).toBe(true)});

it('keeps export application code independent of preview governance, UI, DOM and Web adapters',()=>{
 for(const source of ["import '../../core/export/htmlExporter'","import '../../core/platform/web/exportService'","import '../tasks/roleScheduler'","document.createElement('a')","import React from 'react'","import {readFile} from '@tauri-apps/plugin-fs'"])expect(checkModuleSource('src/application/exports/sample.ts',source).length).toBeGreaterThan(0);
 expect(checkModuleSource('src/application/exports/sample.ts',"import type {DocumentRecord} from '../../core/model/document'; export function copy(input:DocumentRecord){return structuredClone(input)}")).toEqual([]);
 expect(checkModuleSource('src/application/tasks/sample.ts',"import '../exports/exportService'").length).toBeGreaterThan(0);
});
