# M3：原生 I/O 独立适配（2026-10-30）

状态：GPT-6 Luna 独立审查与本机 Windows 自动验证通过，无未解决阻断；仅独立适配，系统选择器和跨 OS 验收仍待补。

## 范围与接口

仅实现 `src/core/platform/tauri/files.ts` 和 Rust 受控文件命令，不接 React、SourceImport、文档绑定、原文件保存或导出服务的生产组合。沿用当前业务、HTML 唯一正文输出源；不引入新的格式生成路径。M4/M5/M9分别接入打开、源保存及统一导出。

原生选择后仅返回随机文件键、显示名和大小；路径在 Rust 会话 Map 内，读/写键互斥，打开键不能写入、保存键不能读取；显式 release 撤销键，退出进程自动失效。不接收来自前端的任意读写路径，不从文档附件恢复授权。不增加 JS filesystem/dialog 通用权限或 assetProtocol。Rust 通过官方 dialog 插件调用系统选择器，临时文件采用 tempfile 的同目录持久化提交；Cargo.lock记录解析版本。批量选择中途失败撤销本批已创建的键。

官方 dialog 插件仅返回 Option，无底层选择器错误通道；None统一表述为“未选择目标/关闭”，不能证明是主动取消，也不能声称已经识别全部系统对话框故障。可观察的IPC、参数、文件读取和提交错误均继续抛出，不降级为取消。真实对话框失败诊断留待有系统证据时补齐。

读取上限50 MiB，实际读取最多上限+1字节，拒绝超限而不交付部分文本；严格UTF-8，去掉开头BOM，与Web解码语义一致，格式/NUL/资产校验仍由后续现有导入边界执行。写入上限100 MiB，先写同目录临时文件并sync_all，再persist替换；拒绝非普通目标/符号链接，失败由临时对象清理。成功才回报saved，不把生成或选择成功当作写入成功。不承诺断电持久性或未经验证OS的原子替换能力；权限/ACL继承行为须后续实测。

保存建议名沿用ExportFile；本层拒绝路径分隔符、NUL、空名和点目录，不重复实现文件名清洗。选择阶段不创建/截断目标。ByteSaveTarget适配提供release，由未来生产组合在取消确认、失败及成功后的finally释放；打开键留给M4绑定生命周期。无自动Web回退。

## 验证层级

Luna负责TS协议测试、Rust真实临时文件夹具、严格类型/lint/模块边界/全量单元/生产构建、Rust格式和编译检查，并审查文档与实现。真实文件夹具与系统选择器交互分别记录；不会以mock选择器代替真实取消/覆盖弹窗验收。

待补：系统选择器交互、跨OS真实替换/权限/文件系统差异、生产打开/原位保存/导出接入、远端CI与安装包；EX-W0系统PDF文件和默认名、原生保存/WordWPS等既有门槛继续保留，完整发布未通过。不开始M4，不推送，不升级MathJax或替换Paged.js。


## 本轮结果

- bun run check退出0：204受管源/配置、61单元文件、443项单元，含7项新增TS协议测试；类型、lint、模块边界和生产构建通过。构建保留既有chunk体积/hash.js动态导入提示，未扩大优化范围。
- cargo fmt --check、cargo check --locked、cargo test --locked均退出0，7项Rust真实临时文件测试通过，包括新建/覆盖/空文件、50MiB边界/超限、UTF-8/BOM、读写授权隔离/撤销及Windows锁定目标的真实persist失败清理。未注入所有write/flush故障，不宣称全故障覆盖或断电保证。
- Cargo.lock新增dialog 2.8.4、tempfile 3.27.0及必要传递项；dialog引入的tauri-plugin-fs 2.7.1只作为传递依赖，无JS filesystem权限或生产调用。Cargo解算合并部分Windows重复传递版本，未升级现有直接依赖；bun.lock/package.json未改。
- Luna确认两份预存architecture索引SHA-256与M0一致，未纳入提交。原始日志归档D:/codex/m3-review-2026-10-30/，详见[验收JSON](../acceptance/tauri-migration-m3-2026-10-30.json)。

