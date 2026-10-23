# Markdown 编辑器总体设计方案 V0.2

日期：2026-10-23  
状态：开发设计基线草案；尚未实现或完成技术验证。  
定位：开箱即用、支持公式与图表、具备 HTML 预览与多格式导出的 Markdown 编辑器。

本次修订：承接 V0.1，仅调整公式引擎、输出策略及相关模型、缓存、导出和验收要求。采用 MathJax 单一主引擎、LaTeX 数学输入、文档级 MathML/SVG 两种显示模式；默认模式由 P0 样例验证决定。其他技术选型和实施范围保持不变。

## 1. 产品目标与设计约束

### 1.1 核心目标

用户在 Markdown 编辑器中编写内容，获得语法高亮、实时预览、版式配置、资源管理和文件导出能力。HTML 是展示、预览和视觉输出的共同基础；结构化文档模型用于保持语义，并支撑可编辑 Word、PPTX 等输出。

“依赖少”的准确含义是统一管理开发依赖、消除用户自行准备转换环境的步骤。开发侧允许使用 npm 生态中的 JavaScript、TypeScript、WASM 和打包工具；发布产物必须包含相应运行资源。用户无需另行安装 Node、Python、TeX、Graphviz 命令行或办公软件，才能使用已发布的核心功能。

### 1.2 强制原则

1. Markdown 原文是内容的权威来源，不能从展示 DOM 反向猜测恢复原文。
2. 编辑器是核心产品，不能只提供粘贴 Markdown 后转换的表单。
3. 解析、渲染、分页、导出和持久化分离；插件不能直接控制保存逻辑。
4. 所有依赖通过统一包管理和构建流程发布；默认不调用外部转换程序。
5. 开发时可以有多个模块，用户文档默认单文件交付。
6. 无账号、无后端也能完成核心编辑、预览和导出；不自动上传正文。
7. 离线能力按资源清单验证，不能把“配置了 PWA”当成“全部功能可离线”。
8. 原生可编辑、视觉保真、文字可选取是不同能力，导出界面必须准确标注。

### 1.3 首版范围

首版发布包含 Markdown 编辑、高亮、撤销重做、查找替换、文件打开和下载保存、草稿恢复、大纲、阅读预览、A4 分页预览、主题、图片、数学公式、Mermaid、Graphviz、单文件 HTML、浏览器打印 PDF 和基础 DOCX。

后续扩展 EPUB、图片导出、PPTX、桌面文件关联和自动 PDF。首版不加入协同编辑、插件市场、任意脚本执行、AI 服务配置、PDF 反向编辑或 DOCX 往返转换。

## 2. 总体架构

```text
应用界面
  ├─ CodeMirror 编辑器：Markdown、光标、选区、事务历史
  ├─ 大纲 / 资源 / 主题 / 文件操作
  └─ 阅读预览 / A4 预览 / 导出面板
                 │ 编辑事务生成文档修订号
                 ▼
文档会话：Markdown + 元数据 + 主题 + 资源 + 修订号
                 ▼
解析适配器：Markdown → mdast → Document IR
                 ▼
渲染调度：正文 / 数学 / Mermaid / DOT → HTML / MathML / SVG / 资源
                 ▼
冻结的 RenderSnapshot：修订号、主题、渲染资源、诊断
  ├─ 阅读布局 → 流式 HTML
  ├─ 分页适配器 → A4 页面 → 打印 PDF
  ├─ HTML 打包 → 单文件阅读 / 可重新导入的 HTML
  └─ 导出协调器
       ├─ IR + 主题 + 渲染资源 → DOCX
       ├─ IR + XHTML + 资源 → EPUB
       ├─ 页面 / 图表 → PNG、SVG
       └─ 幻灯片模型 + 渲染资源 → PPTX

平台适配器：Browser / 可选 Electron
存储适配器：IndexedDB / 文件下载 / 可选桌面文件系统
```

IR 指内部文档结构，不要求写入本地中间文件。除显式保存或导出外，中间状态保存在内存；大型资源存入 IndexedDB。

核心模块不得导入 React、CodeMirror 或 Electron。浏览器 DOM 操作集中在渲染适配器和布局层；纯解析、模型迁移、诊断可以独立测试。

## 3. 技术选型

以下是建议选型，具体小版本在项目启动时锁定到 lockfile，不在设计中凭空指定未经验证的版本组合。

| 领域 | 建议 | 用途与边界 |
|---|---|---|
| 语言 | TypeScript，严格模式 | 核心、插件、应用共用类型 |
| 开发运行时 | 活跃 LTS Node.js | 仅开发、构建和 CI 需要；桌面版内部运行时随包发布 |
| 包管理 | npm + package-lock.json | 使用 npm ci 复现；单仓库起步，不先建立复杂 monorepo |
| 构建 | Vite | 静态部署、代码分割、Worker 和 WASM 资源打包 [S1] |
| UI | React | 管理面板与视图；正文编辑不走 React 逐字符重建 |
| 编辑 | CodeMirror 6 | Markdown 高亮、编辑事务、快捷键、选区和语言扩展；先验证中文输入与嵌套代码语言 [S2] |
| Markdown | unified / remark-parse / remark-gfm / remark-math | 建立可扩展语法树；保留源位置，不用正则实现通用解析 [S3] |
| HTML 转换 | remark-rehype 或 IR 到 hast 适配器 | 首版采用 IR 到 hast 的统一出口；remark-rehype 用作生态适配参考，避免两套正文渲染逻辑 [S3] |
| 样式 | Tailwind CSS v4 + 语义化文档 CSS | 编译后发布；应用 UI 与文档主题隔离；颜色主要使用 OKLCH [S4] |
| 公式 | MathJax 单一主引擎，LaTeX 输入，MathML/SVG 双输出 | MathML 为优先验证方向；显示默认值由 P0 决定，不以输出格式限制大多数公式的正确显示；不需要 TeX 程序 [S5][S17][S18][S19] |
| Mermaid | mermaid | 图表转 SVG；异步完成后才允许进入导出快照 [S6] |
| Graphviz | @viz-js/viz | 使用 WASM Graphviz；不安装 dot；首版限定常用布局与 SVG 输出 [S7] |
| 分页 | Paged.js，经可行性验证后接入 | 封装 Paginator；不承诺完整 CSS Paged Media 或直接下载 PDF [S8] |
| Word | docx | 浏览器生成原生 OOXML 和 Blob；不经过 Word/LibreOffice [S9] |
| PPTX | PptxGenJS，后续阶段 | 原生文本/形状/图片；不能自动复现任意 HTML [S10] |
| 资源容器 | fflate + 自定义版本化清单 | 可选项目 ZIP 和 EPUB ZIP；需验证 EPUB 打包约束 |
| 校验 | Zod | 导入配置、插件选项、版本化文档的运行时校验 |
| 安全清理 | DOMPurify + URL/CSS 策略 | HTML/SVG 清理；不能把它视为任意 CSS 或 JS 的沙箱 [S11] |
| 存储 | IndexedDB，使用 idb 薄封装 | 草稿、资源、快照；浏览器数据不等于已下载文件 |
| 离线 | vite-plugin-pwa / Workbox | 资源预缓存与升级；大型 WASM、字体必须进入缓存检查 [S12] |
| 测试 | Vitest + Playwright | 模型、插件、编辑交互、离线与导出验证 |
| 可选桌面 | Electron + Forge | 复用 TS/Node 技术栈与固定 Chromium；代价是体积增加 [S13] |

