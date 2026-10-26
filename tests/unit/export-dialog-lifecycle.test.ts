import {it,expect,vi} from 'vitest';
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
const state=vi.hoisted(()=>({prepare:vi.fn()}));
vi.mock('../../src/core/export/exportContent',()=>({prepareExportContent:state.prepare}));
import {ExportModal} from '../../src/components/export/ExportModal';
import {webExportService} from '../../src/core/platform/web/exportService';
import {createNewDocument} from '../../src/core/storage/storage';
import {htmlArtifact} from './export-fixtures';
it('does not leave export busy if the dialog unmounts before preparation asks for confirmation',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);const host=document.createElement('div');document.body.append(host);const root=createRoot(host),doc=createNewDocument('Closing');let resolve=(value:ReturnType<typeof htmlArtifact>)=>{void value};state.prepare.mockReturnValue(new Promise(done=>{resolve=done}));
 const button=(text:string)=>[...host.querySelectorAll('button')].find(node=>node.textContent?.includes(text))!;
 try{
  await act(async()=>{root.render(createElement(ExportModal,{isOpen:true,onClose:()=>{},document:doc,mathMode:'svg'}))});await act(async()=>{button('Word 原生文档').click()});await act(async()=>{button('立即导出并保存').click()});expect(webExportService.busy).toBe(true);
  await act(async()=>{root.unmount()});await act(async()=>{resolve(htmlArtifact('<span data-mf-math-id="math-0"><svg xmlns="http://www.w3.org/2000/svg"></svg></span>',doc));for(let i=0;i<12;i++)await Promise.resolve()});expect(webExportService.busy).toBe(false);
 }finally{host.remove();vi.unstubAllGlobals()}
});
