import {it,expect,vi} from 'vitest';
vi.mock('../../src/core/export/documentPrint',async original=>({...await original<typeof import('../../src/core/export/documentPrint')>(),waitForLayout:vi.fn(async()=>{})}));
import {exportDocumentToDocx} from '../../src/core/export/docxExporter';
import {waitForLayout} from '../../src/core/export/documentPrint';
import {sharedDom} from '../../src/core/platform/web/sharedDom';
import {htmlArtifact} from './export-fixtures';
const flush=async()=>{for(let i=0;i<60;i++)await Promise.resolve()};
it('waits for the existing DOM step and releases the measurement host before returning DOCX bytes',async()=>{
 let release=()=>{};const blocker=sharedDom.step('foreground','engine',new AbortController().signal,()=>new Promise<void>(resolve=>{release=resolve}));await flush();
 const pending=exportDocumentToDocx(htmlArtifact('<h1>HTML document</h1>'));await flush();expect(document.querySelector('.mf-docx-export-stage')).toBeNull();release();await blocker;expect((await pending).size).toBeGreaterThan(0);expect(document.querySelector('.mf-docx-export-stage')).toBeNull();expect(sharedDom.snapshot()).toMatchObject({active:undefined,waiting:[],blocked:false});
});
it('cleans failed measurement and allows the next explicit export',async()=>{
 vi.mocked(waitForLayout).mockRejectedValueOnce(new Error('layout failed'));await expect(exportDocumentToDocx(htmlArtifact('<p>x</p>'))).rejects.toThrow('layout failed');expect(document.querySelector('.mf-docx-export-stage')).toBeNull();expect((await exportDocumentToDocx(htmlArtifact('<p>retry</p>'))).size).toBeGreaterThan(0);
});
