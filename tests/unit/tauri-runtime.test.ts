import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {readTauriPlatformInfo} from '../../src/core/platform/tauri/runtime';

const native=vi.hoisted(()=>({isTauri:vi.fn(),invoke:vi.fn()}));
vi.mock('@tauri-apps/api/core',()=>native);
beforeEach(()=>vi.resetAllMocks());
afterEach(()=>vi.unstubAllGlobals());

it('does not invoke a native command in the Web environment',async()=>{
 native.isTauri.mockReturnValue(false);
 expect(await readTauriPlatformInfo()).toBeUndefined();
 expect(native.invoke).not.toHaveBeenCalled();
});
it('validates the native platform response and returns an owned value',async()=>{
 native.isTauri.mockReturnValue(true);
 const value={os:'windows',arch:'x86_64',version:'0.9.1'};
 native.invoke.mockResolvedValue(value);
 const result=await readTauriPlatformInfo();
 expect(native.invoke).toHaveBeenCalledExactlyOnceWith('get_platform_info');
 expect(result).toEqual(value);expect(result).not.toBe(value);
});
it('rejects malformed or unexpected native platform fields',async()=>{
 native.isTauri.mockReturnValue(true);
 for(const value of [null,{os:'windows',arch:'',version:'0.9.1'},{os:'unknown',arch:'x86_64',version:'0.9.1'},{os:'windows',arch:'x86_64',version:'0.9.1',path:'private'}]){
  native.invoke.mockResolvedValue(value);
  await expect(readTauriPlatformInfo()).rejects.toThrow();
 }
});
it('keeps a native command failure observable instead of returning Web success',async()=>{
 native.isTauri.mockReturnValue(true);
 const failure=new Error('native bridge unavailable');native.invoke.mockRejectedValue(failure);
 await expect(readTauriPlatformInfo()).rejects.toBe(failure);
});
it('can be imported outside a browser without loading the native API',async()=>{
 vi.stubGlobal('window',undefined);
 expect(await readTauriPlatformInfo()).toBeUndefined();
 expect(native.isTauri).not.toHaveBeenCalled();expect(native.invoke).not.toHaveBeenCalled();
});
