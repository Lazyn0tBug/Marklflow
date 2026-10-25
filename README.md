# MarkFlow (墨流) - 专业级技术 Markdown 编辑与排版工作台

> **0.9.1 · html分支**：HTML兼容性改造与审查修复版本，暂未合并到main。完整设计基线、实施现状与验证边界见[文档导航](docs/README.md)，变更见[CHANGELOG](CHANGELOG.md)。设计中的规划项不自动等于已实现；Word/WPS、系统打印等仍需独立验收。

<p align="center">
  <strong>开箱即用 · 深度数学公式与图表 · A4 分页与流式预览 · 三视图独立控制 · 双向同步滚动 · 多格式专业导出</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19.0-61dafb?logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-7.0-3178c6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-8.3-646cff?logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/TailwindCSS-v4-38bdf8?logo=tailwindcss&logoColor=white" alt="TailwindCSS" />
  <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License" />
</p>

---

## 📖 项目简介 (Overview)

**MarkFlow (墨流)** 是一款专为工程技术人员、科研学者、高校师生及技术写作者打造的现代化 Markdown 编辑与文档排版工作台。

它不仅解决了传统 Markdown 工具在复杂长文档中**滚动割裂、排版脱节、打印失真、公式渲染卡顿**的痛点，更提供了**大纲目录、源代码编辑器、HTML 预览区**三视图完全解耦独立的自由布局能力，并支持在浏览器端直接导出高保真单文件 HTML、原生 Microsoft Word (.docx) 以及矢量 A4 打印 PDF。

---

## ✨ 核心特性 (Key Features)

### 1. 🎛️ 三视图独立控制与弹性布局 (Independent 3-View Workbench)
- **大纲视图 (Outline)**：采用右侧/左侧边栏悬浮 Rail 控制，支持一键点击抽屉式收起与展开，收起时自动转化为细长快捷呼出条，彻底归还纯净内容视野。
- **编辑器与预览独立开关 (Editor & Preview Toggles)**：顶部工具栏提供独立的编辑器与 HTML 预览显隐开关：
  - 隐藏大纲 $\rightarrow$ 纯粹双栏写作与预览
  - 隐藏编辑器 $\rightarrow$ 沉浸式文档阅读与大纲快速跳转模式
  - 隐藏预览 $\rightarrow$ 极致纯净的代码/Markdown 撰写模式
  - 支持任意单视图、双视图或全三视图自由组合。
- **可配置最大内容宽度 (Configurable Max Width)**：
  - 编辑器与 HTML 预览默认采用黄金阅读宽度 **1024px**（通过顶部“设置”弹窗切换为 **800px / 1024px / 1280px / 1440px / 100% 全宽**），并自动水平居中呈现，告别超宽屏幕下文字拉伸导致的不适体验。

### 2. 🔄 毫秒级双向同步滚动 (Synchronized Bi-directional Scroll)
- **大纲 $\rightarrow$ 编辑器与 HTML**：点击大纲章节标题，编辑器与 HTML 预览同步平滑滚动，使目标标题精准居顶。
- **编辑器 $\rightarrow$ HTML 与大纲**：编辑器滚动时，HTML 视图按源码行与对应 DOM 区块比例同步滚动；大纲树自动高亮视口中央所归属的当前章节（边框加粗高亮强调）。
- **HTML $\rightarrow$ 编辑器**：预览区翻阅滚动时，编辑器无缝跟随。
- **防抖与反馈死循环抑制**：内置毫秒级滚动锁机制，彻底消除两端相互触发导致的页面抖动或死循环。

### 3. 📐 深度数学公式双引擎 (Dual Math Rendering Engines)
- 内置 MathJax 核心，支持当前 MathJax 已启用包中的 LaTeX 数学语法，未知命令明确报错（行内公式 `$E=mc^2$`，块级公式 `$$\int_0^\infty e^{-x^2} dx = \frac{\sqrt{\pi}}{2}$$`）。
- **MathML 极速引擎**：利用现代浏览器原生 MathML 渲染能力，毫秒级流式呈现，内存占用低，字体与排版自然融入正文。
- **SVG 矢量引擎**：生成像素级精准、缩放不失真、兼容性极佳的矢量图形，适用于学术论文或出版物打印。

