# M1 桌面壳迁入与验证记录（2026-10-29）

基线baf76cc，桌面参考c7c34b942d67fe92d8df242c052b5457c5d14765。状态：GPT-6 Luna独立审查及Windows桌面壳验证通过，无未解决问题。M0契约见[冻结说明](../design/tauri-migration-m0-contract-2026-10-29.md)，路线见[迁移方案](../design/tauri-migration-plan-2026-10-29.md)。

## 迁入范围

- 从冻结来源迁入src-tauri/icons；其中5个文件保持原字节，原icon.icns实际为PNG，已用原512px PNG内容封装成标准ic09 ICNS容器，未改变像素；沿用产品标识com.markflow.desktop、0.9.1版本和窗口尺寸/标题/系统装饰。
- 新建最小Rust桌面入口，仅注册get_platform_info，移除旧分支文件插件、原生PDF占位和临时文件代码。capability权限集为空，不启用fs/dialog/assetProtocol或全盘范围；未来所需权限随对应阶段加入。
- 平台SDK仅位于src/core/platform/tauri/runtime.ts；通过官方isTauri/invoke接口和Zod严格校验unknown响应。普通Web/非浏览器环境不调用原生命令，原生失败不伪装成Web成功。M1不接App或重建应用服务。
- API/CLI精确沿用来源2.12.4。原分支Rust只声明major2且无Cargo.lock，初次采用缓存tauri2.11.5/tauri-build2.6.3后被CLI版本检查拒绝（JS API为2.12.4）。现固定tauri2.12.4/tauri-build2.7.4并仅更新所需Cargo锁项；保留首次失败日志。本机Rust1.98.1，manifest声明最低1.98，不安装/升级工具链。
- 保留当前普通Web命令；新增dev:desktop绑定127.0.0.1:3000且strictPort，并提供tauri命令。Vite仅新增src-tauri构建目录的watch忽略，保留DISABLE_HMR行为；target/gen忽略，Cargo.lock纳入跟踪。
- CSP为prod/dev分别配置：生产脚本不启用unsafe-eval/unsafe-inline；保留当前生成样式、data/blob图片、同站点Worker/资源以及受现有应用规则约束的HTTP资源。Tauri自动添加本地IPC/CSP所需部分，实际兼容以系统WebView验证为准。

## 验证边界

Luna负责桥接单测、完整bun run check、Rust格式/锁定构建及Windows系统WebView smoke，检查工作台、计算Worker、公式/图表、字体和真实IPC；WebView使用独立测试数据目录与仅回环地址的CDP，不修改产品启动配置、不调用已有用户profile。

本步不迁CI（M2）、文件I/O（M3—M6）、原生导出（M7—M10）、换行/分栏（E0—E2）。现有业务与HTML唯一输出源沿用当前实现；未升级MathJax/Paged.js，不生成PDF、不运行系统保存。非Windows桌面和bundle发布尚未验证。两份M0之前已存在的架构索引修改须保持SHA并排除提交。

官方依据：[Tauri配置](https://v2.tauri.app/develop/configuration-files/)、[Rust命令桥接](https://v2.tauri.app/develop/calling-rust/)、[core API](https://v2.tauri.app/reference/javascript/api/namespacecore/)。这些是实现依据，不替代本轮执行证据。

## 本轮验证结果

- 完整bun run check通过：200受管源/配置、59文件、426单元（含5个桥接用例），类型/lint/source/module门禁及Web生产构建成功。
- Rust格式检查、最终tauri2.12.4/tauri-build2.7.4的cargo check --locked及嵌入前端资源的tauri build --debug --no-bundle -- --locked通过。首次2.11.5/API2.12.4不匹配记录保留，后续匹配构建通过；没有安装/升级Rust工具链。
- Windows系统WebView2 156.0.4314.50实际启动两条路径：http://tauri.localhost/的嵌入前端debug应用，以及tauri dev→bun run dev:desktop→127.0.0.1:3000。各自工作台、真实Worker、编辑后预览ready、MathJax、Mermaid与get_platform_info均通过；CSP/console/page错误及失败请求均0。
- 字体就绪且实际系统回退为Microsoft YaHei UI/Bold；不宣称打包了Plus Jakarta或跨OS字体已验。
- ICNS修复后总长9124，ic09项9116，PNG payload与源icon.png逐字节一致；Pillow识别ICNS/512×512/RGBA并解码。其余5个图标与冻结源匹配。Windows使用未改ICO，此次ICNS-only修复不影响已测no-bundle运行；不因此重跑全面检查，也不把格式通过当macOS打包通过。
- bun.lock原663条package记录及旧workspace依赖不变，只加API/CLI及11个optional平台包（28行新增、0删除）。Cargo.lock为M1新桌面工程锁，固定所需桌面依赖；Web依赖版本不变。
- 两份预存架构索引SHA保持M0清单值，不入提交。测试使用独立WebView profile，仅清理本次创建的进程树/目录；3000/9333/9334端口已释放，测试环境变量不写入产品配置。

详细[验收JSON](../acceptance/tauri-migration-m1-2026-10-29.json)内保留Luna摘要、日志路径、输入SHA和范围。稳定证据目录D:/codex/m1-review-2026-10-29。日志包括bun-check.log、cargo-fmt.log、cargo-check-retry.log、tauri-build-retry.log、native-smoke.log、dev-smoke.log、dev-fonts.log及icon-container-verify.log。

归档artifacts/markflow-dev.exe是已测开发模式产物，依赖开发服务，不作为可分发包。先前嵌入debug exe实际通过smoke后被tauri dev覆盖同一target/debug路径，未单独留二进制或SHA；其当时build/smoke日志保留，验收JSON不伪造归档。源码输入与平台配置有独立SHA。

M1只完成桌面壳和桥接；Windows release/bundle、macOS/Linux、远端CI、原生文件/导出、PDF系统保存及完整发布未验。原EX-T及其他手动门槛保留，停止在M1；不推送，不开始M2。