选择 CodeMirror 而非从 textarea 自建编辑器；选择 AST 生态而非从已渲染 HTML 恢复 Word 语义。Graphviz WASM 先采用一个实现，不同时引入多个同类运行时。

代码块预览高亮首版使用受控语言列表的 highlight.js；编辑区高亮由 CodeMirror 负责。两者有不同职责，不能为了“统一”把整套 IDE 语言包塞入初始加载。

## 4. 编辑器设计

### 4.1 视图与基本操作

提供编辑、双栏、阅读、A4 四种视图。桌面双栏可调整宽度；手机使用编辑/预览切换，避免挤压成两条窄栏。编辑器和文档主题分别配置字体、字号、行距及明暗外观。

首版编辑能力：

- Markdown 标题、强调、引用、列表、链接、图片、表格、代码围栏、公式围栏高亮。
- 围栏代码块按已安装语言包高亮；未知语言仍保持代码文本可编辑。
- 行号、自动缩进、括号配对、列表续写、折叠、快捷键和软换行。
- 撤销/重做、查找/替换、选区统计、文档统计、跳到行与标题大纲。
- 常用格式按钮通过编辑事务插入或修改 Markdown，保留光标、选区和撤销语义。
- 图片粘贴/拖入、插入公式/图表模板、手动分页指令。
- 中文 IME 输入期间避免强制格式化、重建编辑器或打断组合输入。

### 4.2 状态与更新

CodeMirror 持有编辑状态，应用通过增量事务同步 Markdown。普通按键不能触发整份编辑器重建。建议预览防抖 250ms，输入持续时允许更长的后台等待；草稿保存防抖 800ms，并在离开会话前尽力刷新，不能依赖 unload 一定成功。

每次内容、主题或资源变动递增 revision。解析和渲染任务携带 revision；旧结果不得覆盖新结果。切换预览、导出、保存文件均使用明确的文档快照。

首版使用区块级缓存减轻公式与图表重渲染，允许正文重新解析；不承诺首版完成真正的增量 Markdown 编译器。

### 4.3 源码与预览联动

IR 节点保存 sourceRange，预览元素设置 data-node-id。点击大纲或预览区块可定位到源位置。滚动同步以区块锚点为主，不用全文滚动比例猜测位置；程序性滚动加来源标记避免循环。

源位置的 offset 统一采用 JavaScript UTF-16 代码单元，line 从 1 起，column 从 1 起；必须验证中文、emoji 和换行符映射。节点 ID 在一次修订内唯一，重解析时尽力匹配旧区块；不能承诺任意重写后 ID 永久稳定。

语法错误定位到源区块，保留原文可编辑。单个图表失败只影响该区块，不阻止其他内容阅读。

## 5. 文档结构与文件格式

### 5.1 文档的权威数据

```ts
interface DocumentRecord {
  schemaVersion: 1;
  id: string;
  revision: number;
  markdown: string;
  meta: { title: string; author?: string; createdAt: string; updatedAt: string };
  theme: ThemeSpec;
  assets: AssetRef[];
  options: { syntaxProfile: "commonmark-gfm-v1"; pluginOptions: Record<string, unknown> };
}
interface AssetRef {
  id: string;             // a_ + SHA-256；内容寻址
  sha256: string;
  mime: string;
  byteLength: number;
  originalName?: string;
}
interface AssetStore {
  get(id: string): Promise<Blob>;
  put(blob: Blob, name?: string): Promise<AssetRef>;
}
```

ThemeSpec 为结构化主题：颜色 token、中文/西文字体、字号、间距、表格、代码、图片、封面、目录与纸张设置。所有公开字段均有 schema、默认值和范围限制；初期不允许导入可执行主题。用户高级 CSS 后续单独设计隔离策略。

### 5.2 内部文档模型 Document IR

区块包含 heading、paragraph、list、blockquote、table、code、math、diagram、image、pageBreak、htmlFragment；行内包含 text、emphasis、strong、delete、inlineCode、link、inlineMath、image。表格需保留表头、对齐和单元格结构，不把表格存成一段 HTML。

每个节点具备 id、type、sourceRange；标题具备 level 和锚点，图片具备 assetId、alt、尺寸与对齐，图表具备 language、source、options，公式保留 LaTeX 源。可选扩展通过具名、带版本的命名空间存放。