### 4. 📊 图表与可视化支持 (Mermaid Diagrams & Visuals)
- 原生集成 Mermaid 流程图、时序图、甘特图、状态图及类图。
- 代码块标记为 ````mermaid`` 即可自动转绘为自适应容器宽度的 SVG 矢量图，支持暗色与亮色模式自适应。

### 5. 📑 真实 A4 分页模拟与流式双模 (A4 Pagination & Continuous Flow)
- **连续流式模式 (Continuous Flow)**：适合日常撰写与快速浏览，排版随视口宽度流式伸展。
- **A4 分页仿真模式 (A4 Print Preview)**：真实模拟标准 A4 页面物理边距（210mm × 297mm）、阴影与分页虚线，支持独立段落分页指令 `---pagebreak---`；分页预览与原生打印结果分别核验。

### 6. 💾 纯本地优先与文档管理 (Local-First Architecture)
- 基于浏览器原生 **IndexedDB** 构建的高性能本地存储。
- 毫秒级自动持久化，断电或意外刷新无缝恢复。
- 内置文档管理器，支持新建文档、重命名、本地导出备份与 `.md` 外部文件直接导入。

### 7. 📤 多格式专业导出引擎 (Multi-Format Export)
- **单文件独立 HTML (.html)**：将样式表、MathML/SVG 矢量图、排版脚本完整内嵌为单个离线文件，断网随时查看。
- **原生微软 Word (.docx)**：基于 `docx` 引擎在浏览器端直接生成原生 Word 格式文档，精确映射标题层级、代码块、引用块与表格。
- **矢量 A4 PDF 打印**：调起系统级打印驱动，专有 `@media print` 样式自动剥离所有界面边框、工具栏与控件，纯净输出专业级排版文件。

---

## ⚖️ 典型 Markdown 编辑/阅读器横向对比 (Comparison)

### 💡 核心设计哲学的本质差异：以 HTML 为同步投影的极简架构

在现存的 Markdown 工具生态中，多数软件将 Markdown 视为**专有富文本状态机**（如 Typora）、**知识图谱节点**（如 Obsidian）、**代码文件的附加产物**（如 VS Code）或**私有块级对象**（如 Notion）。这些方案在面临**导出、分页、打印与复杂渲染**时，往往需要引入多重 AST 转换管线、依赖重量级的外部二进制工具链（如 Pandoc、LaTeX 编译器）或后台无头浏览器（Puppeteer/Chromium）。

**MarkFlow 的核心设计哲学：**
> **Markdown 原文是权威来源；标准 HTML 是阅读、预览与视觉输出的共同投影，结构化模型保持语义。**

- **统一渲染与输出管线**：Markdown 源码仅做一步解析，直接投影为携带块级锚点的标准语义 HTML DOM。后续的**屏幕实时预览**、**流式自适应**、**A4 物理分页排版**、**单文件独立 HTML 导出**、**Word (.docx) 导出**与**矢量 A4 PDF 打印**，全部收敛在这一套 HTML 标准切面上。
- **免除重型外部依赖**：彻底摆脱了 Pandoc、Electron 后台守护进程与无头 Chromium 打印池的沉重负担，在浏览器端仅需数十毫秒即可完成高保真转换。
- **所见即所印的绝对一致性**：由于编辑预览、A4 分页与最终导出均使用同一份 HTML 及其 CSS 媒体查询规则，彻底消除了传统工具中“屏幕预览与实际导出样式断裂”的痛点。

#### 📐 架构管线与设计哲学对比

