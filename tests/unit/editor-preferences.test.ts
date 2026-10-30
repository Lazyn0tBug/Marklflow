import {afterEach,expect,it,vi} from 'vitest';
import {readSoftWrapPreference,writeSoftWrapPreference} from '../../src/core/platform/web/editorPreferences';

afterEach(()=>{localStorage.clear();vi.restoreAllMocks()});

it('defaults to soft wrapping and accepts only the bounded v1 preference shape',()=>{
 expect(readSoftWrapPreference()).toBe(true);
 writeSoftWrapPreference(false);expect(readSoftWrapPreference()).toBe(false);
 localStorage.setItem('markflow_editor_preferences_v1',JSON.stringify({version:1,softWrap:true,extra:'ignored?'}));
 expect(readSoftWrapPreference()).toBe(true);
 localStorage.setItem('markflow_editor_preferences_v1','x'.repeat(257));expect(readSoftWrapPreference()).toBe(true);
 localStorage.setItem('markflow_editor_preferences_v1','{');expect(readSoftWrapPreference()).toBe(true);
});

it('keeps the active default when local storage is unavailable',()=>{
 vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new Error('blocked')});
 vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('blocked')});
 expect(readSoftWrapPreference()).toBe(true);expect(()=>writeSoftWrapPreference(false)).not.toThrow();
});
