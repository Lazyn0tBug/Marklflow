/**
 * 面板几何的取值口 ✓：**唯一的出处是 CSS 自定义属性** ✓。
 *
 * token 用 rem 写 ⇒ ⇒ 解析时按当前根字号换算成 px ✓ ⇒ ⇒ 用户放大系统字号时
 * 面板下限与窄屏阈值跟着放大 ✓。
 */
import type {PaneGeometry} from '../../model/paneSplit';

const PANE_MIN_TOKEN = '--mf-pane-min';
const SPLIT_HANDLE_TOKEN = '--mf-split-handle';

function resolveLength(element: Element, token: string): number {
  const raw = getComputedStyle(element).getPropertyValue(token).trim();
  if (!raw) return 0;
  const value = parseFloat(raw);
  if (!Number.isFinite(value)) return 0;
  if (raw.endsWith('rem')) {
    const root = parseFloat(getComputedStyle(document.documentElement).fontSize);
    return Number.isFinite(root) ? value * root : value * 16;
  }
  return value;
}

export function readPaneGeometry(element: Element): PaneGeometry {
  return {
    minimumPaneWidth: resolveLength(element, PANE_MIN_TOKEN),
    splitHandleWidth: resolveLength(element, SPLIT_HANDLE_TOKEN),
  };
}
