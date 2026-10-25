import { documentSchema } from '../model/documentSchema';
/**
 * MarkFlow (墨流) 存储与源载荷管理器
 * 遵循无后端、无云端上传、本地 IndexedDB 持久化与单文件 HTML 往返导入规范
 */

import { DocumentRecord, DEFAULT_THEME, INITIAL_SAMPLE_MARKDOWN } from '../model/document';

import {webDocumentRepository,recoveryJson} from '../platform/web/documentRepository';
import {createRenderNonce} from '../platform/crypto';
export {recoveryJson};
export async function loadDocuments(){
 const loaded=await webDocumentRepository.load();
 if(loaded.canInitialize){const doc=createInitialDocument();await saveDocument(doc);return {...loaded,documents:[doc]}}
 return loaded;
}
export async function getAllDocuments():Promise<DocumentRecord[]>{return (await loadDocuments()).documents}
export async function saveDocument(doc:DocumentRecord):Promise<void>{
 await webDocumentRepository.save({...doc,meta:{...doc.meta,updatedAt:new Date().toISOString()}});
}
export async function deleteDocument(id:string):Promise<void>{await webDocumentRepository.delete(id)}
export function getStorageRecoveries(){return webDocumentRepository.recoveries()}

/**
 * 创建新空白或模板文档
 */
export function createNewDocument(title: string = '未命名技术文档'): DocumentRecord {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: 'doc_' + createRenderNonce(),
    revision: 1,
    markdown: `# ${title}\n\n在此开始撰写您的 Markdown 内容...\n`,
    meta: {
      title,
      author: 'MarkFlow Author',
      createdAt: now,
      updatedAt: now,
    },
    theme: { ...DEFAULT_THEME, margins: {...DEFAULT_THEME.margins} },
    options: {
      syntaxProfile: 'commonmark-gfm-v1',
      mathMode: 'mathml',
    },
  };
}

export function createInitialDocument(): DocumentRecord {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: 'doc_quantum_report_001',
    revision: 1,
    markdown: INITIAL_SAMPLE_MARKDOWN,
    meta: {
      title: '量子退相干与量子计算系统工程报告',
      author: 'MarkFlow 架构组',
      createdAt: now,
      updatedAt: now,
      tags: ['物理', '量子计算', '系统工程'],
    },
    theme: { ...DEFAULT_THEME, margins: {...DEFAULT_THEME.margins} },
    options: {
      syntaxProfile: 'commonmark-gfm-v1',
      mathMode: 'mathml',
    },
  };
}

/**
 * 封装单文件 HTML 中的非执行 Base64 JSON 源载荷
 */
export function encodeSourcePayload(doc: DocumentRecord): string {
  const jsonStr = JSON.stringify(doc);
  // 使用 encodeURIComponent 配合 btoa 支持 UTF-8 中文
  return btoa(encodeURIComponent(jsonStr));
}

/**
 * 从 HTML 字符串中解出源载荷
 */
export function extractPayloadFromHtml(htmlContent: string): DocumentRecord | null {
  try {
    if (htmlContent.length > 50 * 1024 * 1024) return null;
    const template=document.createElement('template');template.innerHTML=htmlContent;
    const payloads=template.content.querySelectorAll('script[id="markflow-source-payload"]');
    const payload=payloads[0];
    if(payloads.length!==1||!payload)return null;
    if(payload.hasAttribute('type')&&payload.getAttribute('type')!=='application/json')return null;
    const base64Data=payload.textContent?.trim();if(!base64Data)return null;
    const jsonStr = decodeURIComponent(atob(base64Data));
    const result = documentSchema.safeParse(JSON.parse(jsonStr));
    if (!result.success) return null;
    const parsed = result.data;

    if (parsed && parsed.schemaVersion === 1 && typeof parsed.markdown === 'string') {
      return {
        ...parsed,
        id: parsed.id,
        meta: {
          ...parsed.meta,
          updatedAt: new Date().toISOString(),
        },
      };
    }
  } catch (err) {
    console.warn('Failed to parse embedded MarkFlow payload', err);
  }
  return null;
}
