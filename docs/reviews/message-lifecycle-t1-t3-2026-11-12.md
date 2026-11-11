# 通知生命周期 T1–T3 实施与验收

日期：2026-11-12。分支：architecture-refactor。基线：8aafe18 加本轮工作树差异。审查和测试由 GPT-6 Luna 执行；本记录汇总其结果，不把独立能力实验追认为生产接入通过。

## 实现与审查范围

独立 useMessageLifecycle 观察 CSS 退出过渡，保留 AbortController 清理和有限异常期限；纯呈现组件仅开放 elementRef 和 inert。通知、导入结果和开发样例共用该适配器，移除固定 MESSAGE_LEAVE_MS。导入批次及演示重选使用独立实例，旧回调不可清除新结果。停留时长、消息归属、保存失败和其他带 category 通知的确认规则均未改变。不新增依赖，不改原生、文件存储、渲染器或队列。

Luna 定向检查本轮差异与相关调用方，未发现阻断生产问题；根据意见修正顶层文档的历史状态歧义。当前 T1/T2 已接入，T3 的 Chromium 自动/视觉部分通过，原生及跨平台系统项继续待补。

## 自动验证

验证目录为 D:/codex/markflow-message-validation：复制跟踪文件和全部本轮新增源码/测试，node_modules 联接原工作区依赖。原有未跟踪 PDF 试验文件保持原样并排除在快照外，其中测试引用缺失脚本；本轮没有宣称原工作区包含这些试验的完整检查通过。快照没有本项目 Git 元数据，源码身份以本记录基线及差异为准，不以其构建内嵌提交标识代替。

环境：Windows；Node 24.21.0、Bun 1.4.2、React/ReactDOM 19.3.1、Playwright 1.64.1、Chromium 156.0.8078.4 headless。

| 范围 | 命令与结果 |
| --- | --- |
| 日常门禁（最终执行） | bun run check：类型及 345 个托管源码/配置覆盖、格式、全部 lint/边界检查、112 个单测文件的 823 项测试、生产构建通过 |
| 消息及导入 E2E | bunx playwright test tests/e2e/message-lifecycle.spec.ts tests/e2e/message-region.spec.ts tests/e2e/message-presentation.spec.ts tests/e2e/source-import.spec.ts；初轮 32 项中 31 项通过、1 项失败；后续定向复测及新增测试后共覆盖 33 个唯一用例 |
| 证据复用 | 30 项未受影响结果复用；规范通知模块 URL 的计时用例、增强伪元素断言的正常退出用例及新增非有限时序用例分别通过。不描述为一次重跑 33 项全部通过 |
| 工作台补充检查 | 新建文档并按实际 role=tab 选中态原→新→原切换，通知仍在，页面错误 0；桌面深浅主题及 360×740 长文案已实际截图并查看 |

正常退出用例不仅检查 DOM 消失，还核对目标 opacity/transform 的 finished 均 fulfilled；默认元素查询未混入子元素或伪元素；subtree:true 的阳性查询确认实际 ::after 和子元素过渡存在，白名单另排除 background-color。显式 pseudoElement 条件保留为防御性过滤，不声称向默认列表注入伪元素后测试了该分支。其他用例覆盖零时长、无属性变化、减少动态效果、取消拒绝与剩余过渡结算、暂停期限、非有限引擎时序故障注入、StrictMode 同任务挂载关闭、重复关闭、shown/exit 卸载、替换隔离、inert/焦点和导入失败保留。没有引入 rAF，不声称执行了 rAF 清理测试。

构建保留 hash.js 动态/静态导入混用和单块超过 500KB 的既有警告。未运行无关 Rust 检查或全仓 E2E；本轮未测量性能，不宣称免除样式计算或获得性能提升。

## 首次失败与修正

- 普通权限下 TypeScript 子进程报告找不到脚本；提高执行权限后同门禁可运行，保留初次环境失败。
- 初次格式门禁指出目标设计文档不符合格式；用项目 formatter 修正。末轮格式曾被快照根目录临时 qa-*.mjs 干扰，移至独立证据目录后整道门禁通过，未修改生产以绕过检查。
- 原计时用例直接导入不带 .ts 的开发模块，未在工作台找到通知；规范 URL 后用例通过。模块实例差异是疑似原因，未直接追踪模块图，不将它写成已确证生产根因。
- 注释同步后构建时效门禁拒绝旧 dist，重新构建后复测，未跳过时效检查。
- 增强伪元素断言最初要求默认 getAnimations 结果必含伪元素，断言失败。改为从 subtree:true 确认实际伪元素、默认范围观察卡片，并补可绘制伪元素后通过；生产 Hook 未改变。

以上保留失败现象和修正结果。Playwright 重跑会清理 test-results，不能保证最早的失败 trace 仍存在；不将不存在的历史产物写成已归档。最终截图保存在独立目录后复制入库，避免后续清理。

## 归档与待补

- 历史独立实验：[审查记录](message-waapi-probe-2026-11-12.md)、[事件证据](../acceptance/message-waapi-probe-2026-11-12.json)。其 hash 对应独立探针，不对应当前 Hook。
- 当前可复现夹具：tests/fixtures/messages/message-lifecycle.html 及 message-lifecycle-client.tsx，配套 tests/e2e/message-lifecycle.spec.ts；运行需项目开发服务器，使用既有 Playwright 配置。
- 真实工作台截图：[桌面深色](../acceptance/message-lifecycle-2026-11-12/workbench-message-desktop-dark.png)、[桌面浅色](../acceptance/message-lifecycle-2026-11-12/workbench-message-desktop-light.png)、[360px 长文案](../acceptance/message-lifecycle-2026-11-12/workbench-message-mobile-360x740.png)。窄窗区域无横向溢出，卡片未明显遮挡底部状态栏。
- Windows WebView2、macOS/Linux WebView、读屏与跨平台发行验收待补。Firefox/WebKit 测试浏览器未安装，没有扩大安装。自动测试和浏览器截图不能代替 Tauri 系统验收。

手动验收使用重启后的当前 Tauri 开发构建，记录操作系统、WebView 版本和实际构建提交：按[设计 §10.7](../design/message-surface-2026-11-07.md)检查普通/待确认消息、真实导入、编辑与关闭焦点、Tab、深浅主题/窄窗/减少动态效果。无需人工卡在退出动画时间窗制造竞态。该部分当前未执行，不据此宣称 T3 全平台收口或发行通过。