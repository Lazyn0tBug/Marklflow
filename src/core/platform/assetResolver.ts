/**
 * MarkFlow (墨流) 本地资产与图片路径解析管道
 * 依据《本地资产支持与文档管理语义重构设计方案》实现
 * 支持：
 * 1. 外部网络图片 (http/https)、内嵌 Base64、Blob 原样放行
 * 2. 操作系统本地绝对路径 (Windows C:\ 或 Unix /) 与 file:// 协议转换为 Tauri asset:// 流式协议
 * 3. 基于当前文档物理路径 (docFilePath) 的相对路径 (./..., ../...) 解析与转换
 */

import { isTauri } from './desktop';

/**
 * 判断路径是否为操作系统绝对路径或 file:// URI
 */
export function isAbsolutePath(p: string): boolean {
  if (!p) return false;
  const trimmed = p.trim();
  // Windows 驱动器盘符绝对路径 (例如 C:\path 或 D:/path) 或 UNC 路径
  if (/^[a-zA-Z]:[/\\]/.test(trimmed) || /^\\\\/.test(trimmed)) return true;
  // Unix 根目录绝对路径 (例如 /Users/name 或 /home/name)
  if (trimmed.startsWith('/')) return true;
  // file:// 协议
  if (/^file:\/\//i.test(trimmed)) return true;
  return false;
}

/**
 * 获取文件路径所在的父目录
 */
export function getDirectoryPath(filePath: string): string {
  if (!filePath) return '';
  const normalized = filePath.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  if (lastSlash === -1) return '';
  // Windows 盘符如 "C:/"
  if (lastSlash === 2 && normalized.endsWith(':/')) {
    return filePath.slice(0, 3);
  }
  return filePath.slice(0, lastSlash);
}

/**
 * 跨平台相对路径计算（纯函数，可在浏览器与桌面环境零依赖运行）
 */
export function resolvePath(baseDir: string, relativePath: string): string {
  if (isAbsolutePath(relativePath)) {
    return relativePath;
  }
  const isWindows = /^[a-zA-Z]:/.test(baseDir) || baseDir.includes('\\');

  // 统一转为正斜杠处理层级
  const normBase = baseDir.replace(/\\/g, '/').replace(/\/+$/, '');
  const normRel = relativePath.replace(/\\/g, '/').replace(/^\.\//, '');

  const baseParts = normBase.split('/');
  const relParts = normRel.split('/');

  const resultParts = [...baseParts];
  for (const part of relParts) {
    if (part === '.' || part === '') {
      continue;
    } else if (part === '..') {
      if (resultParts.length > 1 || (resultParts.length === 1 && !resultParts[0]?.endsWith(':'))) {
        resultParts.pop();
      }
    } else {
      resultParts.push(part);
    }
  }

  if (isWindows) {
    return resultParts.join('\\');
  }
  return resultParts.join('/');
}

/**
 * 将本地绝对路径转换为 Tauri 可流式直接读取渲染的 asset 协议 URL
 */
export function toTauriAssetUrl(absoluteFilePath: string): string {
  if (typeof window !== 'undefined' && (window as unknown as { __TAURI_INTERNALS__?: { convertFileSrc: (path: string, protocol?: string) => string } }).__TAURI_INTERNALS__?.convertFileSrc) {
    return (window as unknown as { __TAURI_INTERNALS__: { convertFileSrc: (path: string, protocol?: string) => string } }).__TAURI_INTERNALS__.convertFileSrc(absoluteFilePath, 'asset');
  }
  // 优雅降级构建 asset:// 协议路径
  const normalized = absoluteFilePath.replace(/\\/g, '/');
  return `asset://localhost/${encodeURIComponent(normalized)}`;
}

/**
 * 核心路径推导函数：将 Markdown 中的图片源路径转换为当前运行环境可渲染的安全 URL
 *
 * @param src 原始图片源（Markdown 或 HTML img 标签中的属性）
 * @param docFilePath 当前 Markdown 文档在本地磁盘的绝对路径（若存在）
 */
export function resolveMarkdownImageUrl(src: string, docFilePath?: string): string {
  if (!src) return src;
  const trimmed = src.trim();

  // 1. 如果已是外部网络协议、Base64 或 Blob，原样保留
  if (/^(https?:|data:|blob:|#)/i.test(trimmed)) {
    return trimmed;
  }

  // 2. 如果已是 Tauri asset 协议，原样保留
  if (/^(asset:\/\/|https?:\/\/asset\.localhost\/)/i.test(trimmed)) {
    return trimmed;
  }

  // 3. 检查是否在桌面客户端容器中
  if (!isTauri()) {
    // 纯 Web 环境下保持原样
    return trimmed;
  }

  try {
    let targetAbsolutePath: string | null = null;

    if (isAbsolutePath(trimmed)) {
      if (/^file:\/\//i.test(trimmed)) {
        // 去除 file:/// 前缀并解码
        let fileRaw = trimmed.replace(/^file:\/\/\/?/i, '');
        if (!/^[a-zA-Z]:/.test(fileRaw) && !fileRaw.startsWith('/')) {
          fileRaw = '/' + fileRaw;
        }
        targetAbsolutePath = decodeURIComponent(fileRaw);
      } else {
        targetAbsolutePath = trimmed;
      }
    } else if (docFilePath) {
      // 相对路径：基于当前文档物理所在目录推导真实磁盘绝对路径
      const baseDir = getDirectoryPath(docFilePath);
      if (baseDir) {
        targetAbsolutePath = resolvePath(baseDir, trimmed);
      }
    }

    if (targetAbsolutePath) {
      return toTauriAssetUrl(targetAbsolutePath);
    }
  } catch (err) {
    console.warn('[AssetResolver] 解析本地资源路径失败:', trimmed, err);
  }

  return trimmed;
}

/**
 * 检查给定 URL 是否代表本地资源（Tauri asset 协议或 file 协议）
 */
export function isLocalAssetUrl(url: string): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  return /^(asset:\/\/|https?:\/\/asset\.localhost\/|file:\/\/)/i.test(trimmed) || isAbsolutePath(trimmed);
}
