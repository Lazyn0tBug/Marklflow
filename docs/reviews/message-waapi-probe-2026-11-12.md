# 独立能力实验审查记录

归档说明：下文保留独立实验结论。原目录为 D:/codex/message-waapi-probe；其中“同目录 evidence.json”现归档为 [实验事件证据](../acceptance/message-waapi-probe-2026-11-12.json)。原源码 hash 对应独立实验，不对应后续生产 Hook。生产接入的可复现夹具位于 tests/fixtures/messages/message-lifecycle.html，测试为 tests/e2e/message-lifecycle.spec.ts，接入结果另记，不以此实验代替。

日期：2026-11-12。范围仅为 `probe.tsx`、`index.html`、`bundle.js` 与 `runner.cjs` 的增量审查和 Chromium 能力验证；未改生产文件、依赖清单或 Git 状态。

## 结论

Chromium 中 React 提交后由 `useLayoutEffect` 观察卡片自身 opacity / transform 过渡的主路径成立。正常完成明确记录为 `finished`，两个 transition 均 fulfilled；页面移除不是唯一完成证据。目标过滤也成立：子元素自身 opacity transition 确实存在，但不进入卡片自身 `getAnimations()` 结果；卡片上的 background-color transition 同样被排除。

实现可省去读取和解析 CSS transition 列表的逻辑；不等同于避免样式计算。`getComputedStyle()` 与 `getAnimations()` 仍要求浏览器更新计算样式，且本次未测量性能，因此不能据此断言总成本更低。

## 浏览器验证

- 9 个场景全部通过：StrictMode 与正常完成；零时长；无目标属性变化；reduced motion；单动画 cancel 导致 `finished` reject；退场中卸载清理兜底并抑制 Promise 状态回调；自动到期；手动关闭与 160ms 到期计时近时序幂等；shown 状态卸载后到期计时被清理；暂停过渡后 deadline 兜底完成。
- 验证命令：`node 'D:\codex\message-waapi-probe\runner.cjs'`。
- 环境：React 19.3.1、ReactDOM 19.3.1、Playwright 1.64.1、Chromium 156.0.8078.4（headless）。完整事件与校验记录见同目录 `evidence.json`。
- 源夹具 SHA-256：`probe.tsx` `9439f493f5e9bf35942e555d0f50a71e71a912b440fbf543e9e814630c4e9949`；`index.html` `6bd27d24db8dc1886d9926dbb633cae0786cbae900aa7d95af3b5d57a2984bc8`；`bundle.js` `d14b3d545b5cfda8d81381bae6a6229adf9c8afa3c98b25d0b31b39f42a9002e`。
- 页面错误：0。

## 首次失败与调整

首次加强子元素过滤断言时，runner 等到正常过渡结束并卸载卡片后才查询子元素动画，Playwright 因 `.card` 已消失而超时。这是断言时序错误，不是夹具运行失败。将子元素动画存在性检查移到关闭后、过渡结束前，再运行完整 9 场景，全部通过。之前两次 bundle 构建准备失败原因和后续 alias 修正已记在 README；不计入浏览器验证失败。

## 未验证边界与建议

- UI 将挂载与关闭暴露为两个浏览器事件；未验证同一任务内 React mount+dismiss。按本轮约定保留为缺口，不增加复杂测试入口。
- Firefox/WebKit 浏览器可执行文件缺失，未启动；没有安装浏览器。结果仅代表本机 Chromium。
- 未验证生产 UI 接入、平台 WebView、真实消息组件、视觉表现或性能收益。
- 可将此夹具作为能力证据；接入时仍需针对真实组件的挂载/卸载顺序与目标元素结构做定向复核。