| 架构维度 | MarkFlow (以 HTML 为单一投影切面) | 传统双栏/插件式 (VS Code + MPE) | 所见即所得富文本 (Typora) | 双链网状知识库 (Obsidian) | 块级协作平台 (Notion) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **核心设计思想** | **以标准 HTML 为统一投影中枢**，以 Web 原生标准通揽渲染、分页与导出 | **通用 IDE 宿主 + 隔离沙箱**，插件化扩展，依赖进程间消息通信 | **源码即渲染视图 (WYSIWYG)**，编辑即排版，弱化原始标记暴露 | **知识图谱优先 (PKM)**，以本地 Vault 文件库与双链关联为中心 | **面向对象的结构化 Block 树**，脱离原生 Markdown 语法体系 |
| **中间媒介与复杂度** | **极简单一切面**：<br>`Markdown ➔ 标准 HTML`<br>预览、分页、公式与导出均基于此单一切面 | **多层沙箱与转换**：<br>源码 ➔ AST ➔ Webview Iframe ➔ 外部插件 RPC 消息 | **动态富文本树**：<br>内部状态机维护可编辑 DOM 树与底层 Markdown 文本同步 | **分层插件管线**：<br>基于 CodeMirror 6 插件链 + 外部插件生态装饰 | **专有 JSON 块树**：<br>Block Tree ➔ 专有渲染层 ➔ 导入/导出格式逆向转换 |
| **A4 分页与打印实现** | **CSS Paged Media 原生驱动**：<br>同一套 HTML 借由 CSS 媒体查询与物理尺寸样式，直接实现界面分页仿真与系统级直印 | **依赖外部无头服务**：<br>后台调起无头 Chromium / Puppeteer 实例进行屏幕快照渲染 | **专有 Electron 打印**：<br>依靠桌面端渲染窗口打印，编辑区缺乏实时的纸张分页物理感知 | **社区打印插件**：<br>需编写复杂的自定义 CSS Snippets，分页符难以精准控制 | **云端异步排版**：<br>服务端 API 异步生成 PDF，跨页排版经常发生截断与格式错乱 |
| **Word (.docx) 导出机制** | **前端 DOM 语义直接映射**：<br>直接基于标准 HTML 语义元素 1:1 直出原生 Word 结构，零环境依赖 | **依赖本地 Pandoc 外部工具链**：<br>需在操作系统预装 Pandoc 并配置全局环境变量 | **依赖本地 Pandoc 外部命令**：<br>需单独安装并关联本地 Pandoc 可执行文件 | **依赖 Pandoc 插件与外部依赖**：<br>需安装第三方社区插件及外部依赖环境 | **云端黑盒格式转换**：<br>转换常丢失复杂表格边框与 LaTeX 科学公式 |
| **系统运行时开销** | **极度轻量 (~1-2MB)**：<br>纯 Web 静态载荷，完全复用现代浏览器原生排版内核 | **极度重度 (>500MB)**：<br>庞大桌面 IDE 核心 + 插件宿主进程 + Node 运行时 | **中度 (~150MB)**：<br>独立 Electron 打包进程与专有富文本渲染器 | **中重度 (~200MB)**：<br>Electron 容器 + 动态加载的数十个社区插件 | **重度且受限网络**：<br>重型 Web SPA，离线支持受限且强依赖服务端计算 |

---

### 📊 功能与排版体验特性对比

为了进一步展示实际功能层面的差异，下表横向对比了各工具在具体排版能力上的支持情况：

