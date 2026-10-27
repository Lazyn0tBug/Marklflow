# MarkFlow (墨流) 本地资产支持与文档管理语义重构设计方案

- **日期**：2026-10-27
- **分支**：`tauri`
- **状态**：方案设计与规划阶段
- **核心目标**：
  1. 在 Tauri 桌面端实现对本地图片（PNG / JPG / SVG / WebP 等）的完整支持，包括绝对路径与相对于当前 Markdown 文档的相对路径解析。
  2. 重构“导入 / 打开 / 保存 / 另存为”的文档生命周期语义设计，理清本地原生文件系统直通与浏览器沙箱导入的心智模型差异，实现双模平滑共存。
  3. 保持现有 Web 纯前端 SPA、PWA 部署与 22 项 Playwright E2E 测试 100% 绿色兼容。

---

## 1. 背景与核心诉求

### 1.1 现状与痛点
- **痛点一：本地图片无法在预览视窗中显示**  
  在传统 Markdown 写作（如 Obsidian、Typora、VS Code）中，用户最常用的组织方式是将图片放在当前文档同级或子文件夹（例如 `![架构图](./images/arch.png)`），或直接引用本地绝对路径（`![图](C:\path\to\pic.png)`）。但在 WebView（Tauri 底层所使用的 WebView2 / WKWebView / WebKitGTK）中，由于浏览器的同源策略与本地文件系统隔离，直接加载 `file:///` 会被安全沙箱拦截；且相对路径在没有“当前文件磁盘基准目录”的前提下会直接报 404。
- **痛点二：“导入”与“打开”的心智模型混淆**  
  目前应用仅有“导入”按钮。在纯 Web 浏览器环境下，将本地文件读取为内存字符串载入工作区称为“导入”是合理的；但在桌面端，用户的核心心智是**“打开本地文件 (`Ctrl+O`)”**并在编辑后**“原地覆盖保存 (`Ctrl+S`)”**。原有的“导入”无法表达“与本地物理文件建立实时同步关联”的语义。

---

## 2. 本地图片与资产（PNG / JPG / SVG / WebP）支持架构

### 2.1 Tauri v2 `asset:` 自定义协议管道
Tauri v2 提供了专门解决本地文件加载的流式安全协议通道 `asset:`：
- **原理**：WebView 向 `asset://localhost/...`（Windows 下为 `http://asset.localhost/...`）发起静态资源请求，Tauri 底层 Rust 直接从操作系统磁盘流式读取数据，不占用 JS 引擎内存；
- **配置要点**：
  在 `src-tauri/tauri.conf.json` 中配置安全作用域（Scope）并在 CSP 中放行：
  ```json
  {
    "app": {
      "security": {
        "csp": "default-src 'self'; img-src 'self' asset: https://asset.localhost http://asset.localhost data: blob: https:; style-src 'unsafe-inline'; font-src data:;"
      }
    }
  }
  ```

### 2.2 路径解析器架构 (`src/core/platform/assetResolver.ts`)

为了同时兼顾 Web 端与桌面端，设计通用的路径解析流程：

```text
Markdown 原始图片链接: ![说明](src)
                  │
                  ▼
         [ 是否为外部/内联资源? ]
      (http://, https://, data:, blob:)
       ├── 是 ──► 原样放行
       └── 否 ──► [ 是否处于 Tauri 桌面端环境? ]
                     ├── 否 (纯 Web 端) ──► 保持相对路径或降级提示
                     └── 是 (Tauri 端) ──► [ 判断路径类型 ]
                                              │
                      ┌───────────────────────┴───────────────────────┐
                      ▼                                               ▼
               [ 绝对路径 ]                                     [ 相对路径 ]
          (C:\..., /Users/..., /home/...)              (./..., ../..., images/...)
                      │                                               │
                      │                                               ▼
                      │                                    [ 是否有当前文件本地路径 doc.filePath? ]
                      │                                     ├── 有 ──► 基准目录 + 相对路径 = 绝对路径
                      │                                     └── 无 ──► 提示用户先保存文档或保持未决
                      ▼                                               ▼
                      └───────────────────────┬───────────────────────┘
                                              │
                                              ▼
                                 Tauri convertFileSrc(absPath)
                                 转换为 asset://localhost/...
                                              │
                                              ▼
                                    htmlPolicy.ts 放行并渲染
```

### 2.3 关键边界与防裂图机制
1. **SVG 矢量的特别处理**：
   - SVG 既可能作为 `<img src="local.svg">` 加载，也可能内嵌。对于本地 `.svg` 文件，通过 `asset:` 协议正常走 `img` 渲染，受 MarkFlow 既有的 SVG 沙箱过滤保护，防止恶意脚本注入。
2. **导出单文件 HTML 与 DOCX 的自动离线化（Asset Inlining）**：
   - 当用户在 Tauri 桌面端把文档导出为 HTML 或 DOCX 时，`documentAssets.ts` 会遍历所有图片；
   - 若检测到 `asset:` 协议或本地文件，桌面端通过 `tauri-plugin-fs` 直接读取本地物理二进制并转为 Base64 Data URL 内嵌到输出结果中，保证**交付给第三方的文档在任意机器上打开绝不裂图**。

---

## 3. 文档管理语义重构设计：“打开” vs “导入” vs “保存”

### 3.1 概念与心智模型界定

