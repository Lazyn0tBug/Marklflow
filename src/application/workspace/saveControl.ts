import type {DocumentFileContext} from './documentFileContext';

/**
 * 顶栏那个分裂按钮的形状 ✓（设计 §8.2 ✓、§8.6 ✓）。
 *
 * **界面不自己判** ✓ ⇒ ⇒ 这里派生好 ✓ ⇒ ⇒ 组件只照着渲染 ✓（§2.3 ✓）。
 *
 * **一份派生** ✓ ⇒ ⇒ Web 端与桌面端**用同一条规则** ✓ ⇒ ⇒ **界面两形态一致** ✓（§8.2 ✓）。
 */

/**
 * **关联有三种状态** ✓（§8.2 ✓）：**都是派生出来的** ✓ ⇒ ⇒ 界面不自己维护 ✓。
 *
 * - **空** ✓ ⇒ ⇒ 还没有本地文件 ✓（桌面端新建的那一份 ✓）；
 * - **有效** ✓ ⇒ ⇒ 那个目标还在 ✓ ⇒ ⇒ **读判断刚答过** ✓（§3.1 ✓）；
 * - **无效** ✓ ⇒ ⇒ 那个目标不在了 ✓ ⇒ ⇒ **读判断答的不是"在"** ✓ ⇒ ⇒
 *   **不是写失败推出来的** ✓ ⇒ ⇒ **写失败不产生新的一类** ✓。
 */
export type BindingState = 'none' | 'valid' | 'invalid';

/**
 * **这个文档的关联是哪种状态** ✓ ⇒ ⇒ **只读上下文** ✓ ⇒ ⇒ **不自己问** ✓（§8.6 ✓）。
 *
 * **答案是读判断给的** ✓ ⇒ ⇒ `targetPresent` 是假 ⇒ ⇒ **无效** ✓ ⇒ ⇒
 * 其余（为真，或还没失效过）⇒ ⇒ **有效** ✓ ⇒ ⇒ **点时事实** ✓（§8.2 ✓）。
 */
export function bindingState(context: DocumentFileContext | undefined): BindingState {
  if (context === undefined) return 'none';
  return context.file.targetPresent === false ? 'invalid' : 'valid';
}

/**
 * 顶栏那个分裂按钮的形状 ✓（设计 §8.2 ✓、§8.6 ✓）。
 *
 * **界面不自己判** ✓ ⇒ ⇒ 这里派生好 ✓ ⇒ ⇒ 组件只照着渲染 ✓（§2.3 ✓）。
 *
 * **一份派生** ✓ ⇒ ⇒ Web 端与桌面端**用同一条规则** ✓ ⇒ ⇒ **界面两形态一致** ✓（§8.2 ✓）。
 */
export interface SaveControlView {
  /** 主区「保存」= **把这一份写到一个本地文件** ✓ ⇒ ⇒ **能不能点由关联状态决定** ✓（§8.2 ✓）。 */
  writeBackEnabled: boolean;
  /** 箭头 = 菜单 ✓ ⇒ ⇒ **菜单里至少有一项可点才可点** ✓ ⇒ ⇒ **Web 端整组灰掉** ✓（§8.2 ✓）。 */
  menuEnabled: boolean;
  /** 菜单里有没有「另存为…」 ✓ ⇒ ⇒ **关联为空时没有** ✓（§8.2 ✓）。 */
  saveAsAvailable: boolean;
  /** **那三种状态里的哪一种** ✓ ⇒ ⇒ 提示文案据此给 ✓ ⇒ ⇒ **组件不自己判** ✓（§8.5 ✓）。 */
  bindingState: BindingState;
}

/**
 * **这个按钮现在长什么样** ✓ ⇒ ⇒ 三种状态各一条规则 ✓（§8.2 ✓）。
 *
 * **主区可点 ⇔ 写得到一个本地文件** ✓：
 * - **关联有效** ⇒ ⇒ 写回那个文件 ✓ ⇒ ⇒ **可点** ✓；
 * - **关联为空** ⇒ ⇒ **弹原生对话框选一个** ✓ ⇒ ⇒ **可点** ✓ ⇒ ⇒ **文件名留空** ✓
 *   ⇒ ⇒ 用户自己填 ✓ ⇒ ⇒ 写成功 ⇒ ⇒ **关联就在那时建立** ✓（§8.2 ✓）；
 * - **关联无效** ⇒ ⇒ 写不进去 ⇒ ⇒ **置灰** ✓ ⇒ ⇒ **不给一个必然失败的按钮** ✓。
 *
 * **能不能选到一个新目标** ✓ ⇒ ⇒ **Web 端永远选不到** ✓ ⇒ ⇒ 那时主区无事可做 ⇒ ⇒
 * **整组灰掉** ✓ ⇒ ⇒ **理由与桌面端同一条** ✓（§8.2 ✓）。
 *
 * **另存为可点 ⇔ 有绑定且能选到新目标** ✓ ⇒ ⇒ **关联为空时不可点** ✓ ⇒ ⇒
 * 它做的事与 `保存` **完全一样** ✓ ⇒ ⇒ **不重复给入口** ✓。
 */
export function saveControlView(state: BindingState, canSelectTarget: boolean): SaveControlView {
  // **写得到一个本地文件才可点** ✓ ⇒ ⇒ **关联无效 ⇒ ⇒ 写不进去 ⇒ ⇒ 置灰** ✓
  // ⇒ ⇒ **选不到新目标 ⇒ ⇒ 也写不出去 ⇒ ⇒ 置灰** ✓ ⇒ ⇒ **Web 端整组灰掉** ✓（§8.2 ✓）。
  const writeBackEnabled = canSelectTarget && state !== 'invalid';
  const saveAsAvailable = state !== 'none' && canSelectTarget;
  return {
    writeBackEnabled,
    saveAsAvailable,
    // **箭头可点 ⇔ 菜单里至少有一项可点** ✓ ⇒ ⇒ **不是"有没有另存为"** ✓ ⇒ ⇒
    // **而是"菜单里还有没有能点的"** ✓（§8.2 ✓）。
    menuEnabled: writeBackEnabled || saveAsAvailable,
    bindingState: state,
  };
}
