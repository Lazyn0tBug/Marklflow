import { documentSchema } from '../model/documentSchema';
/**
 * MarkFlow (墨流) 存储与源载荷管理器
 * 遵循无后端、无云端上传、本地 IndexedDB 持久化与单文件 HTML 往返导入规范
 */

import { DocumentRecord, DEFAULT_THEME, INITIAL_SAMPLE_MARKDOWN } from '../model/document';

const DB_NAME = 'markflow_db';
const DB_VERSION = 1;
const STORE_DOCS = 'documents';
const STORE_METADATA = 'metadata';

let dbInstance: IDBDatabase | null = null;

async function getDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not supported'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_DOCS)) {
        db.createObjectStore(STORE_DOCS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_METADATA)) {
        db.createObjectStore(STORE_METADATA, { keyPath: 'key' });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
}

/**
 * 获取所有文档列表
 */
export async function getAllDocuments(): Promise<DocumentRecord[]> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_DOCS, 'readonly');
      const store = tx.objectStore(STORE_DOCS);
      const req = store.getAll();
      req.onsuccess = () => {
        const docs = req.result as DocumentRecord[];
        if (!docs || docs.length === 0) {
          // 初始化首个示例报告
          const initialDoc = createInitialDocument();
          saveDocument(initialDoc).then(() => resolve([initialDoc]),reject);
        } else {
          resolve(docs);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    // 降级为 localStorage
    const stored = localStorage.getItem('markflow_docs');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        // fallback
      }
    }
    const initialDoc = createInitialDocument();
    localStorage.setItem('markflow_docs', JSON.stringify([initialDoc]));
    return [initialDoc];
  }
}

/**
 * 保存或更新文档
 */
export async function saveDocument(doc: DocumentRecord): Promise<void> {
  const updatedDoc = {
    ...doc,
    meta: {
      ...doc.meta,
      updatedAt: new Date().toISOString(),
    },
  };

  try {
    const db = await getDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_DOCS, 'readwrite');
      const store = tx.objectStore(STORE_DOCS);
      tx.oncomplete=()=>resolve();
      tx.onabort=()=>reject(tx.error||new Error('存储事务已中止'));
      tx.onerror=()=>reject(tx.error||new Error('存储事务失败'));
      store.put(updatedDoc);
    });
  } catch (error) {
    if(dbInstance)throw error;
    // Fallback is only used when IndexedDB is unavailable.
    const all = await getAllDocuments();
    const idx = all.findIndex((d) => d.id === doc.id);
    if (idx >= 0) {
      all[idx] = updatedDoc;
    } else {
      all.push(updatedDoc);
    }
    localStorage.setItem('markflow_docs', JSON.stringify(all));
  }
}

/**
 * 删除文档
 */
export async function deleteDocument(docId: string): Promise<void> {
  try {
    const db = await getDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_DOCS, 'readwrite');
      const store = tx.objectStore(STORE_DOCS);
      tx.oncomplete=()=>resolve();
      tx.onabort=()=>reject(tx.error||new Error('删除事务已中止'));
      tx.onerror=()=>reject(tx.error||new Error('删除事务失败'));
      store.delete(docId);
    });
  } catch (error) {
    if(dbInstance)throw error;
    const all = (await getAllDocuments()).filter((d) => d.id !== docId);
    localStorage.setItem('markflow_docs', JSON.stringify(all));
  }
}

/**
 * 创建新空白或模板文档
 */
export function createNewDocument(title: string = '未命名技术文档'): DocumentRecord {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: 'doc_' + Math.random().toString(36).substring(2, 10),
    revision: 1,
    markdown: `# ${title}\n\n在此开始撰写您的 Markdown 内容...\n`,
    meta: {
      title,
      author: 'MarkFlow Author',
      createdAt: now,
      updatedAt: now,
    },
    theme: { ...DEFAULT_THEME },
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
    theme: { ...DEFAULT_THEME },
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
        id: 'doc_imported_' + Math.random().toString(36).substring(2, 9),
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
