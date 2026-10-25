/**
 * MarkFlow (墨流) 跨平台桌面与原生环境适配层
 * 实现 Web SPA / PWA 与 Tauri 桌面双模同源运行与渐进增强
 */

export interface DesktopPlatformInfo {
  isDesktop: boolean;
  os: string;
  arch?: string;
  version?: string;
}

export interface NativeFileResult {
  path: string;
  name: string;
  content: string;
}

export interface NativeSaveResult {
  saved: boolean;
  path?: string;
}

/** 检测当前是否在 Tauri 桌面客户端容器中运行 */
export function isTauri(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(
    // Tauri v2 核心标记
    ('__TAURI_INTERNALS__' in window) ||
    // Tauri 传统/辅助全局对象
    ('__TAURI__' in window)
  );
}

/** 获取当前平台详细信息（桌面 OS 或 Web 浏览器） */
export async function getPlatformInfo(): Promise<DesktopPlatformInfo> {
  if (!isTauri()) {
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown';
    let os = 'Web';
    if (/Macintosh|Mac OS X/i.test(userAgent)) os = 'macOS (Web)';
    else if (/Windows/i.test(userAgent)) os = 'Windows (Web)';
    else if (/Linux/i.test(userAgent)) os = 'Linux (Web)';

    return {
      isDesktop: false,
      os,
      version: 'Web SPA',
    };
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const info = await invoke<{ os: string; arch: string; version: string }>('get_platform_info');
    return {
      isDesktop: true,
      os: info.os,
      arch: info.arch,
      version: info.version,
    };
  } catch {
    return {
      isDesktop: true,
      os: 'Desktop (Tauri)',
    };
  }
}

/** 调起原生文件打开对话框，读取本地 Markdown 文件 */
export async function openNativeFileDialog(): Promise<NativeFileResult | null> {
  if (!isTauri()) return null;

  try {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const { readTextFile } = await import('@tauri-apps/plugin-fs');

    const selected = await open({
      multiple: false,
      directory: false,
      filters: [
        {
          name: 'Markdown & HTML 文档',
          extensions: ['md', 'markdown', 'txt', 'html', 'htm'],
        },
      ],
    });

    if (!selected || typeof selected !== 'string') return null;

    const content = await readTextFile(selected);
    const pathParts = selected.replace(/\\/g, '/').split('/');
    const name = pathParts[pathParts.length - 1] || '未命名文档';

    return {
      path: selected,
      name,
      content,
    };
  } catch (error) {
    console.error('打开本地文件失败:', error);
    return null;
  }
}

/** 原位覆盖保存已有关联物理路径的文件 (Ctrl+S / Cmd+S) */
export async function saveNativeFileInPlace(filePath: string, content: string): Promise<boolean> {
  if (!isTauri() || !filePath) return false;

  try {
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    await writeTextFile(filePath, content);
    return true;
  } catch (error) {
    console.error('原位写回本地文件失败:', error);
    return false;
  }
}

/** 调起原生“另存为”对话框并写入文件 */
export async function saveNativeFileAs(
  defaultName: string,
  content: string,
  extension: string = 'md'
): Promise<string | null> {
  if (!isTauri()) return null;

  try {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');

    const defaultPath = defaultName.endsWith(`.${extension}`) ? defaultName : `${defaultName}.${extension}`;
    const targetPath = await save({
      defaultPath,
      filters: [
        {
          name: `${extension.toUpperCase()} 文件`,
          extensions: [extension],
        },
      ],
    });

    if (!targetPath) return null;

    await writeTextFile(targetPath, content);
    return targetPath;
  } catch (error) {
    console.error('原生另存为失败:', error);
    return null;
  }
}

/** 通用原生导出：保存二进制（DOCX/Blob）或文本（HTML/MD）至本地磁盘 */
export async function saveExportBinaryOrText(
  defaultName: string,
  extension: string,
  data: string | Uint8Array | Blob
): Promise<NativeSaveResult> {
  if (!isTauri()) {
    // Web 浏览器环境回退：通过 Blob 触发浏览器下载
    const blob =
      data instanceof Blob
        ? data
        : new Blob([data as unknown as BlobPart], {
            type: extension === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'text/plain;charset=utf-8',
          });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = defaultName.endsWith(`.${extension}`) ? defaultName : `${defaultName}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return { saved: true };
  }

  try {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeFile, writeTextFile } = await import('@tauri-apps/plugin-fs');

    const defaultPath = defaultName.endsWith(`.${extension}`) ? defaultName : `${defaultName}.${extension}`;
    const targetPath = await save({
      defaultPath,
      filters: [
        {
          name: `${extension.toUpperCase()} 文件`,
          extensions: [extension],
        },
      ],
    });

    if (!targetPath) return { saved: false };

    if (typeof data === 'string') {
      await writeTextFile(targetPath, data);
    } else if (data instanceof Uint8Array) {
      await writeFile(targetPath, data);
    } else if (data instanceof Blob) {
      const arrayBuffer = await data.arrayBuffer();
      await writeFile(targetPath, new Uint8Array(arrayBuffer));
    }

    return { saved: true, path: targetPath };
  } catch (error) {
    console.error('原生写出导出文件失败:', error);
    return { saved: false };
  }
}

/** 原生静默导出矢量 PDF 文件 */
export async function exportPdfDirect(
  frozenHtml: string,
  defaultName: string
): Promise<{ success: boolean; path?: string; message?: string }> {
  if (!isTauri()) {
    return { success: false, message: '非桌面环境' };
  }

  try {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { invoke } = await import('@tauri-apps/api/core');

    const defaultPath = defaultName.endsWith('.pdf') ? defaultName : `${defaultName}.pdf`;
    const targetPath = await save({
      defaultPath,
      filters: [{ name: 'PDF 矢量文档', extensions: ['pdf'] }],
    });

    if (!targetPath) return { success: false, message: '已取消保存' };

    await invoke('export_pdf_direct', {
      payload: {
        html_content: frozenHtml,
        target_path: targetPath,
      },
    });

    return {
      success: true,
      path: targetPath,
      message: `已成功导出矢量 PDF 至：${targetPath}`,
    };
  } catch (error) {
    console.error('原生导出 PDF 失败:', error);
    return {
      success: false,
      message: String(error),
    };
  }
}

/** 动态同步更新桌面窗口标题与 Web 页面标题 */
export async function updateWindowTitle(title: string, isDirty: boolean): Promise<void> {
  const displayTitle = `${isDirty ? '● ' : ''}${title || '未命名技术文档'} - MarkFlow 墨流`;
  if (typeof document !== 'undefined') {
    document.title = displayTitle;
  }
  if (isTauri()) {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().setTitle(displayTitle);
    } catch {
      // Ignored if window capability is restricted
    }
  }
}
