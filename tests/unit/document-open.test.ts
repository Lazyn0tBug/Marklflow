import {describe,expect,it} from 'vitest';
import {DocumentOpener} from '../../src/application/workspace/documentOpen';
import {DocumentFileContexts} from '../../src/application/workspace/documentFileContext';
import {createNewDocument} from '../../src/core/storage/storage';
import type {ImportFile} from '../../src/application/workspace/sourceImport';

/**
 * **打开与绑定是同一件事** ✓（设计 §4.3 ✓）。
 *
 * **规则在这里被盯住** ✓ ⇒ ⇒ 不必起浏览器、不必开桌面外壳 ✓。
 */

const file=(name:string,fileIdentity='f1'):ImportFile&{fileIdentity:string}=>({name,size:3,fileIdentity});

function setup(options:{sameVersion?:()=>Promise<boolean>}={}){
 const contexts=new DocumentFileContexts();
 const opened:string[]=[];
 const opener=new DocumentOpener<ImportFile&{fileIdentity:string}>(contexts,{
  open:async doc=>{opened.push(doc.id);return 'opened'},
  identity:input=>({fileIdentity:input.fileIdentity,key:'grant-'+input.fileIdentity,displayName:input.name,sourceFormat:'markdown'}),
  boundDocument:fileIdentity=>contexts.documentFor(fileIdentity),
  sameVersion:options.sameVersion??(async()=>true),
 });
 return {contexts,opener,opened};
}

describe('打开本地文件',()=>{
 it('binds the file to the document it opened',async()=>{
  const {contexts,opener,opened}=setup();
  const doc=createNewDocument('本地.md');
  expect(await opener.open(doc,file('本地.md'))).toBe('opened');
  expect(opened).toEqual([doc.id]);
  // **绑定就位** ✓ ⇒ ⇒ 身份与授权 key 都在 ✓ ⇒ ⇒ 刚打开不显示未同步 ✓。
  const context=contexts.read(doc.id);
  expect(context?.identity.fileIdentity).toBe('f1');
  expect(context?.identity.key).toBe('grant-f1');
  expect(context?.sync.lastSyncedRevision).toBe(doc.revision);
 });

 it('does not bind when the document was already there',async()=>{
  const {contexts}=setup();
  const other=createNewDocument('别的.md');
  const opener=new DocumentOpener<ImportFile&{fileIdentity:string}>(contexts,{
   open:async()=>'focused',
   identity:input=>({fileIdentity:input.fileIdentity,key:'grant-other',displayName:input.name,sourceFormat:'markdown'}),
   boundDocument:fileIdentity=>contexts.documentFor(fileIdentity),
   sameVersion:async()=>true,
  });
  expect(await opener.open(other,file('本地.md'))).toBe('focused');
  // **聚焦的那一条不建绑定** ✓ ⇒ ⇒ 那个文档没有上下文 ✓ ⇒ ⇒ 绑定只属于打开成功的那一次 ✓。
  expect(contexts.read(other.id)).toBeUndefined();
 });

 it('finds the bound document and says the file did not change',async()=>{
  const {contexts,opener}=setup();
  const doc=createNewDocument('本地.md');
  await opener.open(doc,file('本地.md'));
  // **命中既有绑定** ✓ ⇒ ⇒ 聚焦那个标签页 ✓ ⇒ ⇒ 不新建 ✓。
  expect(await opener.bound(file('本地.md'))).toEqual({documentId:doc.id,changed:false});
  // **没绑过的文件** ⇒ ⇒ 没有 ✓ ⇒ ⇒ 走正常打开 ✓。
  expect(await opener.bound(file('别的.md','f2'))).toBeUndefined();
 });

 it('says the file changed when the disk no longer holds that version',async()=>{
  const contexts=new DocumentFileContexts();
  const doc=createNewDocument('本地.md');
  const opener=new DocumentOpener<ImportFile&{fileIdentity:string}>(contexts,{
   open:async()=>'opened',
   identity:input=>({fileIdentity:input.fileIdentity,key:'grant-f1',displayName:input.name,sourceFormat:'markdown'}),
   boundDocument:fileIdentity=>contexts.documentFor(fileIdentity),
   sameVersion:async()=>false,
  });
  await opener.open(doc,file('本地.md'));
  // **磁盘变了** ⇒ ⇒ 交给用户决定 ✓ ⇒ ⇒ 不静默覆盖 ✓（M4-9 ✓）。
  expect(await opener.bound(file('本地.md'))).toEqual({documentId:doc.id,changed:true});
 });

 it('treats a question the native side cannot answer as changed',async()=>{
  const contexts=new DocumentFileContexts();
  const doc=createNewDocument('本地.md');
  const opener=new DocumentOpener<ImportFile&{fileIdentity:string}>(contexts,{
   open:async()=>'opened',
   identity:input=>({fileIdentity:input.fileIdentity,key:'grant-f1',displayName:input.name,sourceFormat:'markdown'}),
   boundDocument:fileIdentity=>contexts.documentFor(fileIdentity),
   // **答不了** ✓ ⇒ ⇒ 那是"无法证明" ✓ ⇒ ⇒ 按变了处理 ✓ ⇒ ⇒ 问用户 ✓（§2.3 ✓）。
   sameVersion:async()=>{throw new Error('native state unavailable')},
  });
  await opener.open(doc,file('本地.md'));
  expect(await opener.bound(file('本地.md'))).toEqual({documentId:doc.id,changed:true});
 });
});
