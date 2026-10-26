export function throwIfAborted(signal?:AbortSignal):void {if(signal?.aborted)throw new DOMException('已取消','AbortError')}
