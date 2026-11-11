# 页面业务事件回传的问题与收口计划

日期为 2026-11-11，核对分支 architecture-refactor，HEAD 为 65fa09b。关联 [日志基座设计](../design/log-base-plan-2026-11-03.md) §4.2、§6.1。本文记录代码核对和已有定向测试证据。

## 当前确认的状态

| 项目 | 状态及依据 |
| --- | --- |
| P1 消息事件端口 | 7808b6c 已提供 MessagePort.event，桌面经 log_event 上报 |
| P2 页面就绪 | markAppReady 已上报 page_ready |
| P3 调用事件 | 当前 files.ts 的 invoke 入口没有 call_started、call_finished 或 call_id 接线。tests/unit/tauri-files.test.ts 当前没有此前描述的两条 P3 测试 |
| 跨端关联 | 页面 page_call 以 call_id 管理，原生命令 command span 尚未接收该 ID。页面事件配对不足以唯一关联交错的同名原生命令 |
| 通道结果 | 原生返回 accepted、dropped、rejected，桌面消息端口目前丢弃返回值，上报异常也被吞掉 |
| P4 契约与验收 | 四步收口已规划，详见日志设计 §6.1。实现与真实 Windows 证据待补 |

当前 reportEvent 位于 src/core/platform/web/capture.ts，后续共用平台出口的位置需与实际接线同步。

## 历史现场与待查原因

早期记录声称新增的两条 P3 测试仅收到 call_started，并观察到 isTauri 第一次为 true、第二次为 false。当前工作树缺少该实现和测试，且无对应差异快照，因此保留为历史观察，根因待查。

此前“mockReturnValue(true) 只保证第一次调用”的解释有误。该方法设置持续默认返回值，只有 mockReturnValueOnce 才是单次值。当前测试在 resetAllMocks 后恢复 true，单凭这段代码不能推导第二次变假。后续应恢复当时快照并检查中途重置、重新赋值和未结束异步任务。既不能据此归因测试夹具，也不能据此认定产品路径正确。 [Vitest 官方 API](https://vitest.dev/api/mock#mockreturnvalue)

## 验证证据与限制

上一轮 Luna 对 65fa09b 运行 npx vitest run tests/unit/tauri-files.test.ts，17 项通过。首次启动因 Vite 临时配置写入权限失败，获得相应工作区权限后运行通过。此次文档更新复用该证据。17 项不包含历史 P3 事件测试，不证明调用事件接线完成。真实 Windows 桌面操作、成对事件落盘及跨端关联仍待验。

## 处理方向

先完成日志设计的四步收口。假原生按命令名区分业务请求和 log_event，分别安排响应和收集事件，避免日志调用消耗业务测试的一次性响应队列。失败注入覆盖日志拒收、丢弃、异常和不返回。业务调用与日志通道分别观测结果，数据来源、关联、接收和落盘各按实际证据记录。
