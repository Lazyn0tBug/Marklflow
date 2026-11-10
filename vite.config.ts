import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {defineConfig, type UserConfig} from 'vite';

/**
 * **这个前端构建的 commit** ✓ ⇒ ⇒ 页面能报出**它自己的构建** ✓ ⇒ ⇒
 * 于是日志能回答**页面与原生侧是不是同一个构建** ✓ ⇒ ⇒ 不用问人 ✓。
 *
 * **取不到就写 unknown** ✓ ⇒ ⇒ 没有 git 也能构建 ✓ ⇒ ⇒ 不因为标识而失败 ✓。
 */
function buildCommit(): string {
  try {
    const output = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output.trim() || 'unknown';
  } catch {
    return 'unknown';
  }
}

export default defineConfig((): UserConfig => {
  return {
    plugins: [react(), tailwindcss()],
    // **页面自己的构建标识** ✓：构建期注入 ✓ ⇒ ⇒ 页面报得出它是哪一次构建 ✓ ⇒ ⇒
    // 与原生侧那一份同一个 commit ✓ ⇒ ⇒ 日志能对出两边是不是同一个构建 ✓。
    define: {__MARKFLOW_BUILD_COMMIT__: JSON.stringify(buildCommit())},
    build: {
      /*
       * **用 esbuild 压 CSS** ✓ ⇒ ⇒ 它只压缩，**不改写新特性** ✓。
       *
       * **为什么必须换** ✓：Lightning CSS 会把 `light-dark()` 降级成
       * `var(--lightningcss-light,X)var(--lightningcss-dark,Y)` ✓ ⇒ ⇒ 那两个变量从没被定义 ✓
       * ⇒ ⇒ 值无效 ✓ ⇒ ⇒ 用它的属性（边框、底色、内边距）全部失效 ✓
       * ⇒ ⇒ **开发服务器不做这个转换** ⇒ ⇒ 样页是对的、构建产物是错的 ✓。
       *
       * **只写 `cssTarget` 不够** ✓ ⇒ ⇒ 那个只定"降到哪个版本" ✓ ⇒ ⇒ 降级规则仍在 ✓
       * ⇒ ⇒ 版本再新也救不了被改写的值 ✓ ⇒ ⇒ **要换的是压缩器本身** ✓。
       *
       * **地板就是浏览器自己的** ✓ ⇒ ⇒ 被依赖的只有 `light-dark()`（主题靠它 ✓）
       * ⇒ ⇒ 地板 = Chrome 123 ✓ Safari 17.5 ✓ Firefox 120 ✓
       * ⇒ ⇒ 低于这个版本不在支持范围内 ✓ ⇒ ⇒ **不写兜底** ✓。
       * ⇒ ⇒ 其余的（`color-mix()` ✓ `:has()` ✓ `text-wrap` ✓ `@starting-style` ✓
       * ⇒ ⇒ `scrollbar-gutter` ✓）都是**渐进增强** ✓ ⇒ ⇒ 不抬地板 ✓。
       */
      cssMinify: 'esbuild',
      cssTarget: ['chrome123', 'safari17.5', 'firefox120'],
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
        // Its browser conditional entry uses document; pin the same package's DOM-free default.
        'decode-named-character-reference': createRequire(import.meta.url).resolve(
          'decode-named-character-reference',
        ),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {ignored: ['**/src-tauri/**']},
    },
  };
});
