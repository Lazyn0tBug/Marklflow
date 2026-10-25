import {SharedDom} from '../../../src/application/tasks/sharedDom';
import {RoleTaskScheduler} from '../../../src/application/tasks/roleScheduler';
import {IdentityGate} from '../../../src/application/tasks/identity';
import {MarkdownWorkerAdapter} from '../../../src/core/platform/web/markdownWorkerAdapter';
import {request,previewRequest} from '../../unit/task-fixtures';
const output=document.querySelector('[data-state]');
const clock={now:()=>performance.now(),schedule:(ms:number,callback:()=>void)=>{const timer=setTimeout(callback,ms);return()=>clearTimeout(timer)}};
const dom=new SharedDom(clock),gate=new IdentityGate(),adapter=new MarkdownWorkerAdapter();gate.open('A');gate.activate('A');
const order:string[]=[];let release=()=>{};let preparations=0;let committed=0;
const scheduler=new RoleTaskScheduler(gate,clock,()=>undefined,{generated:()=>{committed++;return 'completed'},prepareDom:async(_claim,value,signal)=>{preparations++;return dom.step('foreground','engine',signal,async({resources})=>{
 const host=document.createElement('article');host.textContent=value.content;document.body.append(host);resources.register('probe-host','host',0,()=>{host.remove()});order.push('foreground');return value;
})}});
async function waitFor(test:()=>boolean){const until=performance.now()+15000;while(!test()){if(performance.now()>until)throw new Error('Probe timed out');await new Promise(resolve=>setTimeout(resolve,5))}}
void(async()=>{try{
 const background=dom.step('background','engine',new AbortController().signal,()=>new Promise<void>(resolve=>{order.push('background');release=resolve}));
 scheduler.install('foreground',adapter);const first=scheduler.enqueuePreview(previewRequest(request('intent','A'),'foreground'));
 if(first.status!=='accepted')throw new Error('Admission failed');await waitFor(()=>preparations===1);
 const waitingHeld=scheduler.snapshot().queue.active.some(item=>item.id===first.taskId);
 const second=scheduler.enqueuePreview(previewRequest(request('next','A','preview.flow',2),'foreground'));
 const startsWhileWaiting=preparations;
 const exported=dom.step('export','engine',new AbortController().signal,()=>{order.push('export')});
 release();await background;await exported;
 if(second.status!=='accepted')throw new Error('Second admission failed');await waitFor(()=>scheduler.status(second.taskId)?.state==='completed');
 if(!output)throw new Error('Missing output');output.textContent=JSON.stringify({order,waitingHeld,startsWhileWaiting,preparations,committed,first:scheduler.status(first.taskId)?.state,hosts:document.querySelectorAll('article').length,active:scheduler.snapshot().queue.active.length,secure:isSecureContext});output.setAttribute('data-state','ready');
 }catch(error){if(output){output.textContent=String(error);output.setAttribute('data-state','error')}}finally{scheduler.cancelAll();adapter.dispose()}})();