公式节点固定使用 syntax: "latex"，同时保存 display、sourceRange 和可选的标签/引用信息；不增加 Typst 输入语法。文档公式配置包含 engine: "mathjax"、viewMode: "mathml" | "svg"、允许的扩展清单和显式宏配置。配置持久化到文档，恢复时验证扩展与宏是否可用；引擎版本写入生成器和缓存元数据，不要求文档固定旧运行时。

IR、HTML、分页和图表渲染结果都是派生数据，不与 Markdown 同时作为可修改正文。导入时先验证源数据再重建 IR；缓存可以删除重建。

### 5.3 Markdown 兼容策略

基础采用 CommonMark + GFM，附加公式、mermaid / dot 围栏、显式分页。扩展属性采用单一、可文档化的语法，例如图表围栏后的属性；实现前锁定正式语法及样例，不同时支持多种歧义写法。

YAML front matter 后续可通过显式启用支持，导入时明确元数据优先级。首版文档设置保存在文档容器，普通 .md 不自动写入用户未要求的配置块。

不支持的代码围栏原样作为代码显示；未知插件区块保留源文并给出诊断。原始 HTML 首版仅允许有限、清理后的语义标签；不执行用户脚本，不支持 MDX/JSX。

### 5.4 用户可见文件

| 文件 | 内容 | 用途与保证 |
|---|---|---|
| .md | Markdown 原文 | 与通用工具交换；单独下载不保证携带图片和主题 |
| Markdown ZIP | .md + 相对路径资源 | 可迁移、可在其他编辑器打开；转换资源引用时不修改会话原文 |
| 阅读 HTML | 已渲染正文、原生 MathML 或 SVG、内嵌 CSS/图片、打印脚本 | 双击即可阅读和打印；不包含源编辑数据 |
| 可编辑文档 HTML | 阅读 HTML + 嵌入的版本化源数据和资源 | 单文件保存；导入工具后可继续编辑；不在每份文档中嵌入整个编辑器 |
| 项目 ZIP，可选 | manifest.json、document.md、theme.json、assets/ | 大文档备份和开发调试；不是默认强制格式 |

可编辑 HTML 默认明确标注“包含 Markdown 源内容和配置”；用户选择阅读 HTML 时去除源数据与历史。两者均不包含编辑历史、凭证或浏览器内部状态，历史仅在用户选择备份时包含。

### 5.5 HTML 源数据封装

将文档 JSON 和资源字节封装为规范化载荷，以 UTF-8 JSON 的 Base64 文本嵌入固定 ID 的非执行 script 数据块；包含 schemaVersion、载荷哈希与生成器版本。Base64 增加体积，不是加密；哈希用于损坏检测，不证明可信来源。

导入时用惰性的 DOMParser 读取指定数据块，绝不把导入 HTML 的 script 插入应用执行。校验大小、哈希、schema、资源类型后恢复。对不含本工具载荷的普通 HTML，首版提示不支持恢复 Markdown，不能默默声称无损恢复。

单文件中图片可使用 data URL；正文 SVG 统一做 ID 命名空间处理，避免重复图表的 clipPath、marker、字体引用冲突。导出内容不得残留 blob:、临时文件路径或外部字体依赖。大文档允许资源在展示与载荷中重复，先保证可恢复，再评估去重优化。

## 6. 插件机制

### 6.1 插件类别

| 类别 | 负责内容 | 首批实例 |
|---|---|---|
| 语法插件 | 解析扩展、规范化 IR | 数学、图表围栏、分页指令 |
| 编辑扩展 | CodeMirror 语言、命令、补全与诊断 | DOT 高亮、图表模板 |
| 渲染插件 | 将特定 IR 节点渲染为可复用资源 | MathJax、Mermaid、Graphviz |
| 导出插件 | 消费 IR、主题、资源和快照生成文件 | HTML、DOCX、EPUB |
| 分页/平台适配器 | 页面布局、文件保存与平台能力 | Paged.js、Browser、Electron |

首版插件为仓库内受信任代码，通过注册表在构建时注册、运行时动态 import。禁用远程 JS 插件和文档内嵌插件。插件机制的目的首先是隔离变化，而非建立市场。

### 6.2 最小接口契约

以下为建议接口骨架，开发第一阶段需落实为可编译类型与 conformance 测试。

```ts
type Format = "html" | "docx" | "epub" | "png" | "svg" | "pptx" | "pdf";
interface PluginManifest {
  id: string;
  version: string;
  apiVersion: 1;
  kind: "syntax" | "editor" | "renderer" | "exporter";
  requires: string[];        // 插件依赖，注册时检测缺失和循环
  offline: boolean;
  resources: string[];       // 构建资源 ID，生成离线清单
}
interface Diagnostic {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  nodeId?: string;
}
interface RenderContext {
  revision: number;
  signal: AbortSignal;
  assets: AssetStore;
  theme: Readonly<ThemeSpec>;
}
interface RenderArtifact {
  nodeId: string;
  mathml?: string;          // MathJax 序列化输出；验证并清理后使用
  svgAssetId?: string;
  pngAssetId?: string;
  htmlFragment?: string;
  widthPx: number;
  heightPx: number;
  baselinePx?: number;     // 行内公式实际布局基线指标
  alt: string;
  diagnostics: Diagnostic[];
}
interface RendererPlugin {
  manifest: PluginManifest;
  supports(node: IRNode): boolean;
  render(node: IRNode, context: RenderContext): Promise<RenderArtifact>;
  dispose?(): void;
}
interface ExportPlugin {
  manifest: PluginManifest;
  format: Format;
  inspect(snapshot: ExportSnapshot): Promise<Diagnostic[]>;
  export(snapshot: ExportSnapshot, signal: AbortSignal): Promise<ExportResult>;
}
type ExportResult =
  | { kind: "download"; files: { name: string; blob: Blob }[]; diagnostics: Diagnostic[] }
  | { kind: "print-request"; diagnostics: Diagnostic[] };
```

