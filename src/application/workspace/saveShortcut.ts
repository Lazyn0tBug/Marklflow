/**
 * **那一个快捷键** ✓（设计 §6.3 ✓、§8.2 ✓）。
 *
 * **`Ctrl/Cmd+S`** ✓ ⇒ ⇒ 两端同一个键 ✓ ⇒ ⇒ 桌面端与 Web 端不用各记一遍 ✓。
 * **只有这一个键** ✓ ⇒ ⇒ 别的一律不管 ✓ ⇒ ⇒ 不会抢别的快捷键 ✓。
 */
export function isSaveShortcut(event: {key: string; metaKey: boolean; ctrlKey: boolean}): boolean {
  if (!event.metaKey && !event.ctrlKey) return false;
  return event.key === 's' || event.key === 'S';
}
