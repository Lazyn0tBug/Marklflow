// @vitest-environment node
import {it,expect} from 'vitest';
import {snapshotRequest,executorMessageSchema,artifactSchema} from '../../src/application/tasks/contracts';
import {TaskLifecycle} from '../../src/application/tasks/lifecycle';
import {checkModuleSource} from '../../scripts/check-module-boundaries';
import {request,artifact} from './task-fixtures';
it('owns the snapshot and rejects mismatched identities or unknown protocol/kind',()=>{
 const input=request();const owned=snapshotRequest(input);input.document.markdown='changed';expect(owned.document.markdown).toBe('# Test');
 for(const value of [{}, {...owned,kind:'user.dag'},{...owned,identity:{...owned.identity,protocolVersion:2}},{...owned,document:{...owned.document,revision:2}}])expect(()=>snapshotRequest(value)).toThrow();
});
it('validates messages and rejects nonserializable/unsupported artifacts',()=>{
 expect(executorMessageSchema.safeParse({type:'result',artifact:artifact()}).success).toBe(false);
 expect(artifactSchema.safeParse({...artifact(),content:()=>undefined}).success).toBe(false);
 expect(artifactSchema.safeParse({...artifact(),sourceMap:[{nodeId:'x',start:{line:1,column:1,offset:10},end:{line:1,column:1,offset:1}}]}).success).toBe(false);
});
it('sets a terminal result exactly once and guards invalid transitions',()=>{
 const task=new TaskLifecycle();expect(()=>task.move('succeeded')).toThrow();task.move('running');task.move('cancelRequested');task.move('timedOut');expect(task.move('succeeded')).toBe(false);expect(task.history).toEqual(['queued','running','cancelRequested','timedOut']);
});
it('keeps task governance free of renderers, UI and native runtime access',()=>{
 for(const source of ["import '../../core/render/mathRender'","document.createElement('div')","import React from 'react'","import {readFile} from '@tauri-apps/plugin-fs'"])expect(checkModuleSource('src/application/tasks/sample.ts',source).length).toBeGreaterThan(0);
 expect(checkModuleSource('src/core/model/sample.ts',"import '../../application/tasks/contracts'").length).toBeGreaterThan(0);
});

it('validates binary encodings separately from selectable text output',()=>{expect(artifactSchema.safeParse({...artifact(),mediaType:'application/zip',encoding:'utf8'}).success).toBe(false);expect(artifactSchema.safeParse({...artifact(),mediaType:'application/zip',encoding:'base64',content:'not base64!'}).success).toBe(false);expect(artifactSchema.safeParse({...artifact(),mediaType:'application/zip',encoding:'base64',content:'UEs='}).success).toBe(true)});