IRNode、ThemeSpec、ExportSnapshot 定义在核心模型模块。浏览器打印返回 print-request，不能伪装成已经生成 PDF 文件。插件返回的 HTML/SVG 在平台层清理后使用，不能通过接口直接获得任意应用 DOM 或文件系统权限。

### 6.3 生命周期、任务与缓存

注册 → 校验 API 版本与依赖 → 按需加载 → 渲染/导出 → 缓存 → 销毁。重任务设可配置超时；Worker 可通过终止实现硬取消，主线程 DOM 渲染只能协作取消，仍需修订号检查拒收过期结果。

缓存键包含节点源哈希、插件版本、选项、主题、字体配置和相关资源哈希。插件升级或主题变化必须失效相关缓存。按总字节数限制缓存，使用 LRU 淘汰。

公式缓存分为转换缓存和布局缓存。转换缓存包含 LaTeX 源、display、MathJax/扩展版本、宏配置及必要的编号上下文；布局缓存另包含输出模式、主题、字体、字号和容器宽度。编号或宏上下文变化时重算受影响公式，不能把同源公式无条件复用到不同编号位置。MathML 字符串与 SVG 资源分别缓存，只按目标模式生成必要结果，不在每次按键同时生成全部表示。

Graphviz 优先 Worker；MathJax、Mermaid 首版按实际 DOM 需求执行，不强行塞入 Worker。Worker 不是安全沙箱，不允许据此运行不可信第三方插件。

### 6.4 格式能力矩阵

能力注册包括原生语义、矢量、栅格、纯文本回退、不可支持。导出前针对实际内容产生诊断，而不是只展示一张固定宣传表。

例如，公式导出 Word 首版为图片，应提示公式不可原生编辑；未知 HTML 导出 Word 时允许安全文本回退并提示，禁止静默丢弃正文。严重错误阻断导出，可接受降级需由用户在导出面板选择后执行。

## 7. 渲染、分页与主题

### 7.1 渲染就绪屏障

导出任务冻结文档修订号和设置，依次等待解析、资源解析、公式/图表、图片 decode、document.fonts.ready、布局和分页结束。等待字体完成后还要检查目标字体是否实际可用；超时或缺失产生诊断。

状态为 idle → parsing → rendering → layout → paginating → ready / failed / cancelled。导出基于冻结快照；编辑器可以继续编辑，但结果明确属于旧修订，不混入新内容。

### 7.2 两种布局

阅读布局使用语义化 HTML、Grid/Flex、clamp()、舒适行长与手机适配。A4 布局使用物理尺寸、页边距和分页规则，不通过缩小整页实现手机阅读。

正文颜色使用 OKLCH token；Word/PPTX/栅格输出通过统一色彩适配转换为 sRGB，处理超色域值并记录必要差异。Tailwind 主要服务应用 UI，文档排版使用稳定的 .doc-* 类和 CSS 变量，不允许 Markdown 文本任意生成 Tailwind 类名。

### 7.3 分页规则

- 标题避免单独留在页尾，段落设置孤行/寡行控制；实际支持以浏览器验证为准。
- 普通图片、公式、图表尽量整块；超过页面可用高度时按规则缩放或报告超高，不无限重排。
- 长表格允许跨页，重复表头；超高单行要有明确错误或专门拆分策略。
- 代码块允许按行分页；每片保留背景与必要的续页标识。
- 手动分页具有高于自动规则的优先级；防止生成连续空白页。
- 封面、目录、页眉页脚和页码作为页面布局能力实现，首版目录仅含标题与链接；页码目录待分页验证后启用。

Paged.js 通过适配器接入，先验证长表格、代码、中文、SVG、显式分页和目录。若验证不通过，首版缩减复杂页面能力并记录，不在未评估时自研完整排版引擎。Vivliostyle 可作为后续替代评估，不同时引入两套分页引擎。

### 7.4 公式引擎与显示策略

**选型结论：MathJax 为唯一公式主引擎，输入使用 LaTeX 数学语法。** 首版不引入 Typst 或 KaTeX，也不通过引擎切换来补救解析失败。支持度与正确显示优先于包体或单次转换速度；效率通过增量更新、缓存和调度优化。

支持目标是大多数常见及复杂数学公式无需改写，覆盖分式、根式、上下标、大型算符、定界符、矩阵、分段、多行对齐、AMS 环境、编号/引用、字体变体及自定义宏。根据样例配置 ams、mathtools、newcommand、configmacros 等扩展；化学、物理等领域扩展通过显式配置启用并测试冲突，不把所有扩展无差别加载。MathJax 是 LaTeX 数学语法的实现，不承诺任意 TeX 程序、完整文档或任意宏包兼容。[S17][S18]

显示采用文档级模式，不自动猜测单个公式是否应切换格式：

| 模式 | 路径 | 使用与验收原则 |
|---|---|---|
| 原生 MathML | LaTeX → MathJax 解析 → MathML 序列化 → 浏览器布局 | 优先验证方向；验证编号、多行对齐、字体变体、行内基线及打印；不能仅凭输出合法 MathML 判定显示正确 |
| MathJax SVG | LaTeX → MathJax SVG 输出 → 自包含资源 | 优先排版完整性与固定视觉输出；作为复杂公式和正式交付可选模式 |

MathJax 提供 tex2mmlPromise 等转换方法，但原生 MathML 不是 MathJax v4 的内置输出渲染器。其序列化结果与浏览器 MathML Core 在部分表格对齐属性、编号和字体变体上存在差异；适配层需要规范化并测试，不能通过“只支持现代浏览器”跳过这项验证。[S19][S20]

P0 在选定目标浏览器运行同一公式集，对照 MathJax SVG 的排版结果，确定首版文档级默认模式。MathML 为优先方向；若关键样例仍有显示缺口，则默认 SVG，并保留 MathML 模式和转换能力。用户选择的模式作用于阅读、A4 与 HTML；打印前冻结相同模式，不静默改用另一套显示。切换模式必须重新布局及分页。

