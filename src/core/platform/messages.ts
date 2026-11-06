import {webMessagePort} from './web/messages';
import {tauriMessagePort} from './tauri/messages';
import {isDesktopRuntime} from './tauri/runtime';
import type {MessagePort} from '../../application/messages';

/**
 * 消息端口的组合点 ✓：桌面构建走原生日志 ✓，浏览器构建走控制台 ✓。
 * 与既有的平台端口同构 ✓（见 `exportRoot.ts` 的"启动选择" ✓）。
 */
export async function resolveMessagePort():Promise<MessagePort>{
 return (await isDesktopRuntime())?tauriMessagePort:webMessagePort;
}
