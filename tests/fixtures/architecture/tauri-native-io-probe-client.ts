import {readTauriPlatformInfo} from '../../../src/core/platform/tauri/runtime';
import {readNativeText,releaseNativeFile,selectNativeOpen,selectNativeSave} from '../../../src/core/platform/tauri/files';
import {CANCELLED_NOTE,classifyError,describeSelection,previewText,type StepOutcome} from './tauri-native-io-probe-report';

/**
 * The platform interface fixture for M3: it drives the native file commands inside the desktop
 * webview so the system dialogs, the commit and the release can be observed on a real machine.
 * It changes no application behaviour and binds no document.
 */
const output=document.querySelector<HTMLPreElement>('[data-state]')!;
const report:Record<string,StepOutcome>={};
const show=(step:string,outcome:StepOutcome)=>{report[step]=outcome;output.textContent=JSON.stringify(report,null,2)};

async function step(name:string,run:()=>Promise<StepOutcome>){
 try{show(name,await run())}catch(error){show(name,{step:name,...classifyError(error)})}
}

async function environment(){
 const info=await readTauriPlatformInfo();
 return {step:'环境',status:'ok' as const,message:info?'桌面外壳可用':'不在桌面外壳中',data:info??null};
}

async function chooseToOpen(){
 const files=await selectNativeOpen();
 if(!files)return {step:'选择打开',status:'cancelled' as const,message:CANCELLED_NOTE};
 return {step:'选择打开',status:'ok' as const,message:'已选择 '+files.length+' 个文件',data:describeSelection(files),keys:files.map(file=>file.key.slice(0,8))};
}

async function readSelected(){
 const files=await selectNativeOpen();
 if(!files)return {step:'读取',status:'cancelled' as const,message:CANCELLED_NOTE};
 const text=await readNativeText(files[0]!);
 return {step:'读取',status:'ok' as const,message:'已读取 '+files[0]!.name,data:previewText(text)};
}

async function chooseToSave(){
 const target=await selectNativeSave('m3-native-io-probe.txt');
 if(!target)return {step:'选择保存',status:'cancelled' as const,message:CANCELLED_NOTE};
 return {step:'选择保存',status:'ok' as const,message:'已选择保存目标'};
}

async function writeToSelected(){
 const target=await selectNativeSave('m3-native-io-probe.txt');
 if(!target)return {step:'写入',status:'cancelled' as const,message:CANCELLED_NOTE};
 try{
  const receipt=await target.save(new Blob(['M3 原生写入探针 '+new Date().toISOString()+'\n'],{type:'text/plain'}));
  return {step:'写入',status:'ok' as const,message:'写入完成',data:receipt};
 }finally{await target.release()}
}

async function releaseOpenKey(){
 const files=await selectNativeOpen();
 if(!files)return {step:'释放',status:'cancelled' as const,message:CANCELLED_NOTE};
 await releaseNativeFile(files[0]!.key);
 let afterRelease='释放后仍可读取（不符合预期）';
 try{await readNativeText(files[0]!)}catch(error){afterRelease='释放后读取被拒绝：'+String(error instanceof Error?error.message:error).slice(0,120)}
 return {step:'释放',status:'ok' as const,message:'已释放打开授权',data:{afterRelease}};
}

const buttons:Record<string,()=>Promise<StepOutcome>>={
 环境:environment,
 '选择打开':chooseToOpen,
 读取:readSelected,
 '选择保存':chooseToSave,
 写入:writeToSelected,
 释放:releaseOpenKey,
};

for(const [name,run] of Object.entries(buttons)){
 const button=document.querySelector<HTMLButtonElement>('button[data-step="'+name+'"]');
 button?.addEventListener('click',()=>{void step(name,run)});
}
show('状态',{step:'状态',status:'ok',message:'等待操作'});
