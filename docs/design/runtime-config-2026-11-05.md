# 运行期配置契约

日期：2026-11-05。基线：architecture-refactor / `9a63c63`。状态：原有配置已实施，2026-11-11 新增日志配置与验收待实施。

本文定义 MarkFlow 运行期的**唯一输入面**：配置文件 ✓。与[日志基座设计](log-base-plan-2026-11-03.md)同源 ✓ —— 那份管记录怎么写 ✓，这份管运行怎么被配置 ✓。

## 1. 动因

1. **环境变量是隐式输入** ✓：它跨进程继承 ✓、不由代码掌控 ✓、**单测会因它而红** ✓。2026-11-04 交付宿主上就红过一次 ✓：`cargo test` 继承了上一轮的 `MARKFLOW_PROBE_PRODUCT_PRINT=1` ✓，一条本该固定的断言当场失配 ✓（"测试不密封"✓，不是那条断言写错了 ✓）。
2. **改一次行为的代价有两头** ✓：设变量要记住 ✓，用完要记得清干净 ✓ —— 漏清就串到下一轮 ✓（同一次事故的第二种形状 ✓）。
3. **证据要说得清这轮跑的是哪份配置** ✓：配置的值与**来源**都要进日志 ✓ —— 否则"配置没生效"与"配置生效了但值不对"分不开 ✓。

## 2. 位置

| 项           | 位置                                     | 说明                                                                                             |
| ------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **读的位置** | `<当前目录>\conf\markflow.toml`          | 当前目录是**运行期的根** ✓ —— 不是编译期的仓库路径 ✓（那在别的机器上不存在 ✓）                   |
| 开发期       | `<仓库>\conf\markflow.toml`              | 开发期当前目录恒为仓库根 ✓，故这份文件**随仓库管理** ✓（改用例就是改文件 ✓，改动看得见 ✓）       |
| 发布后       | 用户自备 `<当前目录>\conf\markflow.toml` | 仓库里那份**改名成 `markflow.toml.example`** ✓ —— 发布出去的是**形状** ✓，不是某台机器上的取值 ✓ |
| 日志目录     | 平台 app_log_dir()，可用 log.directory 覆盖                        | 配置位置沿用当前目录，日志采用平台默认可写目录                                              |

当前目录由进程工作目录决定，控制配置文件位置。缺省日志使用平台 app_log_dir()，普通安装启动无需选择工作目录。log.directory 为相对路径时仍按当前目录解析。

## 3. 形状

```toml
[log]
level = "info" # error / warn / info / debug / trace / off
format = "json" # json / text
stdout = false # 开发排障时显式开启
directory = "" # 空串使用平台日志目录
max_total_bytes = 83886080 # 80 MiB
retention_days = 14
call_timeout_ms = 200

[export]
root = "web" # web（浏览器打印对话框）或 native（Windows 静默路径）

[probe]
sample = "docs/acceptance/pdf-probe/frozen-sample.html"
pdf_output = "docs/acceptance/pdf-probe/probe-pdf-output.pdf"
product_print = false
page_ready_timeout_seconds = 60
report_timeout_seconds = 600
```

仓库里那份在 `conf/markflow.toml` ✓（开发期入仓 ✓）。

## 4. 字段

