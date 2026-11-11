/**
 * 删掉一份文档之后，工作区的落点是哪一份 ✓。
 *
 * **列表里的下一个** ✓ ⇒ ⇒ 下一个没有了就退到上一个 ✓ ⇒ ⇒
 * **和关标签页那一条同一套规矩** ✓（`DocumentSessions.close` 就是这么挑的 ✓ ✓）。
 *
 * **它只答"哪一份"** ✓ ⇒ ⇒ 不负责打开 ✓ ⇒ ⇒ 打开那一步是界面层的事 ✓。
 */

/**
 * @param documents 文档列表 ✓ **按界面上的顺序** ✓。
 * @param deletedId 被删掉的那一份 ✓。
 * @returns 落点那一份 ✓ ⇒ ⇒ 没有就 undefined ✓（列表空了就是空了 ✓）。
 */
export function nextDocumentAfterDeletion<T extends {id: string}>(
  documents: readonly T[],
  deletedId: string,
): T | undefined {
  const index = documents.findIndex((doc) => doc.id === deletedId);
  if (index < 0) return undefined;
  // **下一个优先** ✓ ⇒ ⇒ 没有下一个就退到上一个 ✓ ⇒ ⇒ 删掉最后一份也不会空着 ✓。
  return documents[index + 1] ?? documents[index - 1];
}