公式范围由 Markdown 解析器识别，MathJax 只转换公式节点，不对每次更新的全文重复自动扫描。采用 Promise API 并等待全部所需扩展就绪；避免并发任务共享可变编号/宏状态。编号、引用与跨公式宏作为文档级上下文顺序处理，增量失效范围由依赖决定；旧任务结果通过 revision 检查拒收。

宏配置默认显式声明；兼容正文中的定义时应建立依赖或扩大重算范围，不在多个文档间共享可变宏。所有允许的扩展、字体和数据资源随包发布，不在输入中临时从公网获取；异步按需加载仍必须命中本地发行资源。错误回报关联 sourceRange，保留原文；界面不以渲染为普通文本掩盖公式错误。

公式原文始终可恢复。MathML 输出不等于任意 CAS 可理解的代数语义，也不等于 Word 原生可编辑公式。SVG 字形可能为路径，正文可选取的要求不扩展为“所有 SVG 公式字符均可直接选取”；复制 LaTeX/MathML 应作为独立能力实现。

## 8. 各类格式导出路径

| 格式 | 路径 | 是否需要用户额外环境 | 阶段 |
|---|---|---|---|
| MD / MD ZIP | Markdown → 文本；资源引用重写 → ZIP | 无 | 首版 |
| HTML | IR + 已完成渲染资源 + 主题 → 静态 HTML → 内嵌资源和可选源载荷 | 浏览器 | 首版 |
| PDF，打印方式 | 同一 A4 页面 DOM → window.print() → 用户保存 PDF | 浏览器打印功能 | 首版 |
| DOCX | IR + 主题映射 + 公式/图表资源 → docx → Blob | 无需 Word 即可生成；兼容性验收需实际阅读器 | 首版 |
| EPUB | IR → 分章 XHTML、目录、资源、OPF → EPUB ZIP | 生成无额外环境；验收需阅读器 | 后续 |
| SVG | 指定图表/公式 → 清理、自包含 SVG | 无 | 后续 |
| PNG | 图表 SVG → Canvas；页面 HTML → 经验证的截图适配器 | 浏览器；有字体、跨域和 Canvas 尺寸限制 | 后续 |
| PPTX，视觉模式 | 显式幻灯片布局 → 页面图像 → PptxGenJS | 无 | 后续 |
| PPTX，可编辑模式 | IR → 幻灯片模型 → 原生文字、表格、形状及图表图片 | 无 | 后续 |
| PDF，自动下载 | 固定桌面 Chromium → printToPDF → 文件 | 桌面发行包自带运行时 | 桌面阶段 |

### 8.1 HTML

默认导出静态正文，不要求收件人再次运行 Mermaid、MathJax 或 Graphviz。公式按文档显示模式输出原生 MathML 或自包含 SVG，图表预先渲染为自包含 SVG，图片内嵌；CSS 编译后内嵌。MathML 模式保留所需数学字体与样式；SVG 模式收集所需样式和字形，消除应用全局字体缓存的隐含依赖。只保留目录跳转、折叠等必要交互及打印按钮，不携带编辑器运行环境。

提供“打印 / 保存为 A4 PDF”按钮，使用 window.print()；配置 @page 和 @media print，隐藏控件，保留可选择文本。阅读 HTML 在不同机器上重新分页可能受字体影响；精确页码需求以已生成 PDF 为交付。

### 8.2 PDF

Web 版按钮命名为“打印 / 保存为 PDF”，导出流程只确认渲染就绪与已发起打印，不宣称已保存。打印预览使用与 A4 预览相同快照和页面资源；关闭浏览器自带页眉页脚、比例及边距的具体操作以实际支持版本验收。

不以 html2canvas + jsPDF 整页截图作为默认 PDF 路径，避免正文全图化和长页切割问题。若未来需要纯 Web 自动 PDF，必须作为独立技术验证：文本可选、字体嵌入、分页、SVG 与表格均通过后才列入正式能力。

### 8.3 DOCX

标题、段落、列表、链接、表格、分页符映射到原生 Word 对象。字号、行距、缩进、页边距统一换算单位，字体和颜色通过主题适配器输出。Word 自行重新分页，不复制浏览器自动分页为大量硬分页符。

公式首版从同一 LaTeX 节点通过 MathJax 生成 SVG，再转为高分辨率 PNG，保留源文作为替代文本；不依赖截取浏览器 MathML 的屏幕显示，也不要求切换文档显示模式。后续单独实现并验证 OMML，不能将 MathML 字符串直接当成 Word 原生公式。图表优先 SVG + PNG 兼容回退，实际支持以目标阅读器验证为准。代码块使用原生文字和必要的高亮样式。水印、复杂 HTML、跨单元格布局等按能力矩阵处理。

不能把 HTML 改扩展名为 .docx，也不依赖特定软件导入 HTML 的临时兼容机制作为正式路线。

### 8.4 EPUB

选择 EPUB 3 可重排模式；目录以标题结构生成，封面和元数据单独映射。删除应用脚本，外链资源转本地；公式优先验证原生 MathML，按目标阅读器能力显式选择 SVG/图片回退，图表采用经验证的 SVG/图片。ZIP 的 mimetype 项必须按 EPUB 规范优先、无压缩写入，并正确生成 container.xml、OPF、nav 和 spine；正式实现时核对规范及校验器。

### 8.5 PPTX 与图片

PPTX 不直接把任意文章每个 A4 页面当成天然幻灯片。增加独立幻灯片模型、宽高比、显式分隔及少量模板。视觉模式标注整页不可分别编辑；可编辑模式只承诺已支持的对象种类，不承诺 CSS 完整复制。

页面 PNG 首选每页分别导出，禁止无限高长图；图表 SVG 的导出需消除外部字体、CSS 和 foreignObject 依赖，不能消除时使用明确的图片回退。

## 9. 资源、保存与异常恢复

