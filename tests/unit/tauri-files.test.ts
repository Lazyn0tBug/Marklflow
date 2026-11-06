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
it('maps a native machine code to a friendly message and keeps the code for evidence',async()=>{
 // 原生侧给的是结构化的机器码 ✓（§9）：拒绝不再靠子串匹配 ✓。
 native.invoke.mockRejectedValue({code:'native-source-denied'});
 const error=await selectNativeOpen().catch(failure=>failure);
 expect(String(error)).toContain('当前窗口无权使用原生文件能力');
 expect(String(error)).not.toContain('native-source-denied');
 // 机器码留在错误对象上 ✓：探针与诊断要它 ✓。
 expect((error as {code?:string}).code).toBe('native-source-denied');
});
it('tells the reasons apart: a file that moved is not a file that cannot be written',async()=>{
 native.invoke.mockRejectedValueOnce({code:'native-target-missing'});
 const missing=await selectNativeOpen().catch(failure=>failure);
 expect(String(missing)).toContain('已被移走');
 native.invoke.mockRejectedValueOnce({code:'native-permission-denied'});
 const denied=await selectNativeOpen().catch(failure=>failure);
 expect(String(denied)).toContain('没有权限');
 expect(String(denied)).not.toBe(String(missing));
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
