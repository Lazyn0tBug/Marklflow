# MarkFlow (墨流) Tauri 桌面端架构与导出设计方案

日期：2026-10-25  
分支：`tauri`  
状态：设计阶段（待确认）  
目标基准：遵循总体设计方案与 HTML/PDF 导出规范，不破坏 Web 纯静态独立部署与零服务端依赖。

---

## 1. 目标定位与核心原则

### 1.1 功能语义重构：由“打印”回归“导出”
- **痛点反思**：在 Web 纯前端环境下，导出 PDF 通常借由 `window.print()` 的系统打印机对话框曲线救国；但由此带来了隐藏 `iframe` 打印上下文断裂、样式与外层宿主互相干扰、用户必须手动选择“另存为 PDF”等缺陷。
- **桌面端核心语义**：桌面应用本质上**不需要打印预览界面**，用户的诉求是**明确的文件格式导出（Document Export）**：
  1. **PDF 导出**：一键生成标准 A4 矢量 PDF，支持静默落盘至用户指定路径，保持 Paged.js 物理分页精度。
  2. **DOCX 导出**：原生 OpenXML 二进制生成并直接保存至系统磁盘。
  3. **可编辑 / 静态单文件 HTML 导出**：内嵌所有矢量图与公式资产，直接写出到系统路径。
  4. **Markdown 原文及载荷导出**。
- **本地文件系统直通（Native File I/O）**：
  支持直接通过原生对话框打开本地 `.md` 文件，编辑后按 `Ctrl+S` 原位覆盖保存，摆脱浏览器沙箱只能“下载副本”的限制。

### 1.2 架构原则
1. **渐进增强与双模同源（Zero-Breakage Dual-Target）**：
   - 保持现有纯 Web SPA、PWA 和嵌入式 iFrame 环境 100% 独立可用与零破坏。
   - 前端业务逻辑与宿主平台完全解耦，所有桌面特有能力通过**抽象平台适配层（Platform Adapter Layer）**按需加载。
2. **轻量纯粹（No Headless Chromium Bloat）**：
   - 坚决**不引入** Puppeteer、Playwright 或 Chromium 巨型二进制（避免 150MB+ 体积与高内存损耗）。
   - 充分利用 Tauri v2 与三大操作系统原生 WebView 底层的矢量 PDF 生成与渲染能力。

---

## 2. 操作系统差异与原生 WebView 兼容性矩阵

Tauri 采用各系统的原生 WebView 引擎（基于 Wry），各平台在 PDF 导出、字体排版及渲染机制上存在本质差异：

| 平台 | 底层渲染器 | PDF 导出底层实现方式 | 排版与字体兼容重点 | 窗口与快捷键适配 |
| :--- | :--- | :--- | :--- | :--- |
| **Windows** | **Edge WebView2**<br>(Chromium Blink) | 调用 WinRT/COM 原生 `CoreWebView2.PrintToPdfAsync(path, settings)`，可无弹窗静默导出高质量矢量 PDF。 | 兼容性最佳。默认自带微软雅黑 (Microsoft YaHei)、Segoe UI。完全支持 CSS Paged Media 规范。 | 标准系统边框或无边框拖拽区 (`data-tauri-drag-region`)；默认快捷键为 `Ctrl`。 |
| **macOS** | **Apple WKWebView**<br>(WebKit) | 调用 Cocoa 原生 `[WKWebView createPDFWithConfiguration:completionHandler:]` (macOS 11+)，直接从渲染树抓取矢量 PDF。 | WebKit 对字体基线度量与 Blink 存在亚像素级差异；中文字体栈首选苹方 (PingFang SC)；支持 `-webkit-print-color-adjust: exact`。 | 原生 Traffic Light 红绿灯控制，支持沉浸式透明标题栏 (`titleBarStyle: Overlay`)；默认快捷键为 `Cmd (⌘)`。 |
| **Linux** | **WebKitGTK**<br>(GTK3 / GTK4) | 调用 `webkit_print_operation_print()`，绑定 `GtkPrintSettings` 输出 URI 直接落盘为 PDF。 | 发行版字体差异显著。极简发行版可能缺失中文字体，需预置开源字体回退（Noto Sans CJK / 文泉驿微米黑）；需打包 `libwebkit2gtk-4.1` 依赖。 | 遵循系统 GTK 主题与窗口管理器规则；快捷键为 `Ctrl`。 |

---

## 3. 详细架构设计

### 3.1 分层架构模型

```text
┌─────────────────────────────────────────────────────────────────┐
│                     MarkFlow 核心 UI 与编辑排版层                 │
│  (React 19, Tailwind, Editor, A4PagePreview, MathJax, Mermaid)  │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                    平台抽象层 (src/core/platform)                 │
│  ┌─────────────────────────────┐ ┌───────────────────────────┐  │
│  │   IStorage / IFileSystem    │ │      IDocumentExporter    │  │
│  └──────────────┬──────────────┘ └─────────────┬─────────────┘  │
└─────────────────┼──────────────────────────────┼────────────────┘
                  │ 运行期环境探测 (isTauri)       │
         ┌────────┴────────┐            ┌────────┴────────┐
         ▼                 ▼            ▼                 ▼
┌────────────────┐ ┌───────────────┐ ┌────────────┐ ┌───────────────┐
│ Web 标准实现    │ │ Tauri 原生实现│ │ Web 导出    │ │ Tauri 原生导出│
│ - IndexedDB    │ │ - plugin-fs   │ │ - Blob下载 │ │ - 原生保存对话框│
│ - input[file]  │ │ - plugin-dialog│ │ - window   │ │ - WebView2 /  │
│                │ │ - 原位文件保存 │ │   .print() │ │   WebKit 原生PDF│
└────────────────┘ └───────────────┘ └────────────┘ └───────────────┘
                                                │
                                                ▼ (通过 IPC invoke)
                                   ┌───────────────────────────────┐
                                   │  Tauri Rust 宿主层 (src-tauri) │
                                   │  - 独立隐藏 Worker 窗口渲染    │
                                   │  - 调起底层 PrintToPdf 原生接口│
                                   │  - 物理路径直接落盘写出文件     │
                                   └───────────────────────────────┘
```