图片导入后按 SHA-256 去重，Markdown 使用 asset:<id> 内部引用，由解析器资源适配层解析；导出普通 Markdown ZIP 时改成相对路径。原始资源与压缩副本区分，覆盖前保留可恢复版本或要求显式操作。

远程图片只能在浏览器 CORS 许可下收集，不能承诺任意网址都可离线内嵌。失败时允许用户导入本地文件；不为解决 CORS 默认引入远程代理。离线导出前列出未收集资源，默认阻断“完整离线”交付。

IndexedDB 保存文档记录、资源与必要历史；文档和资源清单的关联更新尽量使用同一事务。配额不足时保留当前编辑内存，提示下载备份；不能把失败状态显示为“已保存”。资源回收扫描活动文档和保留历史，不能只依据当前正文删图。

区分“草稿已保存到本机浏览器”“已下载文档”“已写回原文件”。Browser 默认通过下载保存，不承诺覆盖原文件；文件系统访问能力仅作为渐进增强。桌面写回通过临时文件和原子替换完成，并检测外部修改冲突。

历史快照按内容哈希去重、限制数量和总字节数；恢复源文通过一次编辑事务或明确的文档恢复操作执行。刷新后首版允许恢复正文与历史快照，不承诺完整恢复编辑器每次按键撤销栈。

## 10. 发布方式与依赖边界

### 10.1 默认 Web + PWA

Vite 输出部署至 HTTPS 静态站点。所有核心脚本、Worker、WASM、图标及必要字体随构建发布，不依赖 CDN。运行时插件按需加载，完整离线包通过显式预下载把全部受支持资源加入缓存。

首次联网访问不等于已具备完整离线能力。界面展示“离线资源准备中 / 已就绪 / 不完整”；联网安装完成后断网重启，首次调用之前从未打开的 Graphviz、公式及 DOCX 导出也必须成功。

更新采用版本化资源和原子部署，短期保留旧资源；提示用户保存后更新，避免编辑中强制刷新。清理缓存不得清理文档 IndexedDB。支持旧文档 schema 迁移，旧版本不能读取新格式时明确拒绝修改。

### 10.2 双击运行的离线工具，单独验证

普通 Vite dist ZIP 不是可承诺双击运行的离线应用：file:// 下 ESM、Worker、WASM 加载和 Service Worker 都可能受限。不能让用户解压后再安装 Node 启服务。

如果明确需要不经首次联网、直接双击打开工具，可以提供专门的 standalone.html 构建：脚本内联为兼容形式，WASM 字节内嵌，Worker 使用经验证的 Blob 方式，关闭 Service Worker，并保留文件下载保存。它是独立构建目标，需要完整功能验证；失败时不以普通 dist 包替代。

### 10.3 桌面可选 Electron

需要离线首次启动、原文件写回、文件关联、固定渲染和自动 PDF 时再增加 Electron。复用 Web 应用与核心模块；安装包带 Chromium 和 Node，不要求用户安装开发环境，仍需满足操作系统支持条件。

渲染进程禁用 Node 集成、启用上下文隔离；文件/PDF API 使用窄化 IPC。打包、签名、平台安装测试单独纳入发布验收。Electron 体积较大，但比额外引入 Rust 构建链更符合本方案 TS/Node 优先的约束；若后续更重视体积，再单独比较其他桌面壳。

### 10.4 构建与发行命令约定

以下是开发时应实现的项目脚本契约，当前尚无对应工程：

```text
npm ci                    安装锁定依赖
npm run dev               启动开发环境
npm run check             类型和静态检查
npm test                  核心与插件测试
npm run test:e2e          浏览器交互与导出测试
npm run build             生成 Web/PWA 静态资源
npm run verify:offline    检查资源清单并运行断网场景
npm run build:standalone  可选单文件工具构建
npm run package:desktop   后续桌面发行包
```

发布包含版本号、构建提交、依赖锁文件、第三方许可清单、资源清单与校验值。依赖升级通过单独变更验证，不能在发布时自动拉取未锁定的最新依赖。包管理器可统一安装依赖，但浏览器安装包、签名证书等 CI 工具也需显式准备，不把开发机器“碰巧存在”当成项目能力。

## 11. 安全与兼容设计

- 不执行 Markdown 中的 script、事件属性、javascript: URL、嵌入式对象或不可信插件。
- 外部 HTML/SVG 使用允许列表清理；资源协议和外链单独校验，DOMPurify 不能替代 CSS 策略。
- 图表使用受控配置，用户内容不能开放回调、任意链接执行或覆盖安全级别。
- 导入设置文件大小、图片像素、图表复杂度、ZIP 展开数量和总字节限制，防止编辑器卡死或内存耗尽。
- 应用主题、用户正文和导入 HTML 的样式隔离；分页/打印 iframe 只运行应用生成的可信脚本。
- 字体使用系统回退；可选内嵌开源授权字体。中文字体包较大，单独计入离线准备与发行体积；没有嵌入字体时不能承诺跨设备像素一致。
- 主验收浏览器为发布时锁定的桌面 Chrome/Edge；Firefox、Safari 和移动端建立单独兼容表。支持版本同时受 Tailwind、分页引擎等约束，不能只依据 Vite 的最低版本下结论。

## 12. 工程结构与 Codex 开发组织

```text
src/
  app/                    布局、路由、面板、会话协调
  editor/                 CodeMirror 装配、命令、语言、源定位
  core/
    model/                文档 schema、IR、主题、迁移
    parser/               Markdown 到 IR 的适配器
    resources/            资源索引、引用与内容寻址
    plugins/              契约、注册表、依赖和能力检查
    pipeline/             调度、缓存、revision、快照
  rendering/              HTML、SVG 清理、渲染就绪屏障
  layout/                 阅读布局、分页接口、Paged.js 适配
  plugins/
    math/ mermaid/ graphviz/
    export-html/ export-docx/
  storage/                IndexedDB、导入导出、草稿和历史
  platform/               browser、后续 electron
  themes/                 token、文档 CSS、内置模板
  workers/                解析与 Graphviz 任务
tests/
  fixtures/               中文、图表、公式、长表格、异常文档
  unit/ integration/ e2e/
docs/
  design/                 方案、决策记录
  contracts/              schema、插件 API、能力矩阵
  acceptance/             阶段验收证据
scripts/                  构建资源检查和发行校验
```

