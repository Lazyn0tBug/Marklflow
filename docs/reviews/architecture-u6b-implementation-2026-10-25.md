# U6b MathJax共享DOM入口实施审查

日期：2026-10-25；分支：architecture-refactor；父提交：3972d21。范围为草案6 U6b；一次本地提交，不推送。

## 实施边界

core/platform/web/sharedDom持有一个Web共享入口，MathJax初始化、每条公式转换和文档释放均通过该实例调度。renderDocument的公式准备移到原整篇serial之外；serial暂时只保留后续HTML装配和图表工作，待U6c再替换。没有新建公式队列，也没有把Mermaid、Paged.js提前迁移。HTML和DOCX现有生成函数标记公式步骤为export，普通预览默认foreground，独立夹具可传background；打印沿用原HTML生成路径。不改导出busy、冻结快照、授权及平台反馈。

共享入口在步骤边界执行导出、前台、后台的优先级，同档FIFO。每条公式及初始化各保留20秒引擎执行期限，排队不另起期限；旧MathJax启动/转换withDeadline包装及全局failed锁已删除。取消或超期作废当前批次，不交付半成品，必须等待MathJax原生Promise实际结束才释放入口；随后新请求可建立新文档。同步阻塞不能硬中断，异步永不结束时也不能假称已停止。新任务引擎原总期限的保留由U6a负责；当前旧UI调用链未在本步迁入新协调器。

## 文档状态和产物归属

MathJax 3.2.2的getInputJax每次创建独立TeX输入及其宏、标签/编号状态，getDocument创建对应文档。适配器持有本次文档状态，每次转换前切入，转换实际结束后恢复引擎启动基线；makeMethods同步校验并绑定当前状态，恢复时同时重建方法，避免全局方法闭包继续持有已结束输入。独立适配器也检查引擎busy，不能绕过共享入口并行转换。releaseDocument释放局部引用并恢复基线，通过共享入口的局部CleanupList执行；清理失败沿用U6a的阻塞/显式重试规则，不自动重试渲染。没有持久化引擎会话或额外宿主池。

公式结果不再放进全局MathML/SVG Map。prepareMath返回该次渲染独有的字符串产物的局部查询函数，Markdown解析显式接收它，按源文位置、公式内容和display状态取结果；重复的同文公式也分别保留各次编号，不能由公式文本键覆盖。无准备结果时仍输出明确的未就绪诊断。旧clearMathCaches/latexToMathML/latexToSVG/ensureMathJaxReady无人调用的全局入口已删除。审查用例复现了脚注输出重排导致顺序消费错配的问题，已改为按源码位置关联；纯解析mathExpressions只增加可选位置元数据，默认结果保持兼容，不改Markdown语法或Worker协议。这里不是新增公式级优化缓存；U4唯一完整预览缓存不变。

## 审查和验证设计

核对了本地已安装mathjax/es5/tex-mml-svg.js的Startup.getInputJax/getDocument/makeMethods行为：转换Promise读取startup.document，不能仅保存转换方法闭包。实现显式保存输入/文档并在每次调用期间切入，原生Promise返回前保持共享DOM占用。

9项新增单元覆盖跨准备宏/编号隔离、重复公式及解析结果归属、失败后恢复、取消保留入口、跨适配器busy与释放后拒收、排队取消/缺引擎后恢复、转换超时必须等原生返回，以及脚注重排后的源码位置关联，以及BOM/CJK/emoji/CRLF下的原始位置对应。既有启动超时测试改为验证共享DOM超期后仍占有入口，真实启动结束后作废结果；严格第三方边界测试保留。

3项新增Chromium测试分别运行开发、生产构建与普通HTTP。真实MathJax 3.2.2夹具让后台ALPHA文档第一条公式执行时排入BETA导出，验证后续步骤先执行导出、恢复后台后宏仍正确，双方编号从(1)开始，后台重复公式依次(1)/(2)。MathML和SVG均验证；夹具启用tags:ams用于编号验收，不修改应用现有MathJax配置。覆盖分数、根式、上下标、黑板体、命名算子、求和、二项式、aligned和矩阵；验证未知命令报错、取消不继续下一公式、新文档恢复、源位置保留、最大原生转换活跃数1以及启动基线恢复，以及脚注中的公式重排不丢失。SVG文本检查从实际字形引用提取，未将可选取正文或Word/WPS视觉适配当作本步完成。

## 完成记录

bun run check通过：四份严格类型配置覆盖138个受管源/配置，源策略、模块边界和lint通过，39文件259项单元通过，生产构建通过。完整Chromium45项通过（1.2分钟），包含新增三环境MathJax测试3项。最终门禁、完整Chromium回归和文件指纹见[验证JSON](architecture-u6b-evidence-2026-10-25.json)，三环境原始夹具记录见[浏览器记录](../acceptance/architecture-u6b-math-dom.json)。既有Vite配置加载、大分块及NO_COLOR/FORCE_COLOR提示另行保留，不调整依赖来消除提示。

未接新UI/多Tab生产链路，未启用生产双角色，未迁移图表/分页。MathJax保持3.2.2、Paged.js保持0.4.3，锁文件、A0冻结预算及既有验证证据不变。未合并、未移动标签、未推送；其他浏览器、Tauri和实体打印没有在本步验收。
