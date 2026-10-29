# P0 图片签名隔离验证（2026-10-29）

基线 a011312。GPT-6 Luna 执行隔离测试；独立代码、文档审查按用户要求留到 X。结论 GO-P1，不表示生产接入或完整验收已完成。

固定 file-type 22.2.0（MIT），使用包默认入口的 fileTypeFromBuffer(Uint8Array)。官方发布包、integrity、依赖树及类型环境记录见[摘要](../acceptance/image-signature-p0-2026-10-29.json)，[浏览器矩阵](../acceptance/image-signature-p0-browser-2026-10-29.json)。原始脚本和日志在 D:/codex/.codex/tmp/marklflow-image-signature-p0-2026-10-29，样本已归档至 tests/fixtures/image-signature/samples.json。图片由 Pillow 12.3.0 本地真实编码，AVIF 不是 canvas 回退；未复制外部图片。

Vite 8.3.5 / 既有 Chromium 156.0.8078.4 实测 18 条：五格式、APNG、动画 WebP、声明伪装、文本、短头、截断主体及 SVG。无页面错误或探针异常。独立入口相对空 Vite 基线净增 73,037 字节，gzip 约 21.5 KiB；隔离安装含候选共 10 包。这不是整个应用生产 chunk 的精确差值。小样本多次探测约 0.01–0.05ms，首次 PNG 约 1.2ms，仅本机观察，不是性能保证。无 Node builtin 或 Buffer shim；依赖类型声明含 Node stream 类型，项目已有类型环境可通过，不新增运行时垫片。

P1 准入契约：只允许现有五种 MIME；唯一新增兼容比较为检测 image/apng 对声明 image/png，不改存储 MIME/schema。HTTP MIME 去参数、trim、转小写；image/pjpeg 等不自动扩白名单。未识别、解析异常和不匹配明确拒绝，保留源文档。复用已读取字节，不再次请求。合法签名但主体截断的 PNG 仍被识别而 Image.decode 失败，必须保留原解码/布局检查；签名不能宣称完整、安全或替代 SHA-256。

本步没有生产依赖或源码改动；未推送，不升级 MathJax/Paged.js。后续 P1 已获用户授权，C/X/Tauri 未启动。EX-W0 系统文件/默认名及原生保存、Word/WPS、跨 OS、干净安装和远端 CI 仍待补或未执行。