Codex 可作为主要开发工具；本项目不需要调用 OpenAI API 才能运行。实施时先建立项目自己的 AGENTS.md，记录以下执行约束：

1. 先维护设计基线、接口契约和阶段验收项，再实现对应阶段。
2. 每次只交付可独立验证的纵向功能；接口变化同步修改样例插件和测试。
3. 不擅自引入外部命令行转换器、云转换服务或新的系统级依赖。
4. 核心不得引用 UI/平台模块；原始 Markdown 不被自动格式化覆盖。
5. 每次变更说明用户行为、验证结果和未完成边界；不把静态检查当成视觉验收。
6. 保留人工修改；不自动发布站点、推送或升级依赖，除非当前任务授权。

建议每个开发任务输入包含：目标、涉及模块、接口输入输出、异常行为、测试样例、验收标准及暂不处理项。先做真实编辑→预览→保存→重新打开的闭环，再扩展插件，避免只生成大量接口而无可用产品。

## 13. 实施阶段与退出条件

| 阶段 | 工作 | 完成条件 |
|---|---|---|
| P0 技术验证 | CodeMirror 中文、AST 映射、MathJax MathML/SVG 对照、Mermaid/DOT、Paged.js、docx、资源打包 | 混合样例完成真实浏览器渲染、A4 打印预览与 DOCX 打开检查；公式支持与显示测试确定默认模式；提交选型结果与依赖边界 |
| P1 编辑闭环 | 编辑、高亮、撤销、搜索、大纲、文件与草稿恢复、基础阅读预览 | 导入→编辑→保存→刷新恢复→下载→重开通过；中文和 emoji 源定位正确 |
| P2 内容与插件 | IR、资源库、插件注册、公式、Mermaid、Graphviz、缓存与诊断 | 三种渲染插件按同一契约接入；取消、超时、未知语法和修订竞争通过 |
| P3 排版与 HTML/PDF | 主题、A4、分页、单文件 HTML、源载荷恢复、打印 | 收件人断网打开 HTML 可读可打印；源数据往返恢复；A4 实际预览检查通过 |
| P4 DOCX 与首版发行 | 原生文档映射、能力检查、PWA 完整离线与发布包 | 在干净用户环境不装开发工具即可编辑、渲染和导出；DOCX 目标阅读器验收通过 |
| P5 扩展格式 | EPUB、SVG/PNG、PPTX | 每种格式独立能力矩阵、异常回退及阅读器验证，不以“生成 ZIP 成功”为验收 |
| P6 可选桌面 | 文件关联、原文件写回、固定 Chromium PDF | 不装 Node 即可启动；自动 PDF、权限边界、崩溃恢复和签名发行验证 |

P0 是决定性门槛。若分页、离线 WASM 或 Word 兼容出现阻碍，先调整能力范围并记录决策，不通过增加用户手动安装软件绕过约束。

## 14. 验收标准

### 14.1 功能与结构

- 编辑区确有 Markdown 和围栏语言高亮，中文输入不丢字，撤销恢复图片插入及格式操作。
- 切换视图、变更主题不修改原始 Markdown；普通预览刷新不重置选区或撤销栈。
- 可编辑 HTML 往返后 Markdown 字符内容一致，元数据、主题和所有资源哈希一致；分别测试 LF/CRLF 与 Unicode。
- 单个渲染器报错时其余区块可用；导出列出明确节点和降级结果，无正文静默丢失。
- 导出前等待资源完成；旧渲染结果不覆盖新修订；导出中继续编辑不会混合版本。
- 公式输入固定为 LaTeX，MathJax 为单一主引擎；文档保存/重开后显示模式、宏及扩展配置一致，跨文档不泄漏宏和编号状态。

公式专项样例至少覆盖：行内/独立公式、嵌套分式与根式、积分求和与极限、可伸缩括号、矩阵/分段、多行对齐、编号/交叉引用、数学字体变体、显式自定义宏、中文文本、超长公式及无效命令。领域扩展按启用范围增加样例。分别记录“解析正确”“MathML 显示正确”“SVG 显示正确”“打印正确”，不能把转换成功等同于公式排版通过。

### 14.2 格式与视觉

- HTML 正文可选取、可搜索，无未解析公式、空白图表、失效 blob: 引用或隐含远程依赖。
- 桌面与手机实际检查；长链接、宽表格和长代码不导致整页横向溢出，局部滚动需明确。
- A4 检查标题孤页、表格续页、超高图表、页眉页脚、页码和空白页；记录浏览器、字体、纸张、比例和边距。
- 公式分别检查两种文档级模式的行内基线、行距、字体变体、矩阵/多行对齐和编号；MathML 清理前后结构有效，SVG 不依赖编辑器全局字形缓存。打印使用预览冻结模式，切换模式后重新分页。
- DOCX 在选定 Word 版本及至少一种替代阅读器检查，标题/段落/表格为原生对象；公式图片降级有说明。未获得阅读器时仅记录结构检查，不宣称完成视觉验收。
- 浏览器打印预览、实际保存 PDF 检查、实体打印为三个不同验证级别，分别记录。单靠 DOM 截图不能证明 PDF 分页正确。

### 14.3 离线与发布

- 新浏览器配置加载并完成全部离线资源准备后，断网重启应用，首次启用公式、Mermaid、DOT 和 DOCX 均成功。
- 网络日志中没有必需 CDN 请求；WASM、Worker、字体与动态模块均在资源清单。
- 阅读 HTML 在未安装本工具的机器断网打开可用；可编辑 HTML 导入后能重建文档。
- 浏览器存储配额失败和缓存升级失败不会导致正文丢失或错误的“已保存”状态。
- standalone 和桌面只在各自验证通过后发布，不拿 PWA 安装成功替代首次离线启动验收。

