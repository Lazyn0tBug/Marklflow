/**
 * 静默 PDF 探针页客户端：报告调用方身份与受保护命令的实际结果。
 *
 * 两条通道：
 * - **DOM 报告**（`[data-probe-report]`）：最终结论，由 Rust 读入并记成 `page_report_observed`；
 * - **DOM 步骤日志**（`[data-probe-steps]`）与 `log_event` 回传：页面侧叙事逐步留痕。
 *
 * 回传载荷是**最小事件结构**：事件名、关联 ID、命令枚举、结果枚举、错误类别、字节数。
 * 自由正文、堆栈、路径、URL 与 key 都不回传；未知字段与未知事件由原生侧拒收。
 * 回传只表示"已校验并入队或已丢弃"，不表示已落盘；失败不重试，只保留最后一份状态。
 */
declare global{
 interface Window{
  __TAURI_INTERNALS__?:{invoke:(command:string,args?:Record<string,unknown>)=>Promise<unknown>};
 }
}

type WebEventKind='page_ready'|'call_started'|'call_finished'|'page_error';
type WebCommand='get_platform_info'|'select_native_open'|'select_native_save'|'read_native_text'|'write_native_bytes'|'release_native_file';
type WebResult='ok'|'denied'|'error'|'cancelled';
type WebErrorCategory='no_tauri_internals'|'invoke_rejected'|'invalid_payload'|'rate_limited'|'timeout'|'unknown';

interface Outcome{ok:boolean;value?:unknown;error?:string}
interface PageEvent{event:WebEventKind;call_id?:string;command?:WebCommand;result?:WebResult;error_category?:WebErrorCategory;bytes?:number}

const params=new URLSearchParams(location.search);
const readKey=params.get('readKey')??'';
const writeKey=params.get('writeKey')??'';
const expected=params.get('expect')??'';
// 元素缺失不应让探针脚本死掉：报告与步骤日志都是可选的观察面。
const output=document.querySelector<HTMLPreElement>('[data-probe-report]');
const stepsOutput=document.querySelector<HTMLPreElement>('[data-probe-steps]');
const report:Record<string,unknown>={};
const steps:string[]=[];
let role='unknown';
/** 回传的最后状态：accepted／dropped／rejected。失败不重试，只留这一份。 */
let lastLogStatus='not-sent';
const publish=()=>{
 if(output)output.textContent=JSON.stringify(report);
 if(stepsOutput)stepsOutput.textContent=steps.join('\n');
};

async function call(command:string,args?:Record<string,unknown>):Promise<Outcome>{
 const internals=window.__TAURI_INTERNALS__;
 if(!internals)return {ok:false,error:'no-tauri-internals'};
 try{return {ok:true,value:await internals.invoke(command,args)}}
 catch(error){return {ok:false,error:String(error)}}
}

/** DOM 步骤日志的条数上限：页面侧叙事有界，不无限增长。 */
const MAX_STEPS=64;

/** 把一步记进 DOM 步骤日志（页面侧叙事），并经 log_event 回传。 */
async function step(event:WebEventKind,detail:{call_id?:string;command?:WebCommand;result?:WebResult;error_category?:WebErrorCategory;bytes?:number}):Promise<void>{
 const payload:PageEvent={event,...detail};
 steps.push(JSON.stringify(payload));
 if(steps.length>MAX_STEPS)steps.splice(0,steps.length-MAX_STEPS);
 publish();
 const outcome=await call('log_event',{payload:JSON.stringify(payload)});
 lastLogStatus=outcome.ok?String(outcome.value??'rejected'):'rejected';
}

/** 每次探针请求一个唯一 ID：只用于关联，不是身份也不是权限。 */
function newCallId():string{
 return typeof crypto.randomUUID==='function'?crypto.randomUUID():`call-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** 命令的结果归类：拒绝（共享稳定码）与其它错误分开。 */
function resultOf(outcome:Outcome):{result:WebResult;error_category?:WebErrorCategory}{
 if(outcome.ok)return {result:'ok'};
 const error=outcome.error??'';
 if(error.includes('native-source-denied'))return {result:'denied',error_category:'invoke_rejected'};
 if(error.includes('no-tauri-internals'))return {result:'error',error_category:'no_tauri_internals'};
 return {result:'error',error_category:'unknown'};
}

async function main():Promise<void>{
 await step('page_ready',{});
 const identityCall=newCallId();
 await step('call_started',{call_id:identityCall,command:'get_platform_info'});
 const identity=await call('get_platform_info');
 report.identity=identity;
 const info=identity.value as {windowLabel?:string;webviewLabel?:string}|undefined;
 role=info?.windowLabel==='main'?'main-window':'output-host';
 report.role=role;
 await step('call_finished',{call_id:identityCall,command:'get_platform_info',...resultOf(identity)});
 // 受控读取：读角色 key 读到夹具原文；写角色 key 必须被角色校验拒绝。
 const readCall=newCallId();
 await step('call_started',{call_id:readCall,command:'read_native_text'});
 const read=await call('read_native_text',{key:readKey});
 report.read=read;
 report.readMatchesFixture=read.ok===true&&read.value===expected;
 await step('call_finished',{call_id:readCall,command:'read_native_text',bytes:typeof read.value==='string'?read.value.length:0,...resultOf(read)});
 const wrongRoleCall=newCallId();
 await step('call_started',{call_id:wrongRoleCall,command:'read_native_text'});
 const wrongRole=await call('read_native_text',{key:writeKey});
 report.readWithWriteRole=wrongRole;
 await step('call_finished',{call_id:wrongRoleCall,command:'read_native_text',...resultOf(wrongRole)});
 if(role==='main-window'){
  // 主窗口在允许范围内：撤销授权应成功（正常业务清理未被一并移除）。
  const releaseCall=newCallId();
  await step('call_started',{call_id:releaseCall,command:'release_native_file'});
  report.releaseRead=await call('release_native_file',{key:readKey});
  await step('call_finished',{call_id:releaseCall,command:'release_native_file',...resultOf(report.releaseRead as Outcome)});
  const releaseWriteCall=newCallId();
  await step('call_started',{call_id:releaseWriteCall,command:'release_native_file'});
  report.releaseWrite=await call('release_native_file',{key:writeKey});
  await step('call_finished',{call_id:releaseWriteCall,command:'release_native_file',...resultOf(report.releaseWrite as Outcome)});
 }else{
  // 输出宿主不在允许范围内：选择器必须被拒且不弹框；撤销也必须被拒（防越权撤销）。
  const selectCall=newCallId();
  await step('call_started',{call_id:selectCall,command:'select_native_open'});
  report.select=await call('select_native_open');
  await step('call_finished',{call_id:selectCall,command:'select_native_open',...resultOf(report.select as Outcome)});
  const releaseAttemptCall=newCallId();
  await step('call_started',{call_id:releaseAttemptCall,command:'release_native_file'});
  report.releaseAttempt=await call('release_native_file',{key:readKey});
  await step('call_finished',{call_id:releaseAttemptCall,command:'release_native_file',...resultOf(report.releaseAttempt as Outcome)});
 }
 report.logStatus=lastLogStatus;
 report.done=true;
 publish();
}

void main().catch(error=>{report.error=String(error);report.done=true;publish()});

export {};
