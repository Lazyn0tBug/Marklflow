# E0：共享源码行布局与会话锚点（2026-10-30）

状态：GPT-6 Luna 独立代码审查与自动验证通过，无未解决阻断；E1/E2未实施。

## 本步范围

以 c99695f 为基线，仅落实迁移方案 E0。编辑器仍使用 wrap=off；不增加自动换行开关、镜像折行测量或拖动分栏，不推进 E1/E2 或 M4。

- 纯 sourceLayout 建立逻辑行累计高度、二分 top→line 和 line→top 换算，以及逻辑行+行内像素偏移锚点（首行允许顶部padding的有限负偏移以准确表示scrollTop=0，其余行偏移及末尾越界均钳制）；包含尾空行，不增加源码换行。可变高度由纯夹具验证，当前生产仍按实测固定行高生成映射。
- 编辑器持有布局缓存，按文本、逻辑行数、字体/行高/宽度失效；相同输入复用映射，行号与同步定位共享累计几何。尺寸、编辑器字体样式/类属性及字体加载事件以 requestAnimationFrame 合帧，卸载取消观察/待执行回调。不引入独立布局 Worker 或虚拟编辑器。
- DocumentSessions.position 追加可选 sourceAnchor/editorLayoutKey，选区仍为字符 offset；读写深拷贝，保留旧像素字段。相同布局使用像素位置，布局不同则恢复逻辑锚点并限制合法 scrollTop；无锚点的旧会话继续像素回退。不修改 DocumentRecord schema、持久化仓储或源附件。
- 大纲定位、编辑器中心章节高亮、flow/A4 双向同步复用共享几何；隐藏编辑器时记录目标锚点，恢复时使用当前布局。几何变化不修改 Markdown/revision，不变更 Worker source map、渲染配置版本或预览缓存身份。

## 验证与门槛

Luna负责纯映射、会话兼容/深拷贝、实际编辑器几何、全量check以及工作台同步滚动和Tab浏览器回归；本记录只声明实际执行结果，不以纯可变高度夹具冒充已实现软换行。

原生对话框、跨OS文件系统/安装包、远端CI与EX-W0系统PDF及默认名等既有待补门槛不由本步覆盖；完整发布验收保持未通过。两份预存architecture索引保留，不纳入本次提交。不推送，不升级MathJax，不替换Paged.js。

## 本轮结果

- 最终bun run check退出0：205受管源/配置、61单元文件、447项测试通过；类型、源策略、模块边界、lint及生产构建通过。定向source-scroll/document-sessions共17项通过。构建仍提示既有chunk体积/hash.js混合导入，未扩大优化范围。
- 两个工作台Playwright spec在当前生产构建Chromium下11/11通过：三视图同步、大纲定位/高亮、flow/A4、视图显隐、多Tab及缓存、跨宽度锚点恢复。属于功能回归，不代表跨浏览器或Tauri视觉验收。
- 大文档夹具large.md为17,584字节/799行；一次纯布局构建观察耗时0.811ms，末端top为19,188px；不作为性能门槛或大规模性能保证。
- 修复Luna发现的锚点偏移越界，以及跨Tab待执行帧的归属问题。Editor以sessionId限定布局effect，切换时清理旧观察器/帧，不重挂textarea。相同布局复用映射、源码/宽度/字体失效、会话锚点深拷贝与旧像素兼容均有定向测试。
- 两份预存architecture索引SHA-256与M0一致；没有修改依赖、MathJax/Paged.js、Worker协议或文档schema。[验收JSON](../acceptance/tauri-migration-e0-2026-10-30.json)记录输入哈希和日志；原始日志D:/codex/e0-review-2026-10-30/。
