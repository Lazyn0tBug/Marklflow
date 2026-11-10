/**
 * 文字的光学度量：图标要挪多少，才与文字的墨迹中心对齐。
 *
 * 图标的墨迹中心 = 图标元素的中心（图形在图标框里居中，与图标尺寸无关）。
 * 文字的墨迹中心随字形而变：CJK 填满字身框、位置偏上，拉丁只到 x-height。
 * 两者之差由字体度量决定——这里量出来，不写死常数，换引擎、换字号、换字体都对。
 *
 * 三样都从实际渲染里量，不用模型推：
 * - **基线**：塞一个零尺寸的 inline-block，用 `vertical-align: baseline`，它的底边落在基线上。
 *   （不能用 canvas 的 `fontBoundingBox`：浏览器行盒用的字体度量与它差 1px，
 *   照抄会把基线算错，连符号都反。）
 * - **墨迹盒**：canvas 的 `actualBoundingBoxAscent/Descent`，与实际渲染吻合。
 * - **图标当前所在**：折叠槽的中心（图形在图标框里居中，槽的位置不受图标偏移影响）。
 */

/**
 * 字形墨迹中心在基线上方多少。
 *
 * 墨迹自基线向上 ascent、向下 descent ⇒ 中心在基线上方 (ascent − descent)/2 处 ✓。
 * CJK 的字形填满字身框 ⇒ ascent 大 ⇒ 中心偏上 ⇒ 图标要相应上移 ✓。
 */
export function inkCenterOffset(ascent: number, descent: number): number {
  return (ascent - descent) / 2;
}

/**
 * 图标相对文字该挪的像素数（正数 = 下移，负数 = 上移）。
 *
 * @param text 用来取样的一段文字（它的墨迹中心就是对齐的目标）。
 * @param slot 图标所在的折叠槽（提供图标当前的位置）。
 */
export function measureOpticalShift(text: HTMLElement, slot: HTMLElement): number {
  const style = getComputedStyle(text);
  const fontSize = parseFloat(style.fontSize);
  if (!(fontSize > 0)) return 0;

  const probe = document.createElement('span');
  probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
  text.appendChild(probe);
  const baseline = probe.getBoundingClientRect().bottom;
  probe.remove();

  const context = document.createElement('canvas').getContext('2d');
  if (!context) return 0;
  context.font = `${fontSize}px ${style.fontFamily}`;
  const metrics = context.measureText(text.textContent ?? '');
  const ascent = metrics.actualBoundingBoxAscent,
    descent = metrics.actualBoundingBoxDescent;
  if (!Number.isFinite(ascent) || !Number.isFinite(descent)) return 0;

  // 墨迹中心在基线上方 (ascent − descent)/2 处。
  const inkCenter = baseline - inkCenterOffset(ascent, descent);
  const slotBox = slot.getBoundingClientRect();
  const slotCenter = (slotBox.top + slotBox.bottom) / 2;
  return inkCenter - slotCenter;
}
