import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {readNativeText,releaseNativeFile,selectNativeOpen,selectNativeSave} from '../../src/core/platform/tauri/files';

const native=vi.hoisted(()=>({isTauri:vi.fn(),invoke:vi.fn()}));
vi.mock('@tauri-apps/api/core',()=>native);
const selected={key:'123e4567-e89b-42d3-a456-426614174000',name:'文档.md',size:3};
beforeEach(()=>{vi.resetAllMocks();native.isTauri.mockReturnValue(true)});
afterEach(()=>vi.unstubAllGlobals());

it('maps only dialog null to no selection and preserves observable invocation failures',async()=>{
 native.invoke.mockResolvedValue(null);
 expect(await selectNativeOpen()).toBeUndefined();
 expect(await selectNativeSave('report.md')).toBeUndefined();
 const failure=new Error('native dialog failed');native.invoke.mockRejectedValue(failure);
 await expect(selectNativeOpen()).rejects.toBe(failure);
 await expect(selectNativeSave('report.md')).rejects.toBe(failure);
});
it('rejects native file operations outside Tauri',async()=>{
 native.isTauri.mockReturnValue(false);
 await expect(selectNativeOpen()).rejects.toThrow('原生文件能力');
 await expect(selectNativeSave('report.md')).rejects.toThrow('原生文件能力');
 expect(native.invoke).not.toHaveBeenCalled();
});
it('validates selected metadata strictly and preserves only opaque keys',async()=>{
 native.invoke.mockResolvedValue([selected]);
 expect(await selectNativeOpen()).toEqual([selected]);
 for(const value of [
  [{...selected,path:'C:/private'}],
  [{...selected,size:-1}],
  [{...selected,size:1.5}],
  [{...selected,key:'not-a-uuid'}],
  [{...selected,name:''}],
  {},
 ]){
  native.invoke.mockResolvedValue(value);
  await expect(selectNativeOpen()).rejects.toThrow();
 }
});
it('passes only the opaque key to read and release commands and validates read results',async()=>{
 native.invoke.mockResolvedValueOnce('text').mockResolvedValueOnce(undefined);
 expect(await readNativeText(selected)).toBe('text');
 await releaseNativeFile(selected.key);
 expect(native.invoke).toHaveBeenNthCalledWith(1,'read_native_text',{key:selected.key});
 expect(native.invoke).toHaveBeenNthCalledWith(2,'release_native_file',{key:selected.key});
 native.invoke.mockResolvedValue(42);
 await expect(readNativeText(selected)).rejects.toThrow();
});
it('selects a save target without writing until save, then reports saved only after native success',async()=>{
 native.invoke.mockResolvedValueOnce(selected).mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);
 const target=await selectNativeSave('report.md');
 expect(native.invoke).toHaveBeenCalledExactlyOnceWith('select_native_save',{name:'report.md'});
 const blob=new Blob(['hello']);
 expect(await target!.save(blob)).toBe('saved');
 expect(native.invoke).toHaveBeenNthCalledWith(2,'write_native_bytes',{key:selected.key,bytes:[104,101,108,108,111]});
 await target!.release();
 expect(native.invoke).toHaveBeenNthCalledWith(3,'release_native_file',{key:selected.key});
});
it('propagates write and release failures without reporting saved',async()=>{
 const writeFailure=new Error('disk write failed');
 native.invoke.mockResolvedValueOnce(selected).mockRejectedValueOnce(writeFailure);
 const target=await selectNativeSave('report.md');
 await expect(target!.save(new Blob(['x']))).rejects.toBe(writeFailure);
 const releaseFailure=new Error('release failed');native.invoke.mockRejectedValueOnce(releaseFailure);
 await expect(target!.release()).rejects.toBe(releaseFailure);
});
it('rejects oversized blobs before allocating their byte array',async()=>{
 native.invoke.mockResolvedValueOnce(selected);
 const target=await selectNativeSave('report.md');
 const blob={size:100*1024*1024+1,arrayBuffer:vi.fn()};
 await expect(target!.save(blob as unknown as Blob)).rejects.toThrow('100MiB');
 expect(blob.arrayBuffer).not.toHaveBeenCalled();
 expect(native.invoke).toHaveBeenCalledExactlyOnceWith('select_native_save',{name:'report.md'});
});
