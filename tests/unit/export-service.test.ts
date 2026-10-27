// @vitest-environment node
import {it,expect,vi} from 'vitest';
import {ExportService,type ExportInput,type ExportPorts} from '../../src/application/exports/exportService';
import type {OutputIssue} from '../../src/core/model/exportDiagnostics';
import {htmlArtifact} from './export-fixtures';
import {request} from './task-fixtures';
function setup(){const ports:ExportPorts={prepare:vi.fn(async doc=>htmlArtifact('<h1>CANONICAL HTML</h1>',doc)),inspectDocx:vi.fn(()=>[]),encodeEditableSource:vi.fn(async()=>'frozen-source'),generatePdfHtml:vi.fn(async()=>'<html>frozen</html>'),generateMarkdownBundle:vi.fn(async()=>new Blob(['zip'])),generateHtml:vi.fn(async()=>'<html>frozen</html>'),generateDocx:vi.fn(async()=>new Blob(['docx'])),download:vi.fn(),deliverPdf:vi.fn(async()=>{})};return {ports,service:new ExportService(ports)}}
function input(format:ExportInput['format']='editable-html'):ExportInput{return {document:request().document,format,fileName:' original ',mathMode:'mathml',allowRemoteAssets:false}}
it('holds busy and captures source/options before one HTML preparation',async()=>{
 const {ports,service}=setup(),source=input(),artifact=htmlArtifact('<h1>CANONICAL</h1>',source.document);let complete=()=>{};
 vi.mocked(ports.prepare).mockReturnValue(new Promise(resolve=>{complete=()=>resolve(artifact)}));const running=service.run(source);source.document.markdown='edited';source.document.revision=2;source.fileName='changed';source.mathMode='svg';source.allowRemoteAssets=true;
 expect(service.busy).toBe(true);expect(await service.run(input())).toEqual({status:'busy'});const call=vi.mocked(ports.prepare).mock.calls[0]!;expect(call[0].markdown).toBe('# Test');expect(call[1]).toEqual({mathMode:'mathml',allowRemoteAssets:false});complete();
 expect(await running).toMatchObject({status:'completed',documentId:'A',revision:1});expect(ports.prepare).toHaveBeenCalledOnce();expect(ports.generateHtml).toHaveBeenCalledExactlyOnceWith(artifact,{editablePayload:'frozen-source'});expect(ports.download).toHaveBeenCalledWith(expect.any(Blob),'original.markflow.html');expect(service.busy).toBe(false);
});
it('saves exact Markdown and resource bundles without preparing rendered HTML',async()=>{
 const {ports,service}=setup(),source=input('markdown');source.document.markdown='source\r\n';await service.run(source);expect(await vi.mocked(ports.download).mock.calls[0]![0].text()).toBe('source\r\n');await service.run(input('markdown-bundle'));
 expect(ports.prepare).not.toHaveBeenCalled();expect(ports.generateMarkdownBundle).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({id:'A'}),{allowRemoteAssets:false});
});
it('routes all content formats from the single HTML contract and reports only browser handoff for PDF',async()=>{
 const {ports,service}=setup();await service.run(input('reading-html'));expect(ports.generateHtml).toHaveBeenCalledWith(expect.objectContaining({html:'<h1>CANONICAL HTML</h1>'}),{});await service.run(input('docx'));expect(ports.prepare).toHaveBeenLastCalledWith(expect.objectContaining({id:'A'}),{mathMode:'svg',allowRemoteAssets:false});
 expect(ports.generateDocx).toHaveBeenCalledWith(expect.objectContaining({html:'<h1>CANONICAL HTML</h1>'}),{allowSourceFallback:false});const result=await service.run(input('print-pdf'));expect(result.status==='completed'&&result.message).toContain('已交由浏览器处理');expect(ports.deliverPdf).toHaveBeenCalledWith('<html>frozen</html>');
});
it('releases busy on preparation/generation/download/handoff failure without retry',async()=>{
 for(const which of ['prepare','generateHtml','download','deliverPdf'] as const){const {ports,service}=setup();vi.mocked(ports[which]).mockImplementation(()=>{throw new Error('injected failure')});await expect(service.run(input(which==='deliverPdf'?'print-pdf':'reading-html'))).rejects.toThrow('injected failure');expect(ports[which]).toHaveBeenCalledOnce();expect(service.busy).toBe(false)}
});
it('releases busy on invalid source input',async()=>{const {service}=setup(),source=input();source.document.revision=-1;await expect(service.run(source)).rejects.toThrow();expect(service.busy).toBe(false);expect(await service.run(input('markdown'))).toMatchObject({status:'completed'})});
it('releases busy after DOCX failure and allows explicit source saving',async()=>{const {ports,service}=setup();vi.mocked(ports.generateDocx).mockRejectedValueOnce(new Error('docx failure'));await expect(service.run(input('docx'))).rejects.toThrow('docx failure');expect(service.busy).toBe(false);await service.run(input('markdown'));expect(ports.download).toHaveBeenCalledOnce()});
it('does not hand off a failed PDF generation',async()=>{const {ports,service}=setup();vi.mocked(ports.generatePdfHtml).mockRejectedValueOnce(new Error('pagination failure'));await expect(service.run(input('print-pdf'))).rejects.toThrow('pagination failure');expect(ports.deliverPdf).not.toHaveBeenCalled();expect(service.busy).toBe(false)});
it('passes the accepted name after asynchronous HTML preparation',async()=>{const {ports,service}=setup(),source=input('print-pdf'),running=service.run(source);source.fileName='changed';await running;expect(ports.generatePdfHtml).toHaveBeenCalledWith(expect.objectContaining({html:'<h1>CANONICAL HTML</h1>'}),{title:'original'})});
const notices:OutputIssue[]=[{nodeId:'line-3',adaptation:'static',message:'Formula image'}];
it('holds the same artifact through one confirmation and ignores later edits',async()=>{
 const {ports,service}=setup(),source=input('docx'),artifact=htmlArtifact('<p>FROZEN</p>',source.document);vi.mocked(ports.prepare).mockResolvedValue(artifact);vi.mocked(ports.inspectDocx).mockReturnValue(notices);let accept=(value:boolean)=>{void value};
 const review={confirmDocx:vi.fn(()=>new Promise<boolean>(resolve=>{accept=resolve}))},running=service.run(source,review);await Promise.resolve();expect(review.confirmDocx).toHaveBeenCalledOnce();expect(service.busy).toBe(true);source.document.markdown='later';source.fileName='later';expect(ports.generateDocx).not.toHaveBeenCalled();expect(await service.run(input())).toEqual({status:'busy'});accept(true);await running;
 expect(ports.prepare).toHaveBeenCalledOnce();expect(ports.generateDocx).toHaveBeenCalledExactlyOnceWith(artifact,{allowSourceFallback:true});expect(ports.download).toHaveBeenCalledWith(expect.any(Blob),'original.docx');
});
it('declining or omitting confirmation never delivers fallback output',async()=>{for(const confirm of [undefined,async()=>false]){const {ports,service}=setup();vi.mocked(ports.inspectDocx).mockReturnValue(notices);expect(await service.run(input('docx'),confirm?{confirmDocx:confirm}:undefined)).toMatchObject({status:'cancelled'});expect(ports.generateDocx).not.toHaveBeenCalled();expect(ports.download).not.toHaveBeenCalled();expect(service.busy).toBe(false)}});
it('blocks unsupported HTML independently from consent',async()=>{const {ports,service}=setup(),confirmDocx=vi.fn(async()=>true);vi.mocked(ports.inspectDocx).mockReturnValue([{nodeId:'line-1',adaptation:'unsupported',message:'raw MathML'}]);expect(await service.run(input('docx'),{confirmDocx})).toMatchObject({status:'blocked'});expect(confirmDocx).not.toHaveBeenCalled();expect(ports.generateDocx).not.toHaveBeenCalled();expect(service.busy).toBe(false)});
it('releases busy when the confirmation callback fails',async()=>{const {ports,service}=setup();vi.mocked(ports.inspectDocx).mockReturnValue(notices);await expect(service.run(input('docx'),{confirmDocx:async()=>{throw new Error('review failed')}})).rejects.toThrow('review failed');expect(service.busy).toBe(false);expect(ports.download).not.toHaveBeenCalled()});

