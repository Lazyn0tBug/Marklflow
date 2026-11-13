/** Workbench geometry only; never part of document/render identity. */

/**
 * 面板几何 ✓：**宿主给的值** ✓。
 *
 * 纯模块不读 DOM ✓ ⇒ ⇒ 也不自带一份常量 ✓ ⇒ ⇒ 取值只有一个出处（CSS 的 token）✓（原则 1.4 ✓）。
 */
export interface PaneGeometry {
  /** 面板最小宽度（px，已解析）✓。 */
  minimumPaneWidth: number;
  /** 分隔条宽度（px，已解析）✓。 */
  splitHandleWidth: number;
}

export function splitBounds(
  width: number,
  geometry: PaneGeometry,
): {minimum: number; maximum: number; available: number} {
  const {minimumPaneWidth, splitHandleWidth} = geometry;
  /**
   * **下限 1** ✓ ⇒ ⇒ 几何还没读到（宿主给的是 0）时也不会 0/0 ⇒ ⇒ 比值不是 NaN ✓。
   *
   * 正常几何时这个下限不起作用 ✓（两个面板的最小宽度已经远大于它 ✓）。
   */
  const available = Math.max(
    1,
    minimumPaneWidth * 2,
    Number.isFinite(width) ? width - splitHandleWidth : 0,
  );
  const minimum = Math.max(0.15, minimumPaneWidth / available);
  return {minimum, maximum: Math.min(0.85, 1 - minimumPaneWidth / available), available};
}
export function constrainSplit(ratio: number, width: number, geometry: PaneGeometry): number {
  const {minimum, maximum} = splitBounds(width, geometry);
  return Math.max(minimum, Math.min(maximum, Number.isFinite(ratio) ? ratio : 0.5));
}
