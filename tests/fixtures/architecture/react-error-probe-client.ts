import {createElement, type ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import {ErrorBoundary} from '../../../src/components/ErrorBoundary';

/**
 * 渲染期错误的探针 ✓：**产品应用不暴露这个入口** ✓ ⇒ ⇒ 探针页面自己挂边界 ✓。
 *
 * **两个崩点** ✓：一个在最外层（工作台那一层 ✓）⇒ 类别是"起不来" ✓；
 * 一个在局部（一块里 ✓）⇒ 类别是"这一部分" ✓ ⇒ ⇒ 两处各报各的 ✓
 * ⇒ ⇒ 一次崩两处不会只看见一处 ✓。
 */

/** 一个渲染期就崩的组件 ✓。 */
function Boom(): ReactNode {
  throw new Error('探针：渲染崩了');
}

/** 另一个崩点 ✓：来源标识要不同 ⇒ ⇒ 两条报告各归各的 ✓。 */
function Crack(): ReactNode {
  throw new Error('探针：又崩了');
}

const outer = document.querySelector<HTMLElement>('[data-react-probe]');
const inner = document.querySelector<HTMLElement>('[data-react-nested]');
if (!outer || !inner) throw new Error('Missing react probe containers');

createRoot(outer).render(
  createElement(
    ErrorBoundary,
    {
      root: true,
      fallback: createElement('p', {'data-react-fallback': 'root'}, '工作台没能完整显示'),
    },
    createElement(Boom),
  ),
);

createRoot(inner).render(
  createElement(
    ErrorBoundary,
    {fallback: createElement('p', {'data-react-fallback': 'nested'}, '这一部分没能显示')},
    createElement(Crack),
  ),
);
