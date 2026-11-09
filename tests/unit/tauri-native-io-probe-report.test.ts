// @vitest-environment node
import {it,expect} from 'vitest';
import {CANCELLED_NOTE,classifyError,describeSelection,previewText} from '../fixtures/architecture/tauri-native-io-probe-report';

/**
 * The M3 fixture reports what the native side did. Two distinctions matter: running outside the
 * desktop shell is not a native failure, and a closed dialog is not proof of a deliberate cancel.
 */
it('separates "not in the desktop shell" from a real failure',()=>{
 expect(classifyError(new Error('原生文件能力仅在桌面应用中可用')).status).toBe('unavailable');
 expect(classifyError(new Error('写入失败：目标被占用')).status).toBe('failed');
 expect(classifyError('普通字符串错误').status).toBe('failed');
});

it('keeps the machine code when the native side reports one',()=>{
 const error=Object.assign(new Error('没有权限访问这个文件'),{code:'native-permission-denied'});
 // 取证看机器码 ✓：文案是给人看的 ✓。
 expect(classifyError(error).message).toBe('native-permission-denied');
 expect(classifyError(error).status).toBe('failed');
});

it('says that a closed dialog cannot be told apart from a failed dialog',()=>{
 expect(CANCELLED_NOTE).toContain('无法区分');
});

it('describes what the picker returned without leaking the session key',()=>{
 const selection=describeSelection([{key:'0f3c2a1e-0000-4000-8000-000000000000',name:'sample.md',size:42,reference:'1f3c2a1e-0000-4000-8000-000000000000'}]);
 expect(selection).toEqual({count:1,files:[{name:'sample.md',size:42}]});
 expect(JSON.stringify(selection)).not.toContain('0f3c2a1e');
});

it('previews the text that was read',()=>{
 const preview=previewText('x'.repeat(500));
 expect(preview.length).toBe(500);
 expect(preview.head).toHaveLength(120);
});
