// @vitest-environment node
import {it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {markdownSha256,createPreviewSubmission,previewSubmissionSchema,samePreviewCacheKey,RenderConfigVersion} from '../../src/application/tasks/previewIdentity';
import {sameIdentity} from '../../src/application/tasks/contracts';
import {request} from './task-fixtures';
it('hashes exact UTF-8 Markdown including CRLF, CJK, emoji and chunk boundaries',()=>{
 for(const text of ['', '# 中文 🧪\r\nbody', '# 中文 🧪\nbody','\ufeff# BOM','x'.repeat(65537)])expect(markdownSha256(text)).toBe(createHash('sha256').update(text,'utf8').digest('hex'));
 expect(markdownSha256('a\r\nb')).not.toBe(markdownSha256('a\nb'));
});
it('reuses cache keys across revisions, task ids, roles and activation while preserving run ticket protection',()=>{
 const first=createPreviewSubmission(request('first'), 'foreground',1),secondRequest=request('second','A','preview.flow',2);secondRequest.identity.activationEpoch=2;
 const second=createPreviewSubmission(secondRequest,'background',1);expect(samePreviewCacheKey(first.cacheKey,second.cacheKey)).toBe(true);expect(sameIdentity(first.request.identity,second.request.identity)).toBe(false);
});
it('invalidates changed Markdown/configuration and partitions document/preview kind',()=>{
 const first=createPreviewSubmission(request(),'foreground',1);const changed=request();changed.document.markdown='changed';
 for(const next of [createPreviewSubmission(changed,'foreground',1),createPreviewSubmission(request(),'foreground',2),createPreviewSubmission(request('other','B'),'background',1),createPreviewSubmission(request('a4','A','preview.a4'),'foreground',1)])expect(samePreviewCacheKey(first.cacheKey,next.cacheKey)).toBe(false);
});
it('rejects unknown envelopes, forged hashes, export kinds and weakened old identities',()=>{
 const valid=createPreviewSubmission(request(),'foreground',1);
 for(const value of [{...valid,schemaVersion:3},{...valid,role:'parallel'},{...valid,cacheKey:{...valid.cacheKey,mdHash:'0'.repeat(64)}},{...valid,cacheKey:{...valid.cacheKey,renderConfigVersion:0}},{...valid,request:{...valid.request,identity:{...valid.request.identity,executorId:'unexpected'}}}])expect(previewSubmissionSchema.safeParse(value).success).toBe(false);
 expect(()=>createPreviewSubmission(request('export','A','export.html'),'background',1)).toThrow();
});
it('advances a single config version only for semantic JSON configuration changes',()=>{
 const input={theme:'white',layout:{width:1024}};const config=new RenderConfigVersion(input);input.theme='external mutation';
 expect(config.update({layout:{width:1024},theme:'white'})).toBe(1);expect(config.update({theme:'dark',layout:{width:1024}})).toBe(2);expect(config.update({theme:'white',layout:{width:1024}})).toBe(3);
 expect(()=>config.update({width:NaN})).toThrow();expect(config.value).toBe(3);expect(()=>config.update({plugin:()=>{}})).toThrow();
 const exhausted=new RenderConfigVersion({},Number.MAX_SAFE_INTEGER);expect(()=>exhausted.update({width:1})).toThrow('exhausted');expect(exhausted.update({})).toBe(Number.MAX_SAFE_INTEGER);
});
it('owns request snapshots and rejects the wrong cache schema',()=>{const input=request();const submission=createPreviewSubmission(input,'background',1);input.document.markdown='after';expect(submission.request.document.markdown).toBe('# Test');expect(()=>samePreviewCacheKey(submission.cacheKey,{...submission.cacheKey,schemaVersion:2})).toThrow()});
