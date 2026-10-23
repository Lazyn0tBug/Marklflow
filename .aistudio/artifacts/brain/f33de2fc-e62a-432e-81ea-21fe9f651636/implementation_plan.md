# MarkFlow (墨流) - Markdown 编辑器与多格式排版发布工作台

本方案严格依据《Markdown 编辑器总体设计方案 V0.2.8》及用户确认需求，落地构建开箱即用、公式与图表齐备、具备流式阅读与 A4 分页预览、支持多格式导出的专业 Markdown 工作台。方案完整实施 0.1 至 0.9 核心功能，并内置版本演进与 1.0 验收审查看板，保证 0.9 冻结候选到 1.0 的平稳验证与发行。

---

### User Review & Critical Decisions

> [!IMPORTANT]
> **已在第 1 轮澄清中确认的关键决策：**
> 1. **产品品牌与界面调性**：正式确立为 **MarkFlow (墨流)**，兼具沉浸式写作排版与开发工具级 Operate 紧凑界面，低装饰、高可读性、以文档内容为核心。
> 2. **数学公式默认渲染模式**：采用 **原生 MathML** 优先渲染策略，并在预览工具栏提供 MathML 与 SVG 的实时快速切换按键，在文档/全局配置中提供持久化配置选择。
> 3. **版本规划落地策略**：全面实现 **0.9 阶段完整功能**，并内置交互式 **“版本规划与验收看板 (Roadmap & Verification Matrix)”**，用户可直观审查 0.1 至 0.9 各阶段技术退出条件与 1.0 验收证据。

---

### 1. Overview & Core Concept

- **What It Does**: 提供集“源码编辑、大纲导航、多文档工作区、流式阅读/A4物理分页预览、多模式公式与图表、单文件自包含 HTML/源载荷往返导入、原生 DOCX 导出、浏览器打印 A4 PDF”于一体的专业级 Markdown 排版与发布环境。
- **Target Audience / Persona**: 工程师、科研人员、技术文档撰写者、高校师生及出版排版创作者，追求开箱即用、无云端数据泄露风险、依赖统一且输出质量高的用户。
- **Key Value**:
  - **原文权威**：Markdown 原文为唯一真理来源，编辑事务与快照机制保障数据一致性。
  - **零环境折腾**：无需本地安装 Python、TeX、Pandoc 或 Graphviz CLI 即可完成公式渲染、图表绘制与 Word 导出。
  - **纯本地无后端**：IndexedDB 存储草稿，不强制云端注册，支持完整断网离线操作。

---

### 2. User Experience & Visual Design

#### 2.1 整体空间布局（三栏 Operate 工作台）
- **顶栏（Top Bar Contract）**：
  - *左区*：品牌名称「**MarkFlow 墨流**」+ 当前工作区标识。
  - *中区*：视图模式切换（纯编辑 / 双栏分栏 / 纯阅读 / A4 纸张预览）+ 公式显示模式快速切换器（MathML / SVG）+ 版本验证看板入口。
  - *右区*：深浅色主题切换 + 保存 Markdown +「导出文档」主动作按钮。
- **左栏（238px，可折叠/拖拽微调）**：
  - 多文档会话列表、工作区批量导入（支持 .md 文件及含载荷 HTML）、文档大纲树（按标题深度缩进、点击精准定位源码与预览）。
- **中栏（Markdown 源码编辑器）**：
  - 行号、高亮标记、光标行、软换行、常用格式快捷工具条（加粗、倾斜、代码、表格、公式模板、分页符 `---pagebreak---`）、文档字符与字数实时统计。
- **右栏（双模渲染预览区 & 导出侧边抽屉）**：
  - **阅读模式（Reading View）**：流式排版、OKLCH 色彩、代码语法高亮、公式 MathML/SVG 渲染、Mermaid 流程图/时序图、Graphviz DOT 矢量图。
  - **A4 分页模式（A4 Paginated View）**：真实 A4 物理比例（210mm × 297mm）、标准页边距、模拟纸张阴影、自动页眉页脚与动态页码、避免标题孤页与长表格分页控制。
  - **导出面板（Export Panel）**：支持导出静态阅读 HTML、包含全量源数据与资产的**可编辑 HTML（往返导入）**、浏览器无损打印 A4 PDF、原生样式 DOCX。附带导出前能力检查诊断与降级说明。

#### 2.2 视觉与色彩系统（Tailwind v4 + OKLCH）
- **色彩策略（60-30-10 规范）**：
  - 60% 基础画布：浅色纸张 `oklch(0.99 0.002 240)` / 深色外壳 `oklch(0.16 0.01 240)`。
  - 30% 结构层与侧边：细线微边框 `oklch(0.92 0.005 240)`，卡片与输入容器。
  - 10% 聚焦与重点强调：低饱和青绿沉稳强调色 `oklch(0.68 0.12 185)`，用于选中项、活动 Tab 与主保存导出动作。
