const output=document.querySelector<HTMLElement>('[data-worker-state]');
if(!output)throw new Error('Missing worker test output');
const worker=new Worker(new URL('./pure-worker.ts',import.meta.url),{type:'module'});
const stop=()=>{clearTimeout(timer);worker.terminate()};
const fail=(message:string)=>{output.dataset.workerState='error';output.textContent=message;stop()};
const timer=setTimeout(()=>fail('Worker startup timeout'),20000);
worker.onerror=event=>fail(event.message);
worker.onmessage=(event:MessageEvent<unknown>)=>{try{output.textContent=JSON.stringify(event.data);output.dataset.workerState='ready'}finally{stop()}};
