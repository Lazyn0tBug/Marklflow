# 架构重构 A1 实施与验收

日期：2026-10-25；分支：architecture-refactor；A0提交：32b5b0c。状态：A1实现与本地验证完成，A2及之后未启动。本分支承载完整重构，不因本轮只做A0/A1而另拆阶段分支。

## 实施结果与模块边界

| 模块/边界 | 实际变化 | 证据 |
| --- | --- | --- |
| model/themeSchema、policy/htmlRules | schema、HEX/RGB、URL/CSS/引用规则脱离DOMPurify和window；保留旧浏览器模块兼容导出 | Worker纯层编译、node无DOM导入、既有策略回归 |
| parse/markdown | 纯语法树、outline、公式提取及带UTF-16 offset/行列的块源范围；原文保留，结果可structuredClone | node测试、Worker真实导入及实体解码 |
| render/markdownHtml、htmlPolicy | 语义到HTML与公式/DOT生成留在浏览器渲染层，净化实例首次使用时创建；旧parser模块仅兼容门面，纯调用点已改用parse | 既有内容/公式/分页/导出回归 |
| DocumentRepository端口/Web实现 | unknown输入校验；既有文档v1/数组兼容读取，支持storageVersion=1封装，未知版本隔离不猜迁移；IDB保持v1，恢复备份使用metadata内的markflow-recovery命名空间 | 版本与损坏数据单元测试、真实IDB兼容/恢复E2E |
| 损坏恢复 | 原记录/字符串不删除、不覆盖；稳定内容指纹备份，界面可下载恢复JSON；配额失败保留原数据及瞬时备份 | 原件字节/对象断言、备份下载E2E、配额/损坏备份索引测试 |
| 写入正确性 | 入队前校验与快照，修改串行，拒绝较旧修订覆盖新数据；失败不污染后续写入；克隆嵌套默认主题 | 并发、迟到保存及主题隔离测试 |
| 类型环境与依赖门禁 | browser/worker-pure/tools/integration配置分别检查；边界脚本覆盖静态导入、再导出、type import、动态导入及宿主全局；负例防止Worker环境获得Window/Node | 四套typecheck、check:boundaries、负例/违规导入测试 |
| CI入口 | 既有CI调用统一typecheck/lint，增加architecture-refactor触发分支；Worker烟测使用独立dev宿主，其余用生产preview | 本地完整回归；没有远端运行声明 |

Worker烟测暴露了真实传递依赖问题：decode-named-character-reference的browser入口在模块导入时调用document.createElement。现在用Vite别名解析同一1.3.0包的无DOM默认入口，不伪造window/document。测试额外检查©及组合数学实体，保留语义。此前首次运行还被依赖预构建HMR刷新打断；测试宿主改为无HMR页面，仍执行真实Worker。

开发门禁新增@babel/parser 7.28.5（仅devDependencies），因为本地TypeScript 7不提供旧Compiler API。实体解码包原已作为传递依赖存在，本轮增加精确直接声明以稳定别名来源；没有升级MathJax、替换Paged.js或更改其适配器。恢复备份命名空间不是预览持久化缓存。

## 验收结果

- `bun install --frozen-lockfile`通过且无变更；四环境类型、source policy、模块边界、lint、87项单元测试及生产构建通过。
- 全部25项Chromium测试通过：24项生产环境E2E，1项开发模块的真实Worker导入烟测。包含不安全HTTP、离线HTML、三视图、同步滚动、A4、DOCX结构及新的存储恢复。
- [A1测量](../acceptance/architecture-a1-comparison.json)与[A0基线](../acceptance/architecture-a0-baseline.json)使用同语料散列、同浏览器及视口；最终复测未与E2E并行。按冻结的最大样本×3加固定余量门槛全部通过，页数仍3/9/23，隐藏宿主和样式数量前后一致。
- [机器可读证据](../acceptance/architecture-a1-evidence.json)保存文件指纹、检查项、Worker失败/修正、版本与耗时对照。样本少、开发服务测量且受运行环境影响，不据此宣称性能优化收益。

## 自审与剩余边界

AC01（纯层/导入边界）和AC02（已知版本与恢复）已获得本轮证据；不据此把AC03—AC37全部标为完成。修改涉及浏览器恢复提示，但不引入多Tab界面、任务管理器或产物缓存。

未知存储版本不自动转换；保留备份供人工恢复。普通JSON可原样表达；IDB循环对象/BigInt下载用标记便于检查，原始结构化记录仍在原库，不能宣称JSON导出是任意structured-clone数据的无损往返工具。备份写入失败会阻断该次加载/写入并提示，原件仍保持，瞬时备份可在当前会话下载。

IDB维持原v1和documents/metadata结构，不删库、不清表、不增加需升版的object store；真实E2E确认原元数据及损坏记录未变。备份在metadata保留命名空间，旧应用无需升版即可打开，代码回滚不要求迁移/删除源数据。跨窗口协作/完整恢复管理仍后续治理，不把单实例本地写入队列宣称为跨进程锁。

仍保留原有Vite configLoader与大块构建警告。未验证Word/WPS视觉、实体打印、其他浏览器、Tauri；未实施A2预算执行、A3生产Worker调度、A4多Tab/缓存或后续引擎替换。没有推送、合并、移动标签或运行远端CI。
