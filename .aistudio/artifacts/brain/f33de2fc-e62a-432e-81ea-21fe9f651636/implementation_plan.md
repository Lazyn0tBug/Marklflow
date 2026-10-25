# MarkFlow (墨流) - Tauri 桌面端架构与原生导出设计方案

本方案针对用户提出的“为应用增加 Tauri 桌面支持，兼顾操作系统差异与兼容性，且以纯粹的文档导出（PDF / DOCX / HTML / MD）替代多余的打印预览”诉求制定。本方案已在新建的 `tauri` 分支上建立，并同步记录至 `docs/design/tauri-desktop-architecture-plan.md`。

---

### User Review & Critical Decisions

> [!IMPORTANT]
> **已确认的关键设计决策：**
> 1. **独立分支管理**：在当前通过所有严格测试的基线基础上，已创建并切入独立的 `tauri` 分支进行桌面端开发与演进。
> 2. **功能语义回归——纯粹“文档导出”而非“打印预览”**：
>    - 桌面端不需要打印预览弹窗，用户核心诉求是一键导出与落盘。
>    - **彻底解决 Wry 打印上下文断裂问题**：通过向后端传递已完成排版与 Paged.js 分页计算的“冻结 HTML”，利用系统底层原生 WebView 机制直接写出矢量 PDF 文件。
> 3. **轻量纯粹，拒绝 Headless Chromium 膨胀**：
>    - 坚决不捆绑 150MB+ 的 Puppeteer / Playwright / 无头 Chromium，安装包体积维持在 ~15MB，内存占用 < 80MB。
>    - 依赖各系统原生 WebView 内核暴露的底层 API（Windows WebView2 `PrintToPdfAsync`、macOS WKWebView `createPDFWithConfiguration`、Linux WebKitGTK `WebKitPrintOperation`）。
> 4. **双模渐进增强（Zero-Breakage Dual-Target）**：
>    - 同一套代码同时支持纯浏览器 Web SPA、PWA 模式与 Tauri 桌面模式；
>    - 前端所有 Native 能力通过平台抽象层（`src/core/platform/desktop.ts`）在运行时自适应降级。

---

### 1. 跨平台 WebView 与导出机制对照

| 平台 | 底层渲染器 | PDF 原生导出机制 | 中文字体与排版适配 | 桌面窗口与交互特性 |
| :--- | :--- | :--- | :--- | :--- |
| **Windows** | **Edge WebView2**<br>(Blink) | `CoreWebView2.PrintToPdfAsync(path)` 静默生成高精度矢量 PDF | 系统内置微软雅黑 (Microsoft YaHei)、Segoe UI，CSS Paged Media 原生支持完善 | 快捷键 `Ctrl`；支持贴边微边框与无边框拖拽区 (`data-tauri-drag-region`) |
| **macOS** | **Apple WKWebView**<br>(WebKit) | `[WKWebView createPDFWithConfiguration:]` 直接由渲染树生成 PDF | 首选苹方 (PingFang SC)；支持 `-webkit-print-color-adjust: exact` | 快捷键 `Cmd (⌘)`；原生 Traffic Light 红绿灯控制，支持沉浸式透明标题栏 |
| **Linux** | **WebKitGTK**<br>(GTK3/4) | `webkit_print_operation_print()` 绑定 `GtkPrintSettings` 输出 URI | 打包思源黑体/Noto Sans CJK 开源字体回退；配置 `libwebkit2gtk-4.1` 打包依赖 | 遵循 GTK 主题与窗口管理器，快捷键 `Ctrl` |

---

### 2. 核心架构与数据流向

```text
┌────────────────────────────────────────────────────────┐
│  Web 前端 (React 19 / MarkFlow Core)                    │
│  - 编辑器与大纲树                                       │
│  - 物理分页与样式就绪 (Paged.js + MathJax + Mermaid)   │
│  - 打包生成自包含 Frozen HTML 载荷                     │
└──────────────────────────┬─────────────────────────────┘
                           │ 
                           │ IPC: invoke("export_pdf_direct", { html, savePath })
                           ▼
┌────────────────────────────────────────────────────────┐
│  Tauri 原生宿主层 (Rust / Wry)                          │
│                                                        │
│  1. 弹出系统原生“另存为”对话框确定目标路径 (savePath)   │
│  2. 后台隐蔽 WebviewWindow 挂载 Frozen HTML             │
│  3. 监听渲染完成屏障 (pagedjs:rendered)                │
│  4. 调用原生 PrintToPdfDirect 接口静默写出 PDF 文件    │
│  5. 返回完成状态与物理文件大小至前端通知横条            │
└────────────────────────────────────────────────────────┘
```

---

### 3. 本地文件系统直通（Native File I/O）

- **打开文件**：调用 `@tauri-apps/plugin-dialog`，支持系统原生多选打开 `.md`、`.markdown`、`.markflow.html`。
- **原位保存 (`Ctrl+S` / `Cmd+S`)**：
  - 若文档已关联磁盘真实物理路径（`filePath !== null`），按快捷键瞬间通过 `@tauri-apps/plugin-fs` 静默写回磁盘，状态栏即刻清除未保存标记。
  - 若为新建未落盘草稿，弹起原生“另存为”对话框并建立绑定。
- **双模降级**：若运行在纯 Web 浏览器环境下，平滑回退为现有的 IndexedDB 暂存与浏览器文件下载，100% 保证既有功能零回归。

---

### 4. 实施阶段与验证计划 (Phased Milestones)

- **阶段 T0：Tauri v2 脚手架与双模构建验证**
  - 初始化 `src-tauri` 目录（Tauri 2.0 配置、`Cargo.toml`、`capabilities/` 权限最小化）。
  - 配置 `tauri.conf.json` 指向现有的 `dist/`，配置端口 `3000`。
  - 验证 `npm run build`、`cargo check` 与 Web 端所有单元测试（15 个测试套件，76 项测试）保持 100% 通过。
- **阶段 T1：平台抽象层与文件系统直通**
  - 在 `src/core/platform/` 下建立 `desktop.ts`，导出 `isTauri()` 环境探测与统一文件 I/O 接口。
  - 改造顶栏/侧栏“新建”、“导入”与“保存”逻辑，桌面端支持原生选择器与原位覆盖。
- **阶段 T2：无弹窗静默 PDF 原生导出实现**
  - 在 Rust 端实现跨平台 `export_pdf_direct` 指令。
  - 在 `ExportModal.tsx` 中识别桌面环境，将“唤起系统打印”升级为“直接导出并保存为 PDF 文件”。
- **阶段 T3：DOCX / HTML / Markdown 原生文件导出**
  - 结合 `@tauri-apps/plugin-fs` 与 `@tauri-apps/plugin-dialog`，实现一键原生导出与落盘提示。
- **阶段 T4：窗口定制、字体回退与 CI 矩阵打包**
  - macOS 沉浸式标题栏配置与 Linux 开源中文字体回退。
  - 配置 GitHub Actions `tauri-action`，产出 Windows `.msi`/`.exe`、macOS `.dmg`、Linux `.deb`/`.AppImage`。
