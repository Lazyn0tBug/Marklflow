import {MarkdownWorkerAdapter} from '../../../src/core/platform/web/markdownWorkerAdapter';
import {PreviewActivation} from '../../../src/application/workspace/previewActivation';
import {DocumentSessions} from '../../../src/application/sessions/documentSessions';
import {MemoryPreviewCache} from '../../../src/application/previewCache/memoryPreviewCache';
import {validateMarkdownWorkerArtifact} from '../../../src/application/workspace/markdownPreviewValidation';
import {createPreviewSubmission} from '../../../src/application/tasks/previewIdentity';
import {executorMessageSchema,type ExecutionIdentity} from '../../../src/application/tasks/contracts';
import {DEFAULT_THEME} from '../../../src/core/model/document';
const source='\ufeff# 标题 🧪 &copy;\r\n\r\n段落 $x^2$\r\n\r\n| A | B |\r\n| - | - |\r\n| 1 | 2 |\r\n\r\n```ts\r\nconst n=1;\r\n```';
const output=document.querySelector('[data-parse-state]');
const sessions=new DocumentSessions();sessions.open({schemaVersion:1,id:'probe',revision:1,markdown:source,meta:{title:'probe',createdAt:'2026-10-25',updatedAt:'2026-10-25'},theme:DEFAULT_THEME,options:{syntaxProfile:'commonmark-gfm-v1',mathMode:'mathml'}});
class CountingAdapter extends MarkdownWorkerAdapter {starts=0;override start(...args:Parameters<MarkdownWorkerAdapter['start']>){this.starts++;super.start(...args)}}
const adapter=new CountingAdapter(),cache=new MemoryPreviewCache(),activation=new PreviewActivation(sessions,{now:()=>performance.now(),schedule:(ms,callback)=>{const timer=setTimeout(callback,ms);return()=>clearTimeout(timer)}},()=>1,cache,validateMarkdownWorkerArtifact);
async function parse(){const admission=activation.activate('probe').foreground;if(admission?.status!=='accepted')throw new Error('Expected parse task');const until=performance.now()+15000;for(;;){const status=activation.scheduler.status(admission.taskId);if(status?.state==='failed')throw new Error(status.reason);if(status?.state==='completed')break;if(performance.now()>until)throw new Error('Parse task timed out');await new Promise(resolve=>setTimeout(resolve,10))}const ref=activation.currentPreviewReference();if(!ref)throw new Error('Missing display reference');const value=cache.resolve(ref);if(!value)throw new Error('Missing cached result');return {summary:JSON.parse(value.artifact.content) as unknown,sourceMap:value.artifact.sourceMap}}
async function rawErrorProbe(){
 const worker=new Worker(new URL('../../../src/workers/markdownWorker.ts',import.meta.url),{type:'module'});
 try{return await new Promise<unknown>((resolve,reject)=>{
  const submission=createPreviewSubmission({taskId:'raw-probe',document:sessions.read('probe').document,previewKind:'preview.flow',role:'foreground',renderConfigVersion:1});
  const execution:ExecutionIdentity={executorId:'raw-probe',executorGeneration:1,task:{protocolVersion:1,taskId:submission.taskId,documentId:'probe'}};
  const request={identity:execution.task,kind:'preview.flow',document:submission.document,cacheKey:submission.cacheKey};
  const timer=setTimeout(()=>reject(new Error('Input error response timed out')),10000);
  worker.onerror=event=>{clearTimeout(timer);reject(new Error(event.message))};
  worker.onmessage=(event:MessageEvent<unknown>)=>{const value=executorMessageSchema.safeParse(event.data);if(!value.success){clearTimeout(timer);reject(new Error('Malformed worker response'));return}if(value.data.type==='error'){clearTimeout(timer);resolve(value.data)}};
  worker.postMessage({protocolVersion:1,type:'start',execution,request:{...request,cacheKey:{...request.cacheKey,mdHash:'0'.repeat(64)}}});
 })}finally{worker.terminate()}
}
void (async()=>{try{
 activation.scheduler.install('foreground',adapter);const first=await parse();const hit=activation.activate('probe');const startsAfterHit=adapter.starts;
 sessions.update({...sessions.read('probe').document,revision:2,markdown:'# 第二次 🧪\r\n\r\n新段落'});const second=await parse();
 adapter.dispose();const error=await rawErrorProbe();if(!output)return;output.textContent=JSON.stringify({source,first,second,starts:adapter.starts,startsAfterHit,cacheHit:hit.foreground===undefined&&!!hit.cacheReference,error,secure:isSecureContext,uuid:typeof crypto.randomUUID,subtle:typeof crypto.subtle});output.setAttribute('data-parse-state','ready');
 }catch(error){adapter.dispose();if(output){output.textContent=String(error);output.setAttribute('data-parse-state','error')}}})();