- **排版字体**：
  - UI 界面：`Plus Jakarta Sans` / 系统高质量无衬线（苹方 / 思源黑体）。
  - 编辑与代码：`JetBrains Mono` / `Cascadia Code` 等宽字体，数字严格采用 `tabular-nums`。
  - 文档正文：优雅衬线/无衬线自由切换，公式字体优先使用 MathML Core / STIX Two Math 标准字形。

---

### 3. Key Product Decisions & Trade-Offs

1. **公式双模架构（MathML 优先 + SVG 无缝切换）**：
   - *决定*：默认采用原生 MathML 输出，具有极高渲染效率且文本可自然选定；同时支持切换至 MathJax SVG 模式，以满足需要严苛固定视觉输出的学术排版场景。
   - *理由*：用户明确指定“魔法 MathML”并在预览栏及设置提供切换。
2. **单文件可编辑 HTML 封装技术（源载荷规范）**：
   - *决定*：导出的 HTML 中包含一个以 `application/json` 存储在非执行 `<script id="markflow-source-payload">` 中的 Base64 编码文档元数据与 Markdown 原文。
   - *理由*：用户接收此 HTML 时不仅能在任何浏览器中离线阅读排版成果，拖回 MarkFlow 时能 100% 还原文档、草稿版本与主题配置，彻底打通可编辑往返闭环。
3. **DOCX 原生渲染映射**：
   - *决定*：使用 `docx` 库将 Markdown AST 中的段落、标题、列表、表格映射为原生 Word OpenXML 对象，公式与复杂矢量图转换为嵌入式图像并附带 LaTeX 替代文本，确保 Word/WPS 打开无报错。
4. **版本路线与 1.0 验收审查看板**：
   - *决定*：应用内置「版本演进与 1.0 验收审查」看板，完整展示 0.1 至 0.9 的开发里程碑完成度（P0~P4、H0~H1 各项指标），并提供 0.9->1.0 验收清单与检查项自测工具。

---

### 4. Technical Architecture & Data Strategy

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        MarkFlow (墨流) UI 工作台                       │
│  [顶栏: 视图切换 | 公式模式(MathML/SVG) | 主题 | 导出 | 版本看板]        │
├───────────────┬────────────────────────────┬───────────────────────────┤
│ 左栏: 工作区  │ 中栏: 源码编辑器            │ 右栏: 双模渲染与排版      │
│  ├─ 文档列表  │  ├─ CodeMirror 6 核心      │  ├─ 流式阅读布局          │
│  ├─ 导入文件  │  ├─ 撤销/重做/查找替换     │  ├─ A4 分页仿真引擎       │
│  └─ 大纲导航  │  └─ 格式插入与分页指令     │  └─ 导出就绪屏障与抽屉    │
└───────┬───────┴─────────────┬──────────────┴─────────────┬─────────────┘
        │                     │                            │
        ▼                     ▼                            ▼
┌──────────────────┐  ┌──────────────────┐  ┌────────────────────────────┐
│  文档会话 Store  │  │  解析与 IR 管道  │  │   渲染与排版引擎集群       │
│  - DocumentRecord│  │  - MarkdownAST   │  │   - MathML / MathJax SVG   │
│  - Revision 管理 │─▶│  - SourceRange   │─▶│   - Mermaid 流程/时序图    │
│  - 状态防抖自动存│  │  - 区块模型划分  │  │   - Graphviz DOT 渲染器    │
│  - IndexedDB 固化│  │  - 节点 ID 映射  │  │   - 代码高亮着色器         │
└──────────────────┘  └──────────────────┘  └──────────────┬─────────────┘
                                                           │
                                                           ▼
                                            ┌────────────────────────────┐
                                            │     冻结导出协调器         │
                                            │  ├─ 静态/可编辑 HTML 导出  │
                                            │  ├─ 浏览器打印 A4 PDF 规范 │
                                            │  ├─ 原生 DOCX 映射生成器   │
                                            │  └─ 降级与能力矩阵诊断     │
                                            └────────────────────────────┘