it('holds the single accepted PDF operation through asynchronous platform handoff',async()=>{
 const {ports,service}=setup(),source=input('print-pdf');let release=()=>{};vi.mocked(ports.deliverPdf).mockReturnValue(new Promise<void>(resolve=>{release=resolve}));
 const running=service.run(source);for(let i=0;i<8;i++)await Promise.resolve();expect(ports.deliverPdf).toHaveBeenCalledExactlyOnceWith('<html>frozen</html>');expect(service.busy).toBe(true);expect(await service.run(input())).toEqual({status:'busy'});
 source.document.markdown='later';source.document.revision=8;source.fileName='later';expect(ports.prepare).toHaveBeenCalledOnce();expect(ports.generatePdfHtml).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({html:'<h1>CANONICAL HTML</h1>'}),{title:'original'});expect(ports.download).not.toHaveBeenCalled();
 release();expect(await running).toMatchObject({status:'completed',documentId:'A',revision:1});expect(service.busy).toBe(false);
});
it('releases busy on asynchronous PDF handoff failure without a silent retry or download',async()=>{
 const {ports,service}=setup();let fail=(error:Error)=>{void error};vi.mocked(ports.deliverPdf).mockReturnValue(new Promise<void>((_resolve,reject)=>{fail=reject}));const running=service.run(input('print-pdf'));
 for(let i=0;i<8;i++)await Promise.resolve();expect(service.busy).toBe(true);const rejected=expect(running).rejects.toThrow('native handoff failed');fail(new Error('native handoff failed'));await rejected;
 expect(service.busy).toBe(false);expect(ports.deliverPdf).toHaveBeenCalledOnce();expect(ports.download).not.toHaveBeenCalled();await service.run(input('markdown'));expect(ports.download).toHaveBeenCalledOnce();
});
