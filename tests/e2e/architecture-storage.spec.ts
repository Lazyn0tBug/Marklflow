import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {DEFAULT_THEME} from '../../src/core/model/document';
test('keeps legacy IDB version and metadata while exposing untouched invalid records',async({page},info)=>{
 await page.route('**/__architecture-host__',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Storage fixture</title>'}));
 await page.goto('/__architecture-host__');
 const good={schemaVersion:1,id:'good',revision:1,markdown:'# GOOD_RECORD',meta:{title:'Good',createdAt:'2026-10-25T00:00:00Z',updatedAt:'2026-10-25T00:00:00Z'},theme:DEFAULT_THEME,options:{syntaxProfile:'commonmark-gfm-v1',mathMode:'mathml'}};
 await page.evaluate(async good=>{
  await new Promise<void>((resolve,reject)=>{const req=indexedDB.open('markflow_db',1);req.onupgradeneeded=()=>{req.result.createObjectStore('documents',{keyPath:'id'});req.result.createObjectStore('metadata',{keyPath:'key'})};req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,tx=db.transaction(['documents','metadata'],'readwrite');tx.objectStore('metadata').put({key:'legacy-meta',value:'KEEP_META'});tx.objectStore('documents').put(good);tx.objectStore('documents').put({id:'bad',schemaVersion:99,markdown:'KEEP_RAW'});tx.oncomplete=()=>{db.close();resolve()};tx.onabort=()=>reject(tx.error)}});
 },good);
 await page.goto('/');await expect(page.locator('textarea')).toHaveValue('# GOOD_RECORD');
 await expect(page.getByRole('alert')).toContainText('原始数据已保留');
 const event=page.waitForEvent('download');await page.getByRole('button',{name:'下载恢复备份'}).click();
 const file=info.outputPath('recovery.json');await(await event).saveAs(file);expect(await readFile(file,'utf8')).toContain('KEEP_RAW');
 const original=await page.evaluate(()=>new Promise<unknown>((resolve,reject)=>{const req=indexedDB.open('markflow_db',1);req.onsuccess=()=>{const db=req.result,tx=db.transaction('documents');const item=tx.objectStore('documents').get('bad');item.onsuccess=()=>resolve(item.result);tx.oncomplete=()=>db.close()};req.onerror=()=>reject(req.error)}));
 expect(original).toEqual({id:'bad',schemaVersion:99,markdown:'KEEP_RAW'});
 const metadata=await page.evaluate(()=>new Promise<unknown>((resolve,reject)=>{const req=indexedDB.open('markflow_db',1);req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,tx=db.transaction('metadata');const item=tx.objectStore('metadata').get('legacy-meta');item.onsuccess=()=>resolve({version:db.version,value:item.result});tx.oncomplete=()=>db.close()}}));
 expect(metadata).toEqual({version:1,value:{key:'legacy-meta',value:'KEEP_META'}});
});
test('corrupt fallback storage offers recovery without silently replacing original bytes',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(globalThis,'indexedDB',{value:undefined,configurable:true}));
 await page.route('**/__architecture-host__',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Storage fixture</title>'}));
 await page.goto('/__architecture-host__');await page.evaluate(()=>localStorage.setItem('markflow_docs','[{broken 🧪'));
 await page.goto('/');await expect(page.getByRole('alert')).toContainText('原始数据未覆盖');await expect(page.getByRole('button',{name:'下载恢复备份'})).toBeVisible();
 expect(await page.evaluate(()=>localStorage.getItem('markflow_docs'))).toBe('[{broken 🧪');await expect(page.locator('textarea')).toHaveCount(0);
});
