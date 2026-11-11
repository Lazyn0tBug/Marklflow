# 页面业务事件回传：问题与当前解决情况

日期：2026-11-11。分支：`architecture-refactor`。相关：`docs/design/log-base-plan-2026-11-03.md` §4 / §5.2。

## 1. 背景

契约 §4 定义了页面→原生的业务事件回传通道，枚举四种：`page_ready` / `call_started` / `call_finished` / `page_error`。审查发现**产品路径只发其中一种**（错误），另外三种在原生枚举与机器校验器里存在，却没有任何地方发送。

处理方向：**发**（不是从契约里删）。理由：契约 §4 与机器校验器的配对规则都建在这条通道上；删掉等于放弃"页面那次调用与原生侧那条记录对得上"这一能力，而这正是"日志说不清是哪儿"的另一半。

## 2. 分片与当前状态

| 片 | 内容 | 状态 |
| --- | --- | --- |
| P1 | `MessagePort` 增加 `event(...)`；网页端口进控制台，桌面端口进原生日志；载荷仍是封闭形状 | **已完成并提交**（`7808b6c`） |
| P2 | 页面起来时发 `page_ready`（`markAppReady()`） | **已完成并提交**（`7808b6c`） |
| P3 | 受保护命令两侧发 `call_started` / `call_finished`（共用一个 `call_id`），供原生侧按 `call_id` 开 `page_call` span | **代码已写，未验证**（见 §3） |
| P4 | 测试与契约同步 | 未开始 |

P3 的落点：`src/core/platform/tauri/files.ts` 的 `invoke()` 助手（该助手只服务受保护命令 ⇒ 平台信息、运行期配置、写日志这三条不受守卫的命令不发 ⇒ 日志量不涨）。`reportEvent()` 放在 `src/core/platform/messages.ts`（平台层），网页捕获与桌面文件层都从那里取，不跨层。

## 3. 问题：P3 的测试只剩一条事件

### 症状

`tests/unit/tauri-files.test.ts` 新增的两条测试失败：期望 `call_started` 与 `call_finished` 各一条，实际只收到 `call_started`。

### 定位过程

1. 直接调用 `reportEvent()` 两次 ⇒ ⇒ 两条都到达 ⇒ ⇒ 通道本身没问题。
2. 产品路径 ⇒ ⇒ `reportEvent` 进入两次 ⇒ ⇒ 但 `port.event()` 只被调用一次 ⇒ ⇒ 第二次卡在 `await resolveMessagePort()` 上。
3. 在 `isDesktopRuntime()` 里打印 ⇒ ⇒ **第一次 `isTauri()` 返回 true，第二次返回 false** ⇒ ⇒ 于是 `resolveMessagePort()` 第二次选了**网页端口** ⇒ ⇒ `call_finished` 走了控制台 ⇒ ⇒ 没进原生日志 ⇒ ⇒ 只剩 `call_started`。

### 根因

**在测试夹具里，不在产品代码里。** 假原生侧的 `isTauri` 是 `vi.fn()` ⇒ ⇒ `vi.resetAllMocks()` 把它清成返回 `undefined` ⇒ ⇒ 用例里重新 `mockReturnValue(true)` 只保证**第一次**读取为真 ⇒ ⇒ 第二次读取又是假 ⇒ ⇒ 端口选择随之摇摆。

真实环境里 `isTauri()` 读 `window.__TAURI_INTERNALS__` ⇒ ⇒ 恒定 ⇒ ⇒ 产品代码这条路径**没有问题**。

### 修法（待做）

让假原生侧的 `isTauri` 在一个用例内**稳定为真**（在 mock 工厂里给默认实现，而不是靠每个用例重新设），⇒ ⇒ 于是端口选择不再摇摆 ⇒ ⇒ P3 的两条测试才断得住。

## 4. 未完成与未验证

- **P3 的测试目前是红的**（两条）⇒ ⇒ 因此 P3 的代码**没有提交** ⇒ ⇒ 工作树里是未验证的改动。
- P3 的产品路径**没有真机证据** ⇒ ⇒ 真实桌面构建里两条事件都进原生日志这件事**未验证** ⇒ ⇒ 需要一次 Windows 构建与运行。
- P4（契约 §4/§5.2 补上"产品路径发哪些事件"与"只给受保护命令发"这两条）未开始。

## 5. 顺带记下的一条

假原生侧改造之后，`native.invoke` 的 `log_event` 调用被单独接走（不进命令那条排队）⇒ ⇒ 否则业务事件会占用 `mockResolvedValueOnce` 的排队 ⇒ ⇒ 把别的用例的断言打乱 ⇒ ⇒ 这一条是**夹具的约定**，不是产品的。