### 3.2 导出语义全流程设计

#### PDF 导出（核心突破）
1. **排版冻结**：前端 `htmlExporter.ts` 将当前文档、主题配置、MathJax 渲染结果、SVG 图表、Paged.js 分页样式完整打包为自包含 Frozen HTML。
2. **IPC 传输**：前端向 Tauri 后端发起命令：`invoke('export_pdf_direct', { html, targetPath, pageSettings })`。
3. **后台无感渲染**：
   - Rust 后端在隐藏的专用渲染上下文（Off-screen Webview）加载此 HTML。
   - 等待 Paged.js 的 `pagedjs:rendered` 事件确认分页与样式已完全就绪。
4. **底层生成与写入**：
   - Windows：调用 WebView2 的 `PrintToPdfAsync`。
   - macOS：调用 WKWebView 的 `createPDFWithConfiguration`。
   - Linux：调用 WebKitGTK 的 `WebKitPrintOperation`。
   - 直接写出到用户在系统“另存为”对话框中选定的磁盘文件路径，避免多余的打印机选择流程。

#### DOCX / HTML / Markdown 导出
- 前端已有成熟的 `exportDocumentToDocx` (docx.js) 和 `generateExportHtml`。
- 在 Tauri 环境下，直接弹出原生文件保存对话框（`@tauri-apps/plugin-dialog`），获取保存路径后通过 `@tauri-apps/plugin-fs` 写入磁盘，完成瞬间提示“导出成功并已保存到：xxx”。

### 3.3 原生文件系统交互设计

```typescript
export interface NativeFileSession {
  filePath: string | null;  // 若为 null 表示尚未落盘的草稿
  isDirty: boolean;
}

export interface PlatformFileSystem {
  openFile: () => Promise<{ path: string; content: string; title: string } | null>;
  saveFile: (path: string, content: string) => Promise<void>;
  saveFileAs: (defaultName: string, content: string) => Promise<string | null>;
}
```
- **快捷键 `Ctrl+S` / `Cmd+S`**：
  - 若当前文档绑定了系统真实路径（`filePath !== null`），直接静默回写该磁盘文件，状态栏瞬间消除 `dirty` 标记；
  - 若未绑定，调起原生“另存为”对话框，成功后将文档与该路径建立绑定。

---

## 4. 实施里程碑计划 (Milestones)

### 阶段 T0：环境搭设与双模脚手架初始化
- 引入 Tauri v2 CLI 与 Rust 工程目录模板（`src-tauri/`）。
- 配置 `tauri.conf.json`：
  - 应用标识：`com.markflow.desktop`。
  - 窗口尺寸：初始 1200×800，最小 800×600。
  - 安全配置：CSP 保持与当前 Web 安全基线一致，开启 `@tauri-apps/plugin-fs` 和 `@tauri-apps/plugin-dialog` 权限。
- 保证 `npm run build` 和 `cargo check` 互不干扰，原有的 Web CI 测试全部保持绿灯。

### 阶段 T1：平台抽象层与文件系统适配
- 封装 `src/core/platform/desktop.ts` 运行时检测与统一接口。
- 为 `Sidebar.tsx` 与顶栏增加“从本地打开”与“原位保存”逻辑（在 Web 端平滑降级）。

### 阶段 T2：无打印机弹窗的纯粹 PDF 原生导出
- 在 Rust 层编写跨平台 PDF 导出指令：
  - 基于 WebView 原生底层 API 的静默转换。
  - 前端等待导出完成进度指示条（Progress Indicator）。
- 在 `ExportModal.tsx` 中适配：在桌面环境下显示“直接导出并保存为 PDF 文件”，一键选路径即生成。

### 阶段 T3：系统级细节打磨与体验强化
- **macOS**：配置左上角原生红绿灯，支持窗口拖拽区域（`data-tauri-drag-region`）。
- **Windows / Linux**：适配紧凑型标题栏与深色模式系统集成。
- **关联打开**：支持右键 `.md` 文件“使用 MarkFlow 打开”。

### 阶段 T4：自动化打包与跨平台编译流水线
- 配置 GitHub Actions（基于 `tauri-apps/tauri-action`），实现三端自动编译：
  - Windows: `.msi` 安装包与便携 `.exe`。
  - macOS: 通用二进制 `.dmg` (Universal, 支持 Intel 与 Apple Silicon)。
  - Linux: `.deb` 与通用 `.AppImage`。

---

## 5. 验收准则 (Acceptance Criteria)

1. **同源零破坏**：Web 版在浏览器、iframe 预览及 PWA 模式下功能 100% 正常，无任何 Tauri 依赖缺失报错。
2. **纯粹导出语义**：在桌面端点击“导出 PDF”，无需用户从打印机列表中寻找“另存为 PDF”，而是直接调起系统“保存文件”对话框生成清晰矢量 PDF。
3. **极小体积**：打包产物安装包体积控制在 15MB 以内，运行时内存占用明显低于同类 Electron 应用（< 100MB）。
4. **离线与断网能力**：所有字体、公式、图表在无公网连接的纯内网离线环境下均可完美渲染与导出。
