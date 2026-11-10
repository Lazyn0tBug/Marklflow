import type {ByteSaveTarget} from '../../../application/exports/exportService';
import {reportFailure} from '../failures';
import type {ExportFile} from '../../../application/exports/exportFile';
import {apiObject, apiMethod, apiPromise} from '../externalApi';
function downloadBlob(blob: Blob, name: string): void {
  const link = document.createElement('a'),
    url = URL.createObjectURL(blob);
  try {
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
}
/**
 * A resolved close() is not proof that the bytes reached the chosen path: the stream can commit while the
 * target still holds an older or empty file. The receipt is therefore read back from the file itself.
 */
type WriteState = 'confirmed' | 'lost' | 'unknown';
const VERIFY_ATTEMPTS = 3,
  VERIFY_DELAY = 120;
function isMissingFile(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'name' in error && error.name === 'NotFoundError';
}
function fileSize(value: unknown): number {
  if (typeof value !== 'object' || value === null || !('size' in value)) return -1;
  const size = value.size;
  return typeof size === 'number' ? size : -1;
}
async function confirmWritten(
  handle: Record<string, unknown>,
  expected: number,
): Promise<WriteState> {
  let lost = false;
  for (let attempt = 0; attempt < VERIFY_ATTEMPTS; attempt++) {
    if (attempt > 0) await new Promise<void>((resolve) => setTimeout(resolve, VERIFY_DELAY));
    let value: unknown;
    try {
      value = await apiPromise(apiMethod(handle, 'getFile', '保存文件')(), '读取已保存文件');
    } catch (error) {
      if (!isMissingFile(error)) return 'unknown';
      lost = true;
      continue;
    }
    const size = fileSize(value);
    if (size === expected) return 'confirmed';
    if (size >= 0) lost = true;
  }
  return lost ? 'lost' : 'unknown';
}
/** Selection runs on the original click; native handles never leave this adapter. */
export async function selectWebSave(file: ExportFile): Promise<ByteSaveTarget | undefined> {
  const {name, mime, extension} = file,
    host = apiObject(window, 'Web');
  if (!window.isSecureContext || typeof host.showSaveFilePicker !== 'function') {
    return {
      async save(blob) {
        downloadBlob(blob, name);
        return 'download-started';
      },
    };
  }
  // The picker only opens inside a fresh user gesture. A preparation that outlives the gesture leaves the
  // browser with no destination chooser, which is a different outcome from a browser without the capability.
  if (!navigator.userActivation?.isActive) {
    return {
      async save(blob) {
        downloadBlob(blob, name);
        return 'activation-expired';
      },
    };
  }
  let handle: Record<string, unknown>;
  try {
    handle = apiObject(
      await apiPromise(
        apiMethod(
          host,
          'showSaveFilePicker',
          'Web',
        )({
          suggestedName: name,
          types: [{description: extension + ' 文件', accept: {[mime]: [extension]}}],
        }),
        '选择保存位置',
      ),
      '保存文件',
    );
  } catch (error) {
    if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError')
      return undefined;
    throw error;
  }
  return {
    async save(blob) {
      // No writable stream is opened until content and any DOCX consent are ready.
      const stream = apiObject(
        await apiPromise(apiMethod(handle, 'createWritable', '保存文件')(), '打开写入流'),
        '文件写入流',
      );
      try {
        await apiPromise(apiMethod(stream, 'write', '文件写入流')(blob), '写入文件');
        await apiPromise(apiMethod(stream, 'close', '文件写入流')(), '提交文件');
      } catch (error) {
        try {
          await apiPromise(apiMethod(stream, 'abort', '文件写入流')(), '中止文件写入');
        } catch {
          /* Keep the original write/close failure. */
        }
        throw error;
      }
      // The chosen location is the only place the user expects the file: confirm it, or hand the bytes to the
      // browser instead of reporting a success that did not happen.
      const state = await confirmWritten(handle, blob.size);
      if (state === 'lost') {
        downloadBlob(blob, name);
        return 'recovered-download';
      }
      // **不再直连 console** ✓ ⇒ ⇒ 走消息端口 ✓ ⇒ ⇒ 日志里有一条带类别的记录 ✓。
      if (state === 'unknown')
        void reportFailure({
          category: 'export-failed',
          detail: '文件已提交，但无法回读校验所选位置：' + name,
          tone: 'warning',
        });
      return 'saved';
    },
  };
}
