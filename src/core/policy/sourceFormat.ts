import type {SourceFormat} from '../model/document';

/**
 * **哪些文件按可编辑 HTML 载荷读** ✓（设计 §3.3 ✓、M4-2 ✓）。
 *
 * **一处决定** ✓ ⇒ ⇒ 打开时用它 ✓ ⇒ ⇒ 另存为选完目标也用它 ✓
 * ⇒ ⇒ **同一个文件前后拿到同一个格式** ✓ ⇒ ⇒ 写回时选对那一份字节 ✓（§6.1 ✓）。
 *
 * **扩展名说了算** ✓ ⇒ ⇒ `.html` / `.htm` 走 HTML 载荷路径 ✓ ⇒ ⇒ 其余按 Markdown ✓。
 * **普通手写 HTML 没有载荷** ✓ ⇒ ⇒ 那是在导入那一步失败 ✓ ⇒ ⇒ 不是这里的事 ✓（M4-2 ✓）。
 */
export function sourceFormatOf(fileName: string): SourceFormat {
  return /\.html?$/i.test(fileName) ? 'editable-html' : 'markdown';
}