### 14.4 初始性能预算

以下为设计目标，需由 P0/P1 建立 Windows 桌面基准机、锁定浏览器和样例后实测：10 万中文字符、200 个普通区块、20 张图片、20 个图表/公式混合样例；资源字节另行记录。

输入事务主线程耗时 P95 目标小于 50ms；普通正文预览目标在停止输入后 1 秒内更新。复杂图表首渲染与完整分页独立计时，不要求每次按键全量执行。连续编辑、切换和导出 20 次后观察内存与 Blob URL 回收，不要求所有重图表在固定一秒内完成。

公式性能单独记录冷启动资源加载/解析、单公式变更、批量首次转换、缓存命中和浏览器布局时间；覆盖 100 个及 1000 个公式的固定样例。普通文字变更不应触发未受影响公式的重复转换，编号或宏变动应正确重算依赖。MathML 与 SVG 在相同 LaTeX、扩展、字体及设备下比较；不预先宣称某模式一定更快。默认模式决定须同时满足支持度、正确显示与性能目标。

初始脚本与完整离线包分别统计压缩体积、WASM、字体及插件占比；依据实测决定预算阈值，不把“依赖统一安装”等同于体积必然很小。

## 15. 关键决策与后续确认点

已明确：产品以 Markdown 编辑器为中心；统一 TS/Node 依赖与构建；用户核心运行不安装外部库；HTML 负责展示和视觉输出；保留结构化模型支撑可编辑导出；首版内置插件；Web/PWA 优先。

默认采用：CodeMirror 6、React、Vite、unified、MathJax 单一公式引擎及 MathML/SVG 双输出、Mermaid、Graphviz WASM、docx、Paged.js 验证路线。公式仅接收 LaTeX，优先验证 MathML，以大多数公式直接可用及排版稳定为前提；默认显示模式由 P0 确定，不引入 KaTeX/Typst 或逐公式自动切换引擎。默认基础 DOCX 与图表均纳入首版，EPUB/PPTX 后续扩展。

实施前通过 P0 落实：分页引擎是否满足样例；目标浏览器与 Word 阅读器版本；是否需要从未联网的首次离线启动；是否需要自动下载 PDF。后两项若为必需，则 standalone/桌面路径需提前，不能只靠 PWA 承诺。

## 16. 参考资料与核验边界

下列链接用于支持技术能力判断；总体架构、接口和阶段划分为本方案设计。资料核对日期为 2026-10-23，尚未安装这些依赖、构建工程或完成兼容性验证。

- [S1 Vite 生产构建](https://vite.dev/guide/build.html)：静态构建、浏览器目标与资源输出。
- [S2 CodeMirror 官方源码组织](https://github.com/codemirror)：编辑器及语言扩展；本轮官方文档站抓取返回 403，具体 API 需在 P0 以已安装包类型与官方仓库复核。
- [S3 remark-rehype](https://github.com/remarkjs/remark-rehype)：mdast/hast 与 Markdown/HTML 插件边界。
- [S4 Tailwind CSS v4 Vite 集成](https://tailwindcss.com/docs/installation/using-vite)。
- [S5 MathJax 组件](https://docs.mathjax.org/en/stable/web/start.html)：浏览器组件与 HTML/SVG 输出。
- [S6 Mermaid 用法](https://mermaid.js.org/config/usage.html)：浏览器集成和渲染接口。
- [S7 Viz.js API](https://viz-js.com/api/)：Graphviz WASM 和 JavaScript 包。
- [S8 Paged.js](https://pagedjs.org/)：基于 HTML 的分页排版方向；实际 PDF 仍需打印或相应生成环境。
- [S9 docx Packer](https://docx.js.org/api/classes/index.Packer.html)：浏览器 Blob 和 OOXML 打包。
- [S10 PptxGenJS](https://gitbrent.github.io/PptxGenJS/)：浏览器和 Node 的 PPTX 生成。
- [S11 DOMPurify](https://github.com/cure53/DOMPurify)：HTML、SVG、MathML 清理。
- [S12 Vite PWA 预缓存](https://vite-pwa-org.netlify.app/guide/service-worker-precache)及[资源大小限制](https://vite-pwa-org.netlify.app/guide/faq)：离线资源需完整进入清单。
- [S13 Electron 发行](https://www.electronjs.org/docs/latest/tutorial/distribution-overview)：打包、签名和分发。
- [S14 Pandoc 架构](https://www.pandoc.org/using-the-pandoc-api.html)：读入、文档树、写出架构参考。
- [S15 Vivliostyle](https://vivliostyle.org/)：HTML/CSS 分页与 PDF 排版参考。
- [S16 SangDocCraft](https://github.com/sangyuxiaowu/SangDocCraft)及[Word 导出实现](https://github.com/sangyuxiaowu/SangDocCraft/blob/main/src/utils/docxExporter.ts)：本轮此前通过浏览器阅读 README 并抽查 Word 路径；未运行或全面审计，不据此判断可直接复用程度。
- [S17 MathJax TeX/LaTeX 支持范围](https://docs.mathjax.org/en/latest/input/tex/index.html)：数学语法实现而非完整 LaTeX 运行时。
- [S18 MathJax 扩展列表](https://docs.mathjax.org/en/latest/input/tex/extensions/index.html)：AMS、mathtools、宏与领域扩展。
- [S19 MathJax MathML 输出说明](https://docs.mathjax.org/en/latest/output/mathml.html)：序列化能力、原生输出适配及 MathML Core 限制。
- [S20 MathJax 转换 API](https://docs.mathjax.org/en/latest/web/convert.html)：tex2mmlPromise、tex2svgPromise 与异步转换边界。

本文到总体方案为止，不创建项目、不安装依赖、不修改用户配置。下一阶段从 P0 技术验证和接口契约开始。
