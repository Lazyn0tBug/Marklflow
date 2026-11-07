import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {createRequire} from 'node:module';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    build: {
      /*
       * CSS 的目标内核 ✓：**明写** ✓ ⇒ ⇒ 压缩器不再把新特性改写掉 ✓。
       *
       * **为什么必须写** ✓：Lightning CSS 默认会把 `light-dark()` 降级成
       * `var(--lightningcss-light,X)var(--lightningcss-dark,Y)` ✓ ⇒ ⇒ 那两个变量从没被定义 ✓
       * ⇒ ⇒ 值无效 ✓ ⇒ ⇒ 用它的属性（边框、底色、内边距）全部失效 ✓
       * ⇒ ⇒ **开发服务器不做这个转换** ⇒ ⇒ 样页是对的、构建产物是错的 ✓。
       *
       * 这里的数字就是本应用的内核地板 ✓（Chrome 123 ✓ Safari 17.5 ✓ Firefox 120 ✓
       * ⇒ ⇒ 对应 `light-dark()`、`color-mix()`、`:has()` ✓）⇒ ⇒ 老内核不在支持范围内 ✓。
       */
      cssTarget: ['chrome123', 'safari17.5', 'firefox120'],
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
        // Its browser conditional entry uses document; pin the same package's DOM-free default.
        'decode-named-character-reference': createRequire(import.meta.url).resolve('decode-named-character-reference'),
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
