# E2：工作台分栏宽度调整（2026-10-30）

状态：GPT-6 Luna独立审查与验证通过，无未解决阻断。基线6fc130d1a40f5c6f8bc23296e4b39dd84d715e24，参考74d7a3cadc61e4d108205a1484750f553b23628b的分栏交互，不迁入其ExportModal或旧固定行高逻辑。

## 范围与交互

- 分隔条只在编辑器和HTML同时开启时出现；默认均分，拖动只分配工作台面板空间，保留共享内容max-width=1024配置，不改变文档/导出纸张。
- 8px分隔条之外的可用宽度按比例分配，各栏最小360px，比例范围为15%—85%与最小宽度要求的交集。空间不足保留最小宽度，在工作台内部横向滚动；不自动隐藏视图、不反转上下限。
- Pointer Capture跟随拖动，移动按requestAnimationFrame合帧；阻止分隔条pointerdown默认聚焦/选区行为，不更改编辑器焦点或字符选区。pointerup才提交偏好；pointercancel/lostcapture/窗口失焦/隐藏任一栏/切Tab取消并恢复起始偏好，卸载清理捕获和待执行帧。
- 键盘左右每次2%，Home/Enter或双击恢复均分；separator有名称、方向、控制对象及按实际约束计算的min/max/now。最小宽度导致没有实际位移的操作不覆盖旧偏好，明确重置除外。
- 新偏好markflow_split_preferences_v1为严格version=1/ratio结构，最多256字符；缺失时只读本origin的旧markflow_split_ratio规范小数字符串，范围校验后导入内存。新值损坏则默认均分，不再尝试旧值；不改写旧键、不扫描其他origin。写存储失败继续内存操作。
- 单视图填满，恢复双视图沿用最近偏好并按当前尺寸约束；最后视图保护继续由现有App控制。复用E1逻辑锚点/测量恢复，比例不进入DocumentRecord、MD散列、渲染配置版本、Worker协议或预览缓存身份；不新增布局任务引擎。

## 验证边界

Luna负责纯边界/偏好、指针取消/键盘/焦点、七种显隐组合、窄屏横滚、E1锚点与Tab恢复、flow/A4/缓存与源码不变的回归及完整check。新增分栏按现有开发工具风格，由Luna执行Impeccable detector及桌面/窄屏截图查看。

不推进M4，不改依赖、MathJax/Paged.js或原生权限，不推送。真实OS IME、跨浏览器/Tauri视觉及EX-W0系统PDF/默认名、原生保存/对话框、WordWPS、跨OS包等既有门槛继续待补，完整发布未通过。两份预存architecture索引原样保留，不纳入提交。

## 验证结果

- 完整bun run check退出0：212受管源/配置、63单元文件、453项单元；类型、源策略、边界、lint和生产构建通过。未新增依赖或改变生产渲染逻辑。
- 同一份最终生产构建的Chromium回归21/21通过：E2 3项、source-scroll 10项、tabs 8项。随后只加强取消断言，生产代码未变，E2 3/3再次通过，最终typecheck/lint均退出0；不把复验重复累计成24个独立用例。
- pointercancel、窗口blur、独立lostpointercapture、隐藏HTML造成分隔条卸载四条路径均先确认比例实际改变，再校验恢复均分、跨2个rAF无回弹、捕获释放且偏好未写入。合成cancel/blur事件用于验证机制，不代表真实OS失焦手动验收；整体组件卸载清理由代码审查核对。
- 拖动前后编辑器focus/字符选区/正文不变；键盘/均分复位、7种显隐组合、最小360px/窄屏内部横滚通过。现有E1源锚点、Tab缓存切回、flow/A4同步回归通过；A4页数、物理尺寸及preview reference不因分栏改变，max-width仍1024。
- 偏好单测验证新键优先、旧值只读导入、范围/长度/结构非法回默认、存储不可用不阻止操作。没有实际位移的边界操作保留preferred值；此规则经代码审查，不额外声称覆盖所有指针设备。
- Impeccable detector结果[]；桌面、684px窄屏及A4截图由Luna实际查看并归档。当前Chromium功能/视觉通过，不代表跨浏览器或Tauri视觉验收。
- 证据位于D:/codex/e2-review-2026-10-30/，包括e2-final-fullcheck.log、e2-final-browser.log、e2-cancel-hardening.log、e2-final-typecheck.log、e2-final-lint.log、impeccable-detect.log及split-desktop/narrow/a4.png；[验收JSON](../acceptance/tauri-migration-e2-2026-10-30.json)记录输入哈希与待补门槛。
