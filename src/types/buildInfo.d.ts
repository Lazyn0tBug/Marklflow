/**
 * 构建期注入的常量 ✓。
 *
 * **`__MARKFLOW_BUILD_COMMIT__`** ✓：这个前端构建的 commit ✓
 * ⇒ ⇒ `vite.config.ts` 注入 ✓ ⇒ ⇒ 页面报得出它是哪一次构建 ✓
 * ⇒ ⇒ 与原生侧那一份同一个 commit ✓ ⇒ ⇒ 日志能对出两边是不是同一个构建 ✓。
 */
declare const __MARKFLOW_BUILD_COMMIT__: string;
