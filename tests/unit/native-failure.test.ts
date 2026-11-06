import {it,expect} from 'vitest';
import {nativeFailureMessage,NativeFileError} from '../../src/core/platform/tauri/files';

/**
 * The native side reports a stable machine code; the words the user reads are mapped here, so
 * that they read the same on every platform.
 */
it('maps the native codes to words and keeps the code on the error',()=>{
 expect(nativeFailureMessage('native-source-denied')).toBe('当前窗口无权使用原生文件能力');
 expect(nativeFailureMessage('native-target-missing')).toBe('文件已被移走或重命名');
 expect(nativeFailureMessage('native-permission-denied')).toBe('没有权限访问这个文件');
 // 认不出的码给一句通用的话，不猜它意味着什么。
 expect(nativeFailureMessage('native-something-new')).toBe('文件操作失败');
 const error=new NativeFileError('native-permission-denied');
 expect(error.code).toBe('native-permission-denied');
 expect(error.message).toBe('没有权限访问这个文件');
 expect(error instanceof Error).toBe(true);
});
