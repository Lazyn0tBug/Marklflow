# EX-W3 自动回归与收口记录（2026-10-29）

计划见[小步计划](../design/web-regression-closeout-plan-2026-10-29.md)。本轮只完成可自动验证部分，不宣称完整验收或发布通过；EX-W0、原生保存及Word/WPS人工显示仍待补，不推进EX-T，不推送。

## W3a：依赖与全量回归

中断前node_modules为空，离线恢复已结束；用户手动bun i并新增、暂存bun.lock，明确授权本轮一并提交。清单未改，MathJax3.2.2/Paged.js0.4.3未变。bun install --offline --frozen-lockfile --ignore-scripts通过，锁文件哈希不变；这只确认本地缓存/锁文件一致，不冒充空目录安装或远端CI。未安装新浏览器，仅使用已有开发测试浏览器。

新增生产站点资源测试：阻断其他HTTP来源，覆盖纯解析、公式、Mermaid、DOT、A4分页及阅读HTML导出，确认样例不依赖外部CDN。自包含HTML断网阅读沿用既有实际浏览器测试；不宣称应用断网冷启动、Service Worker或远程图片无条件离线。

完整check通过：197受管源/配置、57个单元测试文件、377项单元、严格类型/覆盖/边界/lint/生产构建。全量115项浏览器回归通过（3.9分钟），包括最新EX-W2长Unicode/失败/取消/激活时机与三视图、多Tab、缓存/调度、HTML唯一内容源。新增测试上下文网络覆盖调整另经integration类型检查。既有大包/hash.js及Vite配置提示不影响通过，未通过依赖升级处理。

实际环境：Windows win32 10.0.26300，Bun1.4.2，Playwright1.64.1，已有Chromium156.0.8078.4；其他浏览器/OS不由此推断。具体安装版本、日志及源哈希见[自动回归JSON](../acceptance/web-regression-auto-2026-10-29.json)。未跟踪tag-release.patch保持原样，不参与提交。

## W3b：实际产物与稳定归档

W3a提交4825614。将本轮66个测试产物/观察文件按原测试目录复制至D:/codex/ex-w3-evidence-2026-10-29/artifacts，逐项校验原字节SHA-256；检查脚本及归档清单独立保留，后续重跑不会清理该目录。来源追踪使用源码提交、测试/夹具名称、冻结内容标记、串行化HTML散列及文件散列，不虚构产物自带的修订元数据。

自动产物核验通过：

- 5份PDF，共26页：A4页面范围、可提取文字/CJK、关键末尾内容、嵌入字体及ToUnicode、绘图指令；原生PDF语料两种数学模式各6页，60行/18段全部保留、无后来编辑标记、内外链接可定位，串行化HTML散列与存档匹配。两份原生语料仅含1个原始1×1图片资源并保留矢量，不存在整页图片代替正文。
- 4份DOCX：ZIP无坏项、XML可解析、内部关系目标及书签可解析；冻结来源和混合文本/表格标记保留。图片公式属于已确认的现有降级，非OMML可编辑公式。未用结构检查冒充Word/WPS显示一致。
- 3份资源ZIP：document.md/manifest可读取，资源名散列与实际字节一致，包内引用有效；原样源保存仍是HTML内容转换的既定例外。
- 11份HTML：运行资源引用和CSS URL自包含，无可执行脚本/外部运行时资源；可编辑源附件保留现有非执行数据通道。自包含网页的断网读取与恢复由既有实际浏览器用例通过，不等于应用断网冷启动。

视觉：以PDFium渲染五份PDF所有26页的联系表查看，未见新增可见截断、表格/代码丢尾或MathML分数线占满行。该检查是缩略联系表，不宣称逐页出版比例精校；Word/WPS人工显示、浏览器系统PDF保存及原生选择器实际落盘仍待补。

细项、每份文件哈希/路径、字体/绘图/关系数量及检查脚本哈希见[产物JSON](../acceptance/web-regression-artifacts-2026-10-29.json)。日志D:/codex/ex-w3b-artifact-check.log；QA使用已有bundled Python/pypdf/PDFium，不成为应用或发布依赖。PDF为现有开发测试浏览器生成的文本/矢量预检，没有截图转PDF、隐藏OCR字层或新PDF生成引擎。

## 后续

W3b提交2460070。W3c已核对[支持表](../design/web-export-support-2026-10-29.md)、四份当前架构/路线文档和阶段计划：明确自动部分完成，系统保存/人工显示、干净安装/远端CI未补齐或未执行，完整验收和发布门槛仍未通过。EX-T前置仍为完整EX-W3通过，本轮不推进。

已核对W3a的源码/锁文件Git LF哈希、W3b实际产物及清单/检查脚本哈希，文档本地链接和状态一致；检查器一度误用archiveManifest字段名，已按实际artifactManifest字段修正并通过，不修改已通过的产物或将错误记录为应用缺陷。代码检查及全量回归证据仍为W3a真实结果，W3c只有文档/JSON变更，没有重复运行引擎或把旧计数冒充新测试。

[阶段汇总JSON](../acceptance/web-regression-closeout-2026-10-29.json)分列自动通过项和未验门槛。用户新增bun.lock已在W3a提交，未跟踪tag-release.patch原字节保持不变。没有推送/移动标签、升级MathJax、替换Paged.js、引入Chromium/Puppeteer或截图方案。
