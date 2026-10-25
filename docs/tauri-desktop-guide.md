# MarkFlow (墨流) Tauri 桌面端开发与构建指南

本文档介绍如何在本地开发、调试与打包 MarkFlow 桌面客户端，以及多平台 CI/CD 自动化构建配置。

---

## 1. 架构总览

MarkFlow 采用 **双模同源（Zero-Breakage Dual-Target）架构**：
- **Web SPA**：运行于纯浏览器与 PWA 环境，零服务端依赖，基于 IndexedDB 本地暂存与标准 Blob 下载；
- **Tauri 桌面端**：基于 Tauri v2 + Rust 原生层，轻量极速（~15MB 安装包，<80MB 内存占用），调用各系统底层原生渲染器（WebView2 / WKWebView / WebKitGTK）直接导出矢量 PDF，并支持系统磁盘文件原位读写与全屏文件拖拽打开。

所有桌面原生能力均通过 `src/core/platform/desktop.ts` 封装，通过 `isTauri()` 在运行时无感自适应与平滑降级。

---

## 2. 本地开发前置环境准备

### 2.1 基础依赖（全平台）
- **Node.js**：v18 或更高版本（推荐 v20 / v22）
- **Rust & Cargo**：v1.75 或更高版本（执行 `rustup default stable`）

### 2.2 平台特有依赖

#### Windows
- **Microsoft Edge WebView2**（Windows 10/11 已内置；Win 7/8 自动通过 Bootstrapper 静默安装）；
- **Visual Studio C++ Build Tools**（或安装了 C++ 工作负载的 Visual Studio）。

#### macOS
- **Xcode Command Line Tools**：
  ```bash
  xcode-select --install
  ```

#### Linux (Debian / Ubuntu / Deepin)
需要安装 WebKitGTK 4.1 与系统开发库：
```bash
sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  fonts-noto-cjk
```

---

## 3. 本地运行与调试

### 3.1 启动桌面端调试环境
在项目根目录下运行：
```bash
npm run tauri dev
```
此命令将：
1. 在后台拉起 Vite 开发服务器（`http://localhost:3000`）；
2. 启动 Rust 编译并将桌面窗口绑定到本地开发服务器；
3. 支持前端代码的热重载（HMR）与 Rust 后端的快速重新编译。

---

## 4. 生产包构建与产物分发

### 4.1 本地打包命令
在当前系统下生成独立生产安装包：
```bash
npm run tauri build
```

### 4.2 产物输出路径
构建产物将输出至：`src-tauri/target/release/bundle/`

| 平台 | 安装包格式 | 输出文件类型 | 说明 |
| :--- | :--- | :--- | :--- |
| **Windows** | MSI / EXE | `msi/*.msi`<br>`nsis/*.exe` | 包含向导式安装器与免安装便携版本 |
| **macOS** | DMG / APP | `dmg/*.dmg`<br>`macos/*.app` | 推荐使用 Universal 通用二进制架构 |
| **Linux** | DEB / AppImage | `deb/*.deb`<br>`appimage/*.AppImage` | 适配 Debian/Ubuntu 及通用 Linux 发行版 |

---

## 5. 跨平台 CI/CD 自动化构建

仓库已内置 `.github/workflows/tauri-build.yml` 工作流。

### 自动化触发规则
- **发布标签**：推送形如 `v0.9.1` 的 Git Tag 时自动触发三端矩阵打包；
- **手动触发**：在 GitHub Actions 页面通过 `workflow_dispatch` 手动运行；
- **产物收集**：自动将 Windows、macOS 和 Linux 的最终安装包归档并发布至 GitHub Release 草稿。

---

## 6. 常见问题排查 (Troubleshooting)

1. **Linux 下找不到 `webkit2gtk-4.1`**：
   确保安装的是 `libwebkit2gtk-4.1-dev` 而不是旧版的 `webkit2gtk-4.0`。
2. **macOS 沉浸式标题栏红绿灯位置调整**：
   在 `src-tauri/tauri.conf.json` 中配置 `titleBarStyle: "Overlay"`，即可启用顶栏与系统红绿灯无缝融合的沉浸式视觉。
3. **PDF 导出在不同平台的字体展现**：
   桌面端导出 PDF 时优先读取系统字体库。建议正文指定标准字体栈（Windows: `Microsoft YaHei` / `SimSun`；macOS: `PingFang SC` / `Songti SC`；Linux: `Noto Sans CJK SC` / `WenQuanYi Micro Hei`），以保证各平台输出的视觉统一性。
