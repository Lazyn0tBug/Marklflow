import {Component, type ErrorInfo, type ReactNode} from 'react';
import type {MessageCategory} from '../application/messages';
import {isAppReady, reactSource, reportCapture} from '../core/platform/web/capture';

/**
 * 错误边界：**渲染期的错误局部降级** ✓。
 *
 * React 19 的根选项只**报告**，不降级 ✓ ⇒ ⇒ 降级要靠这个边界 ✓
 * ⇒ ⇒ 出错的那一块显示"这一部分没能显示"，**其余部分照常** ✓
 * ⇒ ⇒ 不会因为一个坏组件而白屏 ✓ ⇒ ⇒ 这是**表面状态** ⇒ 留在那块里 ✓
 * ⇒ ⇒ 不进通知面 ✓（设计 §2.1 ✓）。
 *
 * **报告由边界发** ✓：它知道这是"起不来"还是"这一部分" ✓ ⇒ ⇒ 根选项只管
 * 没人接住的那种 ✓ ⇒ ⇒ 一次问题只出一份报告 ✓（设计 §3.2 ✓）。
 */
interface ErrorBoundaryProps {
  /** 要护住的那一块 ✓。 */
  children?: ReactNode;
  /** 降级后显示什么 ✓（由调用方给 ✓ ⇒ ⇒ 根与局部各给各的 ✓）。 */
  fallback: ReactNode;
  /** 最外层那个吗 ✓（决定报"起不来"还是"这一部分" ✓）。 */
  root?: boolean;
}

interface ErrorBoundaryState {
  failed: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {failed: false};

  static getDerivedStateFromError(): ErrorBoundaryState {
    return {failed: true};
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    // 最外层那块 ⇒ 整个工作台 ⇒ 工作台还没起来就崩了 ⇒ "起不来" ✓。
    const category: MessageCategory = this.props.root && !isAppReady() ? 'startup' : 'render';
    void reportCapture(category, error, reactSource(info.componentStack));
  }

  render(): ReactNode {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}