| 字段                               | 类型   | 默认                                                      | 作用                                                                                                                               |
| ---------------------------------- | ------ | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `log.level`                        | 字符串 | 空或未知 → debug 与 release 均为 info | 全局日志级别 ✓                                                                                                                     |
| `log.stdout` | 布尔 | `false` | 控制 Tauri 文件日志的 stdout 镜像，debug 与 release 均缺省关闭，文件不可用时同样遵循此值 |
| `log.format`                       | 字符串 | `text`                                                    | 记录形态 ✓：`json` 是机器验收用的形态 ✓                                                                                            |
| `probe.sample`                     | 字符串 | `docs/acceptance/pdf-probe/frozen-sample.html`            | 受控样本的归档原件 ✓（相对路径按当前目录解析 ✓）                                                                                   |
| `probe.pdf_output`                 | 字符串 | `docs/acceptance/pdf-probe/probe-pdf-output.pdf`          | 静默 PDF 的输出目标 ✓                                                                                                              |
| `export.root`                      | 字符串 | `web`                                                     | 导出的根 ✓：`web`（浏览器打印对话框 ✓）或 `native`（Windows 的静默路径 ✓）。**平台没有静默 PDF 而选了它 ⇒ 不回落 ✓**，导出明说 ✓ ✓ |
| `probe.product_print`              | 布尔   | `false`                                                   | 探针页是否做一次产品形态的打印 ✓（会弹原生保存对话框 ✓）                                                                           |
| `probe.page_ready_timeout_seconds` | 整数   | `60`                                                      | 页面就绪的护栏 ✓（**护栏不是需求** ✓）                                                                                             |
| `probe.report_timeout_seconds`     | 整数   | `600`                                                     | 读报告的总数上限 ✓（探针请了人来选目标 ✓，得容得下人的时间 ✓）                                                                     |

**探针那一节是开发期夹具的形状** ✓，不进产品路径 ✓。

新增日志配置字段均待实现。

| 字段 | 类型 | 默认与约束 |
| --- | --- | --- |
| log.directory | 字符串 | 空串使用平台 app_log_dir()。显式目录不可写时报告不可用，用户可修改配置，来源记录为显式配置 |
| log.max_total_bytes | 整数 | 83886080，允许 8388608 至 1073741824 字节 |
| log.retention_days | 整数 | 14，允许 1 至 365 天 |
| log.call_timeout_ms | 整数 | 200，允许 10 至 2000 ms，约束独立日志发送的接收等待 |

上述数值为本轮设计默认值，实施时用实际会话日志量和交互测量复核。整数越界回退该项默认值，类型错误按整份配置 invalid 处理。stdout=false 同样适用于文件不可用。目录实际路径只在本机诊断入口展示，run_start 记录目录来源、有效预算、保留期和等待值。

## 5. 取值纪律

| 情况                   | 行为                                                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 文件缺失               | 全部默认值 ✓；来源记 `config_source=missing` ✓                                                                         |
| 文件存在但解析不了     | **同样走默认值** ✓；来源记 `config_source=invalid` ✓。**配置坏掉不该让应用起不来** ✓ —— 配置是输入 ✓，不是启动条件 ✓   |
| 已知字段给了不对的类型 | 那个文件整体按 `invalid` 处理 ✓                                                                                        |
| 未知字段               | 忽略 ✓（多写的键不该让应用起不来 ✓）                                                                                   |
| 超时给了 0             | 按默认值走 ✓ —— 这条规矩原来属于环境变量 ✓（给的不是正整数就按默认值 ✓），**改输入的通道换了，输入的约束不该跟着换** ✓ |
| 路径字段给了空串       | 按默认值走 ✓                                                                                                           |

**来源、有效级别、有效形态都写进 `run_start`** ✓（`config_source`、`log_level`、`log_format`、`log_stdout`）—— 记的是**有效值** ✓，不是文件里的原文 ✓。

## 6. 相对路径

配置里的相对路径**按当前目录解析** ✓ —— 与配置本身同一个根 ✓，不引入第二个"相对谁"的答案 ✓。绝对路径原样用 ✓。

## 7. 发布的那一步

发布时统一做三件事 ✓：

1. `conf/markflow.toml` **改名**成 `conf/markflow.toml.example` ✓（发布出去的是形状 ✓）。
2. `.gitignore` 加 `conf/markflow.toml` ✓（发布之后它就是用户自己的文件了 ✓，不该被提交 ✓）。
3. 发布说明写明**安装态平台默认日志目录、打开日志目录及导出日志的入口** ✓（安装态没有仓库根 ✓，当前目录由用户决定 ✓）。

**在发布之前不改这三件事** ✓ —— 开发期那份配置是要随仓库管理的 ✓。

## 8. 被移除的环境变量

