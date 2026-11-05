import {readRuntimePrefs} from './tauri/runtime';

/** 导出的根 ✓：浏览器打印对话框 ✓ ／ 原生静默路径 ✓。 */
export type ExportRoot='web'|'native';

export interface ExportRootChoice{
 /** 实际会走的根 ✓。 */
 root:ExportRoot;
 /** 原生静默 PDF 在这台机器上有没有 ✓（Windows 之外没有 ✓）。 */
 nativePdfAvailable:boolean;
 /** 配置选了原生而平台没有 ⇒ **明说** ✓（不是悄悄改走 Web ✓）。 */
 blockedReason?:string;
}

/**
 * 启动时定下走哪个根 ✓（计划里的「启动选择」✓）。
 *
 * **平台没有静默 PDF 而配置选了它 ⇒ 不回落** ✓：
 * 回落就是降级 ✓ —— 失败不许改投另一个根 ✓ ✓。
 * 这里把理由带回去 ✓，由界面明说 ✓ ✓。
 */
export async function resolveExportRoot():Promise<ExportRootChoice>{
 const prefs=await readRuntimePrefs();
 if(!prefs)return {root:'web',nativePdfAvailable:false};
 if(prefs.exportRoot==='native'&&!prefs.nativePdfAvailable){
  // **不改走 Web** ✓：配置选的是原生 ✓，平台没有静默 PDF ✓ ⇒ 明说 ✓ ✓。
  // 只有 PDF 那一步被挡住 ✓（字节格式的原生保存到处都有 ✓）。
  return {root:'native',nativePdfAvailable:false,blockedReason:'此平台不支持静默 PDF 打印（依赖 WebView2 的 PrintToPdf）'};
 }
 return {root:prefs.exportRoot,nativePdfAvailable:prefs.nativePdfAvailable};
}
