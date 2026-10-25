# U6c Mermaid及DOT共享DOM入口实施审查

日期：2026-10-26；分支：architecture-refactor；父提交：f4d2988。范围为草案6 U6c；一次本地提交，不推送。

## 实施与模块边界

Mermaid适配器和新增的薄DOT适配函数共用core/platform/web/sharedDom的唯一实例。共享调用参数DomScheduling也放在该Web组合边界，公式与图表使用同一priority/signal契约，图表不再依赖公式模块的类型名称。MathJax适配逻辑未变。

Mermaid每张图作为一个engine步骤，保留20秒执行期限和原生Promise实际结束前的占有规则。自建Promise队列已移除；使用原库公开render函数，库内部自身的串行实现不修改，应用侧不会同时送入两个原生调用。文档组装层的整篇serial也已移除；公式和图表分别await共享入口的步骤，导出/前台/后台在步骤边界调度，不嵌套等待同一入口。

DOT在Markdown解析时生成受来源nonce保护的待渲染figure，保留data-line/data-source-end；完整renderDocument统一按文档顺序处理Mermaid和DOT。DOT薄适配在共享入口内调用原renderDotToSVG并净化，不新增Graphviz库、语法实现或布局算法。原同步解析接口现在像Mermaid一样只提供DOT占位；完整输出必须走renderDocument。低层同步DOT函数保留给既有测试，生产完整渲染只通过共享入口调用。

HTML/DOCX已有export优先级自然传入图表步骤；打印继续走原HTML生成函数。未更改导出busy、冻结输入、资源授权、源映射约定和平台反馈。Paged.js原队列留给U6d，本步不迁移。

## 文档隔离、净化与清理

Mermaid在每步执行前以原固定默认主题、strict安全级别、禁用HTML标签及system-ui初始化；文档中的主题指令只影响当次转换。临时宿主和配置恢复分别注册局部CleanupList，成功/错误/取消/超期均清理；清理失败沿用共享入口的阻塞与显式重试规则。原生未返回时不会提前移除宿主或放行下个DOM步骤，不宣称硬取消。

在临时宿主中将原生成SVG的计算样式内联为展示属性，再按原策略净化，去掉生成样式表、脚本及不支持的foreignObject；新增严格SVG根结构检查，拒绝非SVG或空产物。每个文档最终仍净化HTML并逐SVG重写ID/局部引用，保留可选取文字和源figure定位。DOT补齐颜色属性中的引号转义，避免源码颜色值逃出SVG属性；已有有限DOT语法、循环图处理及布局不变。不强行转换为OKLCH。

取消发生时，文档组装不再把取消包装成可展示图表错误，而是作废该次渲染；普通引擎错误仍保留原文、行号和诊断，随后新文档可执行。作者HTML不能伪造受nonce保护的Mermaid/DOT待办属性。

## 审查与验证

新增9项单元覆盖：逐图配置初始化与恢复；原生错误清理与恢复；净化及HTML标签拒绝；取消时保留原生占有；跨Mermaid/DOT优先级；混合图表行范围、诊断和SVG引用；超期等待真实结束；非SVG拒收及作者占位伪造拒绝；DOT颜色属性转义。既有公式、导出、纯Worker、存储和工作台回归保留。

新增3项真实Chromium用例分别验证开发、生产构建和普通HTTP。后台ALPHA红色文档的首张图执行时排入BETA蓝色导出，验证步骤边界先执行导出；再渲染ALPHA，计算后保存的颜色与首次一致。每份包含流程图、现有DOT图和时序图，验证三张静态SVG完整、源行范围、无生成样式/脚本/foreignObject残留、局部引用完整、SVG ID不重复且跨文档不重用；最大原生Mermaid活跃数为1。验证真实语法错误、取消后不执行该文档下一张图、新文档恢复，以及宿主数和共享待办均归零。定向验证初次失败来自夹具预期行号少算主题指令行，已按明确源码行数修正，未放宽实现验收。

bun run check通过：四份严格类型配置覆盖142个受管源/配置，源策略、模块边界及lint通过，40文件268项单元通过，生产构建通过。完整Chromium48项通过（1.6分钟），包含新增三环境图表测试3项。最终检查及完整回归结果见[验证JSON](architecture-u6c-evidence-2026-10-26.json)，三环境原始记录见[浏览器记录](../acceptance/architecture-u6c-diagram-dom.json)。既有Vite配置加载、大分块与NO_COLOR/FORCE_COLOR提示保留。

未修改UI或启用生产双角色，未推进分页迁移。MathJax保持3.2.2、Paged.js保持0.4.3，依赖与锁文件不变，A0冻结预算及历史证据不变。其他浏览器、Tauri、Word/WPS视觉和实体打印未在本步验收。未合并、未移动标签、未推送。
