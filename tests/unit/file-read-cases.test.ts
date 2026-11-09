import {it,expect} from 'vitest';
import contract from '../../docs/contracts/file-read.json';
import {readSourceFile} from '../../src/core/platform/web/sourceImport';
import {FileFailure} from '../../src/core/platform/fileFailure';

/**
 * **同一批字节 ⇒ 同一个标识** ✓。
 *
 * **样本是两端共用的那一份** ✓（`docs/contracts/file-read.json` ✓）
 * ⇒ ⇒ 浏览器侧在这里断言 ✓ ⇒ ⇒ 原生侧在同一个文件上断言 ✓（`files.rs` ✓）
 * ⇒ ⇒ 两端对同一批字节给出不同的结果时 ⇒ ⇒ **两边各有一条红** ✓ ⇒ ⇒ 漂移无处藏 ✓。
 *
 * **应用只认标识、不问来源** ✓ ⇒ ⇒ 这里断言的就是那个标识 ✓（§9 ✓）。
 */

interface ReadCase{
 id:string;
 bytes:string;
 expect:{kind:'text';text:string}|{kind:'code';code:string};
}
const cases=(contract as {cases:ReadCase[]}).cases;
const bytesOf=(hex:string)=>Uint8Array.from(hex.match(/../g)??[],pair=>parseInt(pair,16));

it('gives the same result as the native side for the same bytes',async()=>{
 expect(cases.length).toBeGreaterThan(0);
 for(const testCase of cases){
  const file=new File([bytesOf(testCase.bytes)],'sample.md');
  if(testCase.expect.kind==='text'){
   // **文本就是同一段文本** ✓ ⇒ ⇒ 两端剥 BOM 的方式不同也不怕 ✓。
   expect(await readSourceFile(file),testCase.id).toBe(testCase.expect.text);
  }else{
   // **出错就是同一个机器码** ✓ ⇒ ⇒ 应用只按它分流 ✓ ⇒ ⇒ 不问哪一端报的 ✓。
   const error=await readSourceFile(file).catch(failure=>failure);
   expect(error,testCase.id).toBeInstanceOf(FileFailure);
   expect((error as FileFailure).code,testCase.id).toBe(testCase.expect.code);
  }
 }
});
