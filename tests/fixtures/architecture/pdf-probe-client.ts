/**
 * 静默 PDF 探针页客户端：报告调用方身份与受保护命令的实际结果。
 *
 * 报告写在 DOM 的 [data-probe-report] 里，由 Rust 侧读取；本页不经前端适配器，
 * 因此取到的是机器码（共享稳定拒绝码）而不是用户可见的友好提示。
 *
 * 两个载体跑同一份脚本，差别只有身份：
 * - 主窗口身份在允许范围内：受控读取应成功，选择器会真的弹框故不尝试，授权撤销应成功；
 * - 输出宿主身份不在允许范围内：读取、选择器、撤销都应被来源守卫拒绝，且不弹框。
 */
declare global{
 interface Window{
  __TAURI_INTERNALS__?:{invoke:(command:string,args?:Record<string,unknown>)=>Promise<unknown>};
 }
}

const params=new URLSearchParams(location.search);
const readKey=params.get('readKey')??'';
const writeKey=params.get('writeKey')??'';
const expected=params.get('expect')??'';
const output=document.querySelector<HTMLPreElement>('[data-probe-report]')!;
const report:Record<string,unknown>={};
const publish=()=>{output.textContent=JSON.stringify(report)};

async function call(command:string,args?:Record<string,unknown>):Promise<Record<string,unknown>>{
 const internals=window.__TAURI_INTERNALS__;
 if(!internals)return {ok:false,error:'no-tauri-internals'};
 try{return {ok:true,value:await internals.invoke(command,args)}}
 catch(error){return {ok:false,error:String(error)}}
}

async function main():Promise<void>{
 const identity=await call('get_platform_info');
 report.identity=identity;
 const info=identity.value as {windowLabel?:string;webviewLabel?:string}|undefined;
 report.role=info?.windowLabel==='main'?'main-window':'output-host';
 // 受控读取：读角色 key 读到夹具原文；写角色 key 必须被角色校验拒绝。
 const read=await call('read_native_text',{key:readKey});
 report.read=read;
 report.readMatchesFixture=read.ok===true&&read.value===expected;
 report.readWithWriteRole=await call('read_native_text',{key:writeKey});
 if(report.role==='main-window'){
  // 主窗口在允许范围内：撤销授权应成功（正常业务清理未被一并移除）。
  report.releaseRead=await call('release_native_file',{key:readKey});
  report.releaseWrite=await call('release_native_file',{key:writeKey});
 }else{
  // 输出宿主不在允许范围内：选择器必须被拒且不弹框；撤销也必须被拒（防越权撤销）。
  report.select=await call('select_native_open');
  report.releaseAttempt=await call('release_native_file',{key:readKey});
 }
 report.done=true;
 publish();
}

void main().catch(error=>{report.error=String(error);report.done=true;publish()});

export {};