| 操作 | 英文 | 核心操作对象 | 同步与生命周期语义 |
| :--- | :--- | :--- | :--- |
| **打开** | Open (`Ctrl+O`) | 本地磁盘中的 `.md` / `.markdown` / `.txt` 文件 | **建立磁盘关联**。记录 `filePath`，`Ctrl+S` 时**直接原地覆盖保存**；作为相对图片路径的基准锚点。 |
| **另存为** | Save As (`Ctrl+Shift+S`) | 当前工作区文档落盘到本地新文件 | 弹出系统文件保存对话框，成功后将当前文档的 `filePath` 更新为新路径。 |
| **导入** | Import | 外部载荷包（如 MarkFlow 可编辑 `.html`、ZIP、剪贴板载荷） | **脱离原文件**。解构载荷并加载到当前工作区，不绑定原磁盘路径，需明确另存或覆盖。 |
| **导出** | Export | HTML、DOCX、PDF、纯文本 MD | **产物发布**。针对受众格式生成冻结副本，不改变当前编辑态。 |

### 3.2 界面交互设计（UI / UX）

1. **顶栏操作区（TopBar）重构**：
   - 在 Tauri 桌面端模式下：
     - 将原本的「导入」按钮重构为更符合桌面习惯的组合按钮或下拉：
       - **主按钮「打开」**（带 `Ctrl+O` / `Cmd+O` 快捷键提示）：调用 Tauri 原生文件选择对话框；
       - 下拉菜单提供扩展项：
         - 📂 **打开本地文件...** (`Ctrl+O`)
         - 📥 **导入自包含 HTML 载荷...**（兼容从网页版导出的 `.html` 恢复编辑）
         - 📋 **从剪贴板导入 Markdown**
   - 在纯 Web 浏览器模式下：
     - 保留原本的「导入」按钮（调用 HTML5 `<input type="file">`），但在文案和图标上保持清晰规范。
2. **文档标题与状态展示（TitleBar / Status）**：
   - 当文档已经绑定本地路径时（`currentDoc.filePath` 存在）：
     - 标题旁轻量显示本地路径（例如 `~/Documents/report.md`）或支持右键复制路径/在文件管理器中显示；
     - 未保存修改时显示脏标记圆点 `●`；
     - 按 `Ctrl+S` 原位写出后，状态秒变“已保存至磁盘”。

---

## 4. 实施阶段规划（Step-by-Step Implementation Roadmap）

### 阶段一：Tauri 本地安全作用域与资产协议配置（Milestone 1）
- [ ] 检查并更新 `src-tauri/tauri.conf.json`，配置 `assetProtocol` 安全作用域（`scope: ["**"]` 或用户可访问范围）与 CSP；
- [ ] 确保 Rust 端 `tauri-plugin-fs` 具备文件读取与对话框权限。

### 阶段二：路径解析核心库与安全策略放行（Milestone 2）
- [ ] 在 `src/core/platform/` 中增加 `assetResolver.ts`：
  - 实现 `resolveMarkdownImageUrl(src, docFilePath)`；
  - 集成 `@tauri-apps/api/core` 的 `convertFileSrc`；
- [ ] 更新 `src/core/render/htmlPolicy.ts`：
  - 在 `safeUrl` 中为图片放行 `asset:`、`http://asset.localhost` 和 `https://asset.localhost` 协议；
- [ ] 在 Markdown 渲染钩子中植入图片路径重写逻辑。

### 阶段三：文档模型扩展与“打开/原地保存”桌面工作流（Milestone 3）
- [ ] 在 `DocumentRecord` 元数据中增加 `filePath?: string` 字段；
- [ ] 在 `src/core/platform/desktop.ts` 中实现：
  - `openLocalMarkdownFile()`：原生文件选择对话框 + 读取文本与路径；
  - `saveLocalMarkdownFile(path, content)`：直接写回本地物理文件；
- [ ] 绑定全局快捷键：
  - `Ctrl/Cmd + O` → 打开本地文件；
  - `Ctrl/Cmd + S` → 原位保存（若未绑定路径则触发另存为）；
  - `Ctrl/Cmd + Shift + S` → 另存为。

### 阶段四：UI 语义重构与导出离线化封锁（Milestone 4）
- [ ] 更新 `TopBar.tsx`：Tauri 下呈现“打开 / 导入 / 保存”精准语义；
- [ ] 更新 `documentAssets.ts`：导出 HTML/DOCX 时，自动将 `asset:` 协议的本地图片读取为 Base64 封存；
- [ ] 运行全量单元测试与 E2E 测试，确保零回归。

---

## 5. 验收标准与测试规范

1. **绝对路径测试**：在 Windows、macOS、Linux 下引用系统图片（如 `![test](C:\test.png)` 或 `![test](/tmp/test.png)`），预览区即时正常渲染；
2. **相对路径测试**：打开 `/path/to/doc.md`，文档内包含 `![logo](./sub/logo.png)`，预览区准确以 `/path/to/sub/logo.png` 加载；
3. **导出自包含验证**：带有本地图片的文档导出为 HTML 或 DOCX 后，在另一台无原图文件的计算机上打开，图片显示完好（已转为 Base64 内嵌）；
4. **Web 端零破坏**：Web 浏览器环境下的既有导入、编辑、导出功能不受任何影响，22 项 Playwright 测试继续保持 100% 通过。
