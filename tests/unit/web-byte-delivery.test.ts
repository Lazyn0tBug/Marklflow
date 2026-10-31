import {it,expect,vi,afterEach,type Mock} from 'vitest';
import {selectWebSave} from '../../src/core/platform/web/byteDelivery';
import {exportFile} from '../../src/application/exports/exportFile';
const file=exportFile('中文.html','reading-html');
function setup(read?:()=>Promise<unknown>){
 const stream={write:vi.fn(async(_blob:Blob)=>{}),close:vi.fn(async()=>{}),abort:vi.fn(async()=>{})};
 const handle:{createWritable:Mock<()=>Promise<typeof stream>>;getFile?:Mock<()=>Promise<unknown>>}={createWritable:vi.fn(async()=>stream)};
 if(read)handle.getFile=vi.fn(read);
 const picker=vi.fn(async()=>handle);
 vi.stubGlobal('isSecureContext',true);vi.stubGlobal('navigator',{userActivation:{isActive:true}});vi.stubGlobal('showSaveFilePicker',picker);return {stream,handle,picker};
}
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals()});
it('calls the picker immediately but opens no stream until bytes are ready',async()=>{
 const {picker,handle,stream}=setup(),pending=selectWebSave(file);expect(picker).toHaveBeenCalledExactlyOnceWith({suggestedName:'中文.html',types:[{description:'.html 文件',accept:{'text/html':['.html']}}]});expect(handle.createWritable).not.toHaveBeenCalled();
 const target=await pending,blob=new Blob(['CONTENT']);expect(await target!.save(blob)).toBe('saved');expect(stream.write).toHaveBeenCalledExactlyOnceWith(blob);expect(stream.close).toHaveBeenCalledOnce();expect(stream.abort).not.toHaveBeenCalled();
});
it('does not resolve saved before close has completed',async()=>{
 const {stream}=setup();let commit=()=>{};stream.close.mockReturnValue(new Promise<void>(resolve=>{commit=resolve}));const target=await selectWebSave(file);let done=false;const saving=target!.save(new Blob()).then(value=>{done=true;return value});for(let i=0;i<5;i++)await Promise.resolve();expect(done).toBe(false);commit();expect(await saving).toBe('saved');
});
it('returns observable picker cancellation without opening a file',async()=>{
 const {picker,handle}=setup();picker.mockRejectedValue(new DOMException('cancel','AbortError'));expect(await selectWebSave(file)).toBeUndefined();expect(handle.createWritable).not.toHaveBeenCalled();
});
it('reports permission and malformed-handle errors rather than downloading',async()=>{
 const {picker}=setup();picker.mockRejectedValueOnce(new DOMException('denied','SecurityError'));await expect(selectWebSave(file)).rejects.toThrow('denied');vi.stubGlobal('showSaveFilePicker',async()=>null);await expect(selectWebSave(file)).rejects.toThrow('保存文件 接口不可用');
});
it('aborts write and close failures while preserving the original error',async()=>{
 for(const phase of ['write','close'] as const){const {stream}=setup(),failure=new Error(phase);stream[phase].mockRejectedValue(failure);stream.abort.mockRejectedValue(new Error('abort failed'));const target=await selectWebSave(file);await expect(target!.save(new Blob())).rejects.toBe(failure);expect(stream.abort).toHaveBeenCalledOnce();if(phase==='write')expect(stream.close).not.toHaveBeenCalled();}
});
it('rejects createWritable failure without attempting a download',async()=>{
 const {handle}=setup();handle.createWritable.mockRejectedValue(new Error('open denied'));const target=await selectWebSave(file);await expect(target!.save(new Blob())).rejects.toThrow('open denied');
});
it('uses download when insecure, unsupported or without activation and cleans URL/anchor even on failure',async()=>{
 for(const condition of ['http','missing','inactive']){
  const {picker}=setup();if(condition==='http')vi.stubGlobal('isSecureContext',false);if(condition==='missing')vi.stubGlobal('showSaveFilePicker',undefined);if(condition==='inactive')vi.stubGlobal('navigator',{userActivation:{isActive:false}});
  const create=vi.fn(()=> 'blob:test'),revoke=vi.fn();vi.stubGlobal('URL',{createObjectURL:create,revokeObjectURL:revoke});const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(function(this:HTMLAnchorElement){expect(this.download).toBe('中文.html')});
  // A browser without the capability and a browser that refuses a picker outside a gesture are different outcomes.
  const expected=condition==='inactive'?'activation-expired':'download-started';
  const target=await selectWebSave(file);expect(await target!.save(new Blob())).toBe(expected);expect(picker).not.toHaveBeenCalled();expect(revoke).toHaveBeenCalledWith('blob:test');expect(document.querySelector('a[download]')).toBeNull();
  click.mockImplementation(()=>{throw new Error('download failed')});await expect(target!.save(new Blob())).rejects.toThrow('download failed');expect(revoke).toHaveBeenCalledTimes(2);expect(document.querySelector('a[download]')).toBeNull();click.mockRestore();
 }
});
it('confirms the written file before it reports the chosen location as saved',async()=>{
 const {handle}=setup(async()=>({size:7}));
 const target=await selectWebSave(file);
 expect(await target!.save(new Blob(['CONTENT']))).toBe('saved');
 expect(handle.getFile).toHaveBeenCalledOnce();
});
it('hands the bytes to the browser when the chosen path holds no file',async()=>{
 const {handle}=setup(async()=>{throw new DOMException('missing','NotFoundError')});
 const create=vi.fn(()=>'blob:test'),revoke=vi.fn();vi.stubGlobal('URL',{createObjectURL:create,revokeObjectURL:revoke});
 const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(function(this:HTMLAnchorElement){expect(this.download).toBe('中文.html')});
 const target=await selectWebSave(file);
 expect(await target!.save(new Blob(['CONTENT']))).toBe('recovered-download');
 expect(click).toHaveBeenCalledOnce();
 expect(handle.getFile!.mock.calls.length).toBeGreaterThan(1);
 click.mockRestore();
});
it('waits for a late commit before it declares the write lost',async()=>{
 let calls=0;
 const {handle}=setup(async()=>({size:++calls<2?0:7}));
 const target=await selectWebSave(file);
 expect(await target!.save(new Blob(['CONTENT']))).toBe('saved');
});
