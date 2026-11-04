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
type WebCommand='get_platform_info'|'select_native_open'|'select_native_save'|'read_native_text'|'write_native_bytes'|'release_native_file'|'print_native_pdf';
type WebResult='ok'|'denied'|'error'|'cancelled';
type WebErrorCategory='no_tauri_internals'|'invoke_rejected'|'invalid_payload'|'rate_limited'|'timeout'|'unknown';

interface Outcome{ok:boolean;value?:unknown;error?:string}
/** 产品形态打印的结果：回执（saved／not-committed）或取消标记。 */
interface ProductPrintOutcome{ok:boolean;value?:unknown;error?:string}
interface PageEvent{event:WebEventKind;call_id?:string;command?:WebCommand;result?:WebResult;error_category?:WebErrorCategory;bytes?:number}

const params=new URLSearchParams(location.search);
const readKey=params.get('readKey')??'';
/** 产品形态的打印要不要做 ✓：默认不做 ✓（它要人参与保存对话框 ✓，
 *  会打断探针页其余步骤 ✓）；做的时候由探针用查询串打开 ✓。 */
const productPrintRequested=params.get('productPrint')==='1';
const writeKey=params.get('writeKey')??'';
const expected=params.get('expect')??'';
// 元素缺失不应让探针脚本死掉：报告与步骤日志都是可选的观察面。
const output=document.querySelector<HTMLPreElement>('[data-probe-report]');
const stepsOutput=document.querySelector<HTMLPreElement>('[data-probe-steps]');
const report:Record<string,unknown>={};
/** 产品形态打印的结果（'cancelled' 表示用户取消 ✓）。 */
let productPrint:ProductPrintOutcome={ok:false,error:'未执行'};
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

/**
 * 同一窗口里探针页只跑一次。
 *
 * 重载（dev server 热更新、手动刷新）会让页面再跑一遍，而受控授权在首轮读完后
 * 已撤销，第二遍只会留下一串 unknown-file-key 的噪声——交付宿主上就是这样多了两轮。
 *
 * 两道标记，作用不同，不能混用：
 * - `history.state` 带着**首轮报告**：重载后 DOM 是空的，靠它把报告放回去，
 *   原生侧才读得到有效证据（首轮跑完即写入，重载时原样恢复）；
 * - `window.name` 是窗口级的标记：页面被导航走又回来时不再重跑（此时原生侧早已读完）。
 */
const RAN_MARKER='mf-probe-ran';

/**
 * 产品形态的静默打印：选目标（原生保存对话框）→ 打印 → 提交。
 *
 * 走的是生产的两个命令 ✓（`select_native_save` 与 `print_native_pdf` ✓），
 * 但**不接生产 UI** ✓——这里只是验收驱动 ✓（D7 的边界 ✓）。
 * 打印的 HTML 取自归档的冻结样本 ✓（与 Web 路径印的是同一份文档 ✓）。
 */
async function printInProductShape():Promise<ProductPrintOutcome>{
 const sample=await fetch('/docs/acceptance/pdf-probe/frozen-sample.html').then(response=>response.text());
 // 两个命令各自记一步：原生侧也会记 source_decision，两边要能对上。
 const pickCall=newCallId();
 await step('call_started',{call_id:pickCall,command:'select_native_save'});
 const picked=await call('select_native_save',{name:'probe-product-shape.pdf'});
 await step('call_finished',{call_id:pickCall,command:'select_native_save',...resultOf(picked as Outcome)});
 // 用户取消：没有目标，什么都不该写。
 if(!picked.ok)return {ok:false,error:'选择目标失败'};
 const value=picked.value as {key?:string}|null|undefined;
 if(!value?.key)return {ok:false,error:'cancelled'};
 const printCall=newCallId();
 await step('call_started',{call_id:printCall,command:'print_native_pdf'});
 const saved=await call('print_native_pdf',{html:sample,key:value.key});
 // 回执只有两种：**提交成功才是 saved** ✓；其余（没提交、报错）都算没成 ✓。
 // 页面按回执归类，不按"调用有没有抛错"归类 ✓——两侧才说的是同一件事 ✓。
 const receipt=saved.ok&&saved.value==='saved'
  ?{result:'ok' as WebResult}
  :{result:'error' as WebResult,error_category:'unknown' as WebErrorCategory};
 await step('call_finished',{call_id:printCall,command:'print_native_pdf',...receipt});
 return saved.ok?{ok:true,value:saved.value}:{ok:false,error:saved.error??'打印失败'};
}

async function main():Promise<void>{
 const restored=(history.state as {report?:Record<string,unknown>}|null)?.report;
 if(restored){
  // 重载后的这一页：不发任何调用，只把首轮报告放回 DOM。
  Object.assign(report,restored);
  publish();
  return;
 }
 if(window.name===RAN_MARKER)return;
 window.name=RAN_MARKER;
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
 // 产品形态的打印（D7-1 的验收驱动）：用户在原生保存对话框里选目标 → 静默打印 → 提交。
 // 放在这一步而不是另开一页：探针跑完会把主窗口导回应用页，页面若被导航走，未完成的打印就夭折了。
 //
 // **只在主窗口做** ✓：输出宿主不在允许范围内 ✓，它去跑必然被来源守卫拒 ✓，
 // 报告里会留下"选择目标失败"——看着像产品打印失败了 ✓，其实是那个角色压根没权限 ✓，
 // 会误导读证据的人 ✓。这里明说"不适用"，不装作是失败 ✓。
 if(productPrintRequested){
  if(role==='main-window'){
   productPrint=await printInProductShape();
   report.productPrint=productPrint.error==='cancelled'?'cancelled':productPrint;
  }else{
   report.productPrint={ok:false,error:'本角色不执行产品打印'};
  }
 }
 report.logStatus=lastLogStatus;
 report.done=true;
 publish();
 // 报告存进历史状态：重载后 DOM 会清空，靠它把首轮报告放回去。
 history.replaceState({report},'');
}

void main().catch(error=>{report.error=String(error);report.done=true;publish()});

export {};