| 评估维度 | MarkFlow (本项目) | Typora | Obsidian | VS Code + MPE 插件 | Notion |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **软件定位** | 专注出版级排版与多模预览的现代化工作台 | 桌面端所见即所得 (WYSIWYG) 写作工具 | 基于双链与本地 Vault 的知识库管理 (PKM) | 通用代码开发与技术文档编写工具 | 块级协作笔记与知识管理云平台 |
| **部署与运行形态** | **Web 零安装即开即用**，纯本地优先 (IndexedDB)，支持私有化部署 | 桌面端专有软件（付费买断） | 桌面端/移动端本地软件（免费+付费同步） | 桌面端重度 IDE（需配置环境与插件） | 云端 Web/桌面端（强依赖网络与账号） |
| **多视图布局自由度** | **3 视图独立开关与自由组合**<br>（大纲抽屉 / 源码编辑器 / HTML 预览），容器宽度自由配置 | 单一内容区，侧边栏目录与源码模式互斥切换 | 左右分栏或标签页，无独立视口最大宽度调节 | 传统对半双分栏，缺乏针对单视图的独立控制 | 纯单栏块级流动，无 Markdown 源码视口 |
| **A4 物理分页仿真** | **原生支持**<br>标准 A4 页面物理边距、阴影、分页虚线与 `<div class="page-break"></div>` 强制定点分页 | 仅打印时通过 CSS 生效，编辑界面无 A4 实体纸张分页视觉反馈 | 默认无，需依赖第三方 Print 插件或复杂 CSS Snippets | 依赖无头 Chromium/Puppeteer 脚本，编辑区无实时分页视效 | 不支持 A4 物理页面仿真与定点分页符 |
| **数学公式渲染** | **LaTeX 双引擎**<br>⚡ MathML（原生秒开）<br>🎨 SVG（矢量高清印刷级） | 默认 MathJax，无轻量级 MathML 原生模式切换 | KaTeX / MathJax，不支持一键切换渲染引擎模式 | 依赖插件配置 KaTeX/MathJax | 基础 KaTeX，复杂宏包与跨行公式兼容度有限 |
| **双向同步滚动** | **AST 块级平滑差值插值**<br>带双向死循环防护锁，平滑无卡顿与跳跃 | 所见即所得无此场景，源码模式下无实时双向对比 | 双栏模式下常有行高不一致导致的错位与抖动 | 基于行号映射，在长代码块或复杂表格易产生偏差 | 块级结构，不涉及 Markdown 源码双向滚动 |
| **图表解析能力** | **原生 Mermaid 9.x+**<br>流程图、时序图、甘特图矢量自适应，明暗主题感知 | 内置 Mermaid，但自定义样式与缩放较为固定 | 内置 Mermaid，深浅色跟随主题 | 插件支持，需加载重度离线依赖 | 有限支持或需嵌入第三方 Widget |
| **原生 DOCX 导出** | **纯前端零后端直出**<br>原生生成标准微软 Word (.docx)，结构化映射标题与样式 | 依赖本地安装 Pandoc 外部工具链命令行 | 需安装 Pandoc 插件并配置外部可执行文件路径 | 依赖 Pandoc 命令行调用 | 支持导出 Word，但公式常丢失或转为纯文本 |
| **独立 HTML 导出** | **单文件完整离线打包**<br>内嵌样式、MathML/SVG 矢量与渲染脚本，断网即开 | 支持导出 HTML，样式依赖本地配置模板 | 依赖插件导出，外部依赖资源易路径失效 | 插件支持单文件导出，但文件体积通常偏大 | 导出为 HTML 压缩包，散落多级媒体文件夹 |
| **数据隐私与安全** | **100% 数据驻留本地**<br>不上传任何服务器，无需注册与鉴权 | 本地文件，隐私安全 | 本地文件，隐私安全 | 本地文件，隐私安全 | 存储于服务商云端数据库，受网络与合规限制 |

### 🎯 场景选型建议 (Which One to Choose?)

- **选择 MarkFlow**：当您需要**快速排版专业级文档**、**精确控制打印分页与 A4 效果**、**编写大量科技公式**，或需要将 Markdown **一键无缝转换为原生 Word (.docx) 与独立离线 HTML**，且希望在任何浏览器即开即用、完全私有。
- **选择 Typora**：当您偏爱极致沉浸式的**单栏所见即所得**键入体验，且无需频繁比对原始 Markdown 语法标记。
- **选择 Obsidian**：当您的核心诉求是**知识双链网络 (Zettelkasten)**、海量笔记网状关联与复杂插件生态管理。
- **选择 VS Code**：当您正在开发代码工程，顺带编写项目配套的 `README` 或技术变更日志。
- **选择 Notion**：当您需要团队多人在线实时协同、关系型数据库表格或无形结构化看板。