```

#### 数据模型规范 (DocumentRecord & Theme)
- `DocumentRecord`:
  - `id`: string (唯一文档标识)
  - `revision`: number (编辑事务递增修订号)
  - `markdown`: string (权威原文)
  - `meta`: `{ title, author, createdAt, updatedAt }`
  - `theme`: `{ fontFamily, fontSize, lineHeight, primaryColor, paperSize: 'A4', margins }`
  - `options`: `{ mathMode: 'mathml' | 'svg', syntaxProfile: 'commonmark-gfm-v1' }`

---

### 5. Detailed Version Roadmap (0.1 ~ 0.9 -> 1.0)

应用将内置交互式版本路线审查看板，详细涵盖：

| 版本 | 核心功能交付与技术阶段 | 对应验收退出条件 |
|:---|:---|:---|
| **0.1** | **工程规范与技术基线验证 (P0/H0)** | TypeScript 严格模式、Tailwind v4、核心数据模型、公式/图表/分页原型验证通过。 |
| **0.2** | **三栏编辑器与交互基线 (P1)** | CodeMirror 6 编辑器、行号、标题折叠、撤销重做、快捷格式、查找替换、中文输入法兼容。 |
| **0.3** | **工作区管理与草稿恢复 (P1/P2)** | 多文档切换、大纲树实时提取、本地 Markdown/可编辑 HTML 文件导入、IndexedDB 自动恢复。 |
| **0.4** | **全要素排版与公式图表引擎 (P2/H1)** | 原生 MathML/MathJax SVG 双模公式、Mermaid 流程图/时序图、Graphviz DOT、代码高亮。 |
| **0.5** | **A4 物理分页与单文件 HTML 闭环 (P3/H1)** | 210×297mm A4 物理纸张布局、自动页码页眉、含源载荷可编辑 HTML 导出及无损再导入。 |
| **0.6** | **系统级打印 PDF 与原生 DOCX (P3/P4)** | `@media print` 打印 CSS、浏览器打印无损 PDF、原生表格/段落 DOCX 导出、公式降级诊断。 |
| **0.7** | **PWA 离线支持与能力完整性 (P4/H1)** | Web App Manifest、离线缓存架构、断网独立使用、安装提示条。 |
| **0.8** | **全功能综合调优与错误鲁棒性 (P0-P4 汇总)** | 跨浏览器布局防溢出、大文档加载保护、脏文档丢失防护、渲染异常隔离。 |
| **0.9** | **功能完整冻结候选 (Feature Freeze)** | 1.0 前最终候选版，功能完备停止新增功能，提供自测报告与需求追踪闭合。 |
| **1.0** | **审查与验证放行 (Audit & Release)** | 0.9 至 1.0 的全面测试验证、文档审计、各输出格式真实验收、达到正式稳定版。 |

---

### 6. Implementation Steps

1. **Step 1 - 基础设施与数据模型 (0.1)**：
   - 确立 `src/core/model/document.ts`、`src/core/storage/indexeddb.ts`、`src/core/theme/themeSpec.ts`。
2. **Step 2 - 编辑器与工作区交互 (0.2 & 0.3)**：
   - 构建 `src/components/editor/MarkdownEditor.tsx`，支持语法高亮快捷操作、事务撤销栈、中文输入保护。
   - 构建 `src/components/workspace/Sidebar.tsx`，支持多文档增删切、批量导入与标题大纲导航。
3. **Step 3 - 渲染引擎与公式图表 (0.4)**：
   - 构建 `src/components/preview/MarkdownPreview.tsx`，内置 MathML 渲染引擎与 SVG 切换器、Mermaid 解析器、Graphviz DOT 渲染器及代码高亮。
4. **Step 4 - A4 物理分页仿真 (0.5)**：
   - 构建 `src/components/preview/A4PagePreview.tsx`，实现精确物理页计算、页边距、页码、孤行控制与页面指示。
5. **Step 5 - 导出与往返导入中心 (0.5 & 0.6)**：
   - 构建 `src/components/export/ExportModal.tsx`，提供静态 HTML、**可编辑 HTML（含嵌入源载荷）**、浏览器打印 PDF 指令、原生 DOCX 导出（集成 `docx` 库生成 OOXML）。
6. **Step 6 - 版本路线与 1.0 验证看板 (0.7 ~ 1.0)**：
   - 构建 `src/components/roadmap/RoadmapModal.tsx`，直观呈现 0.1~0.9 实施度与 1.0 验收证据指标，支持用户快速核验。
7. **Step 7 - PWA 与离线支持及系统验证**：
   - 配置 Manifest 与离线检查指示，编译测试验证全部功能。
8. **Step 8 - 双向视窗同步滚动 (Sync Scroll)**：
   - 实现 Markdown 源码编辑区与 HTML 预览视窗（流式阅读 / A4 预览）的双向同步联动。
   - 包含防回环锁（Anti-loop lock机制）防止双向事件抖动循环、边缘精准贴靠（Top/Bottom Pinning）。
   - 编辑器工具栏提供「同步滚动 / 独立滚动」动态切换开关。
   - 侧边栏大纲标题点击同步定位源码行与预览标题。
