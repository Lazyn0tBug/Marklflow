# P1 图片资产签名单点接入（2026-10-29）

基线3d588c3。P0通过后固定file-type22.2.0；主代理实现，GPT-6 Luna执行测试。按用户指示，本步不做独立代码/文档审查，集中到X。每步本地提交，不推送。

## 改动

只在documentAssets已有异步收集/校验边界复用已读取字节，薄适配比较声明MIME与检测结果，异常保留cause并提供来源定位。APNG仅在比较时兼容image/png，不扩白名单、改schema或改原MIME/数据/哈希；同步decodeImage接口不变。HTTP声明去参数、trim及小写化。模块门禁只准documentAssets使用file-type默认入口；旧资产不匹配明确拒绝，不清空或迁移原数据。

Luna浏览器测试发现原detached div解析会触发原生image请求，再加显式fetch导致双请求。改为惰性template解析，只在核准后显式读取；同源、重复图、坏声明、未知字节各一次fetch且无image请求，未允许外部来源0请求。第一次失败证据保留在外部结果目录，最终证据已单独归档。

原10MB单图、25MB总量、128资产、URL/联网限制、15秒读取期限、SHA-256及SVG净化链保留。签名只证明best-effort类型一致性：33字节PNG头可通过签名但浏览器decode失败，原解码/布局检查不被替代。HTML唯一输出源、统一导出/确认/平台交付流程未变；MD/ZIP保留既定源保存例外。

## Luna验证

- 最终完整bun run check通过：198受管源/配置，58文件、418项单元，严格类型/模块门禁/lint/Vite构建通过。
- 生产collectAssets隔离Vite构建在既有Chromium156.0.8078.4执行：五格式、APNG、动画WebP保留原字节/MIME；unknown/mismatch拒绝；HTTP规范化、单次读取、去重、HTML引用替换、无权限0请求及截断签名与decode分离通过。无页面错误。
- 资源测试覆盖缺body、伪装声明、旧资产不匹配、超限流cancel及锁释放。新工作台测试验证拒绝时不交付、不改编辑源，busy释放后原始MD可保存。
- 指定四个工作台spec的非PDF用例34/34通过：web-unified-save、source-import、export-confirmation、export-service（含新增签名拒绝用例）。PDF相关用例通过grep-invert排除；没有生成新PDF或打开系统保存框。保存选择器仍为受控替身，不证明原生磁盘写入。

首轮发现门禁插入遗漏与SVG提示断言错误，已修复；严格类型发现Response测试body的ArrayBufferLike不匹配，改显式ArrayBuffer。相关单测重跑79项通过，生产template修复后最终完整418项通过。构建已有configLoader __dirname及大chunk提示未作为失败，也不表示所有浏览器已验收。

日志D:/codex/p1-image-signature-check.log；浏览器结果D:/codex/p1-image-signature-browser-results；[最终生产探针](../acceptance/image-signature-p1-browser-2026-10-29.json)。独立审查留X，未自动推进C/X/Tauri。EX-W0系统证据、原生保存/WordWPS/跨OS/干净安装/远端CI仍待补或未执行，不宣称完整验收通过。


提交前Luna事实核对：验收JSON可解析，日志418/34计数及成功退出一致；bun.lock只新增候选关联10个package key，无删除或已有条目改版。历史稳定66/66产物存在且SHA-256一致；tag-release.patch仍为9284099EDCD54CE0D9580C42C370BC3163E4DE5DF0652E163BF9411F31683D48，保持未跟踪且不提交。此次核对不是X独立审查。
