import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {DEFAULT_THEME} from '../../src/core/model/document';
async function host(page:Page){await page.route('**/__review_storage__',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Storage review</title>'}));await page.goto('/__review_storage__')}
function goodDocument(){return {schemaVersion:1,id:'review-good',revision:1,markdown:'# FALLBACK_KEEP',meta:{title:'review',createdAt:'2026-10-25T00:00:00Z',updatedAt:'2026-10-25T00:00:00Z'},theme:DEFAULT_THEME,options:{syntaxProfile:'commonmark-gfm-v1',mathMode:'mathml'}}}
test('keeps existing fallback data visible when an empty IDB becomes available',async({page})=>{
 await host(page);await page.evaluate(doc=>localStorage.setItem('markflow_docs',JSON.stringify([doc])),goodDocument());
 await page.goto('/');await expect(page.locator('textarea')).toHaveValue('# FALLBACK_KEEP');await expect(page.getByRole('alert')).toContainText('保留原后端');
 await page.locator('textarea').fill('# FALLBACK_UPDATED');await expect(page.getByText('已保存',{exact:true})).toBeVisible();
 await page.reload();await expect(page.locator('textarea')).toHaveValue('# FALLBACK_UPDATED');
});
test('salvages a malformed IDB recovery entry without hiding other documents',async({page},info)=>{
 await host(page);await page.evaluate(async doc=>{await new Promise<void>((resolve,reject)=>{const req=indexedDB.open('markflow_db',1);req.onupgradeneeded=()=>{req.result.createObjectStore('documents',{keyPath:'id'});req.result.createObjectStore('metadata',{keyPath:'key'})};req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,tx=db.transaction(['documents','metadata'],'readwrite');tx.objectStore('documents').put(doc);tx.objectStore('metadata').put({key:'markflow-recovery:broken',original:'BROKEN_INDEX_VALUE'});tx.oncomplete=()=>{db.close();resolve()};tx.onabort=()=>reject(tx.error)}})},goodDocument());
 await page.goto('/');await expect(page.locator('textarea')).toHaveValue('# FALLBACK_KEEP');await expect(page.getByRole('button',{name:'下载恢复备份'})).toBeVisible();
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'下载恢复备份'}).click();const file=info.outputPath('salvaged-index.json');await(await download).saveAs(file);expect(await readFile(file,'utf8')).toContain('BROKEN_INDEX_VALUE');
});
test('reports a rejected create instead of an unhandled promise or false success',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>Object.defineProperty(globalThis,'indexedDB',{value:undefined,configurable:true}));await host(page);await page.evaluate(()=>localStorage.setItem('markflow_docs','broken root'));
 await page.goto('/');await expect(page.getByRole('button',{name:'新建独立文档'})).toBeVisible();await page.getByRole('button',{name:'新建独立文档'}).click();await expect(page.getByRole('alert')).toContainText('操作失败');
 expect(await page.evaluate(()=>localStorage.getItem('markflow_docs'))).toBe('broken root');expect(errors).toEqual([]);
});
test('keeps a session backup downloadable when IDB quarantine writes and index reads fail',async({page},info)=>{
 await host(page);await page.evaluate(async doc=>{await new Promise<void>((resolve,reject)=>{const req=indexedDB.open('markflow_db',1);req.onupgradeneeded=()=>{req.result.createObjectStore('documents',{keyPath:'id'});req.result.createObjectStore('metadata',{keyPath:'key'})};req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,tx=db.transaction('documents','readwrite');tx.objectStore('documents').put(doc);tx.objectStore('documents').put({id:'bad',schemaVersion:99,markdown:'SESSION_RECOVERY_KEEP'});tx.oncomplete=()=>{db.close();resolve()};tx.onabort=()=>reject(tx.error)}})},goodDocument());
 await page.addInitScript(()=>{
  const put=IDBObjectStore.prototype.put,getAll=IDBObjectStore.prototype.getAll;
  Object.defineProperty(IDBObjectStore.prototype,'put',{value:function(this:IDBObjectStore,...args:unknown[]):unknown{if(this.name==='metadata')throw new DOMException('full','QuotaExceededError');return Reflect.apply(put,this,args)}});
  Object.defineProperty(IDBObjectStore.prototype,'getAll',{value:function(this:IDBObjectStore,...args:unknown[]):unknown{if(this.name==='metadata')throw new DOMException('index unavailable','InvalidStateError');return Reflect.apply(getAll,this,args)}});
 });
 await page.goto('/');await expect(page.locator('textarea')).toHaveValue('# FALLBACK_KEEP');await expect(page.getByRole('alert')).toContainText('仅在本会话');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'下载恢复备份'}).click();const file=info.outputPath('session-backup.json');await(await download).saveAs(file);const raw=await readFile(file,'utf8');expect(raw).toContain('SESSION_RECOVERY_KEEP');expect(raw).toContain('session');
});