---

## 🏗️ 技术架构 (Architecture)

```
markflow/
├── src/
│   ├── App.tsx                     # 应用主入口，组装工作台状态与核心布局
│   ├── index.css                   # 全局样式与 Tailwind CSS 引入
│   ├── main.tsx                    # React 挂载点
│   ├── components/
│   │   ├── header/                 # 顶部导航、文档标题与全局操作
│   │   ├── toolbar/                # 跨视图统一工具栏（快速排版、插入、统计、视图开关）
│   │   ├── editor/                 # 源码编辑器、行号与高亮输入
│   │   ├── preview/                # HTML 渲染预览区（流式/A4分页切换）
│   │   ├── workspace/              # 悬浮 Rail 侧边栏与大纲目录视图
│   │   ├── export/                 # 导出模态框（HTML、DOCX、PDF）
│   │   └── footer/                 # 状态栏（字数统计、行数、保存状态指示）
│   └── core/
│       ├── model/                  # 文档模型、草稿与章节元数据定义
│       ├── parser/                 # Markdown 解析器与块级 AST 映射
│       ├── render/                 # 数学公式 (MathML/SVG) & Mermaid 渲染器
│       ├── storage/                # IndexedDB 异步本地持久化驱动
│       └── export/                 # HTML/DOCX/PDF 导出生成模块
├── TUTORIAL.md                     # 详尽的图文使用指南与语法教程
└── package.json                    # 依赖清单与脚本命令
```

---

## 🚀 快速上手 (Getting Started)

### 环境依赖
- Node.js >= 18.0.0
- npm >= 9.0.0 (或 pnpm / yarn / bun)

### 1. 克隆与安装依赖
```bash
git clone <repository-url>
cd markflow
npm install
```

### 2. 启动开发服务器
```bash
npm run dev
```
开发服务器将默认运行在 `http://localhost:3000`。

### 3. 构建生产包
```bash
npm run build
```
构建产物将输出至 `dist/` 目录，可直接部署至任何静态托管平台（GitHub Pages、Vercel、Cloudflare Pages 等）。

### 4. 代码类型检查
```bash
npm run lint
```

---

## 📚 教程与使用指南 (Documentation)

详细的功能操作指南、快捷键、数学公式范例与导出操作请参阅：
👉 **[完整使用教程与操作手册 (TUTORIAL.md)](./TUTORIAL.md)**

---

## 💡 键盘快捷键与高效排版

| 快捷操作 | 功能说明 |
| :--- | :--- |
| `Ctrl / Cmd + B` | 加粗选中文本 (`**text**`) |
| `Ctrl / Cmd + I` | 斜体选中文本 (`*text*`) |
| `Ctrl / Cmd + K` | 插入超链接 (`[title](url)`) |
| `Alt + T` / `Ctrl + Shift + T` | 可视化/快捷插入 Markdown 数据表格 |
| `Alt + M` | 快速插入行内数学公式 (`$...$`) |
| `Alt + Shift + M` | 快速插入块级数学公式 (`$$...$$`) |
| `Ctrl / Cmd + P` | 快速调起 A4 矢量打印预览 |

---

## 📌 后续演进路线与待办清单 (Roadmap & TODO Backlog)

经架构设计与代码综合审查，以下进阶排版与输出优化项已暂存至待办储备池（TODO Backlog）：

1. **DOCX 公式进阶升级 (Word 原生 OMML 公式对象)**：
   - 接入 MathML 到 OpenXML OMML 格式映射，使生成的 Word (`.docx`) 文档在微软 Office 与 WPS 中呈现为可原生二次双击编辑的矢量公式对象。
Mermaid静态SVG封装已在0.9.1实现，接收方无需运行Mermaid引擎；已验证范围和限制见[审查记录](docs/reviews/html-review-2026-10-24.md)。

---

## 📄 开源许可证 (License)

本项目采用 [MIT License](LICENSE) 开源。欢迎自由使用、修改与二次分发。