| 原来的变量                          | 现在在哪                             | 为什么                                                                          |
| ----------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------- |
| `MARKFLOW_LOG`                      | `log.level` ✓                        | 隐式输入 ✓                                                                      |
| `MARKFLOW_LOG_FORMAT` | `log.format` | 沿用配置文件作为唯一输入来源 |
| `MARKFLOW_PROBE_SAMPLE`             | `probe.sample` ✓                     | 同上 ✓                                                                          |
| `MARKFLOW_PROBE_PDF`                | `probe.pdf_output` ✓                 | 同上 ✓                                                                          |
| `MARKFLOW_PROBE_PRODUCT_PRINT`      | `probe.product_print` ✓              | 同上 ✓；且**探针页 URL 的构造改回纯函数** ✓ —— 开关是参数 ✓，不是读环境得来的 ✓ |
| `MARKFLOW_PROBE_PAGE_READY_TIMEOUT` | `probe.page_ready_timeout_seconds` ✓ | 同上 ✓                                                                          |
| `MARKFLOW_PROBE_REPORT_TIMEOUT`     | `probe.report_timeout_seconds` ✓     | 同上 ✓                                                                          |

**脚本里的环境变量不动** ✓：`RUST_TOOLCHAIN` 是 CI 钉工具链的标准通道 ✓，`BASELINE_URL`／`BASELINE_OUTPUT` 是脚本自己的旋钮 ✓ —— 它们不是应用的输入面 ✓。

## 9. 验证

| 项           | 怎么验                                                                                                  | 结果                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 配置解析     | `cargo test`（`config::tests` 8 条 ✓）                                                                  | 缺失／损坏／覆盖／归一／相对路径／导出的根各一条 ✓                                                |
| 探针 URL     | `cargo test`（`the_product_print_switch_is_a_parameter_and_not_an_ambient_one` ✓）                      | 开关是参数 ✓，环境里有没有那个变量都一样 ✓                                                        |
| 用例总数     | `cargo test --features pdf-probe`                                                                       | 全仓 62 条 ✓：macOS 60 条 ✓（3 条 unix only 除外 ✓），Windows 59 条 ✓（2 条 windows only 除外 ✓） |
| 静态检查     | `cargo clippy --all-targets --features pdf-probe -- -D warnings`                                        | 无告警 ✓                                                                                          |
| Windows 分支 | `bun scripts/check-windows-com.ts`                                                                      | 配置模块也进夹具 ✓ —— 它在 Windows 上一样要编 ✓                                                   |
| 前端         | `bun run lint` ✓ `bun run typecheck` ✓ `bun run test:unit`（542 条 ✓） `bun run test:e2e`（143 通过 ✓） | 全绿 ✓                                                                                            |

### 9.1 日志配置新增验收（待实施）

验证配置文件缺失、字段缺省、显式 false 与 true。字符串 "true" 属类型错误，按 §5 整体回退默认并记录 config_source=invalid、log_stdout=false。run_start 记录有效布尔值。分别验证普通记录、健康摘要、文件不可用三条路径，关闭时均不发送 stdout，关闭与输出失败分别表示。开启后 stdout 返回错误只停用镜像，阻塞风险按日志设计 §3.1 记录。Windows 桌面运行验证关闭和显式开启的配置、日志文件与实际终端输出。增加默认 INFO、directory 默认与覆盖、数值上下界与非法值、总量和保留期、日志获取入口及日志独立发送等待验收。原有测试结果仅覆盖旧配置，新增字段不计入已验范围。

## 10. 关联文档

- [日志基座设计](log-base-plan-2026-11-03.md)：记录怎么写 ✓；本文管运行怎么被配置 ✓。
- [Windows 构建与验收清单](../reviews/windows-build-check-2026-11-03.md)：宿主上怎么改配置、怎么取日志 ✓。
- [探针阶段记录](../reviews/pdf-probe-stage-record-2026-11-02.md)：探针的取证过程 ✓；2026-11-05 记了输入面从环境变量换成配置这一笔 ✓。
