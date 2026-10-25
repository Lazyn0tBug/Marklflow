# TypeScript 严格化改造计划

日期：2026-10-25。基线：html / b4446e21c4c7bcf2eeb4a7d8c382223d1580ebfa；本地附注标签 0.9.2 标记该提交。工作分支：typescript-strict。

## 范围与交付规则

应用已使用 TypeScript；本任务固化严格检查、修复索引和可选属性边界，并收紧 MathJax/Paged.js 适配。每步验证后一次本地提交，不推送分支或标签，不合并 main，不移动 0.9.1，不升级 MathJax 3.2.2 / Paged.js 0.4.3。不修改历史审查证据来冒充本次验证。0.9.2 是基线标签，package.json 产品版本沿用 0.9.1，版本发布另行处理。

## 基线评估

39 个 .ts、11 个 .tsx；唯一跟踪的 .js 为第三方 MathJax 发布产物，保留。strict 临时检查通过；strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes 有108条诊断/17个文件，其中 App.tsx 49条、graphvizRender.ts 17条。当前 lint 实为 tsc；allowJs=true；未明确 include。

## 步骤与验收

| 步骤 | 内容 | 验证及提交 |
| --- | --- | --- |
| S0 | 保存计划、标记基线、建立分支 | 工作区、标签和基线引用核对；计划独立提交 |
| S1 | strict=true、allowJs=false、明确源码/测试/工具配置检查范围；独立 typecheck 与真正 lint，CI/check 调用对应门禁 | 锁文件安装、类型检查、lint、单元、生产构建；一次提交 |
| S2 | 开启 noUncheckedIndexedAccess/exactOptionalPropertyTypes；修复全部源码和测试诊断 | 不用批量非空断言/强转/忽略消除诊断；检查空文档、缺失选择、图解析与资产边界；全门禁和完整 Chromium 回归；一次提交 |
| S3 | MathJax/Paged.js 运行时能力收窄与适配器隔离；限制第三方生命周期接口暴露；补充缺失/畸形 API、输出校验和清理回归 | 不改变引擎版本、不增加 Worker/缓存优化；保持文档宏隔离、超时/队列策略；全门禁和完整 Chromium 回归；一次提交 |

## 实施约束

- 外部接口在边界检查；内部数据用精确类型。使用 unknown 而非 any，检查索引/正则捕获/空集合，不伪造默认文档或忽略错误。
- 可选属性缺省时省略键；只有语义确实需要才允许显式 undefined。修复优先表达真实状态，而非扩大所有接口到 undefined。
- lint 首轮约束类型逃逸和基础可靠性，避免将全库格式重排混入任务；第三方 vendor 不检查、不改写。
- 第三方适配声明只描述真实使用的最小接口，运行时检查补足声明无法保证的能力。Promise 不等于可取消，不冒称解决主线程永久阻塞。
- TS 不替代 schema/能力检测；已有导入 schema 和普通 HTTP 检测保留。Zod/文档模型全面统一、存储全链路治理、引擎升级及性能优化不在本次范围。

## 完成记录

S0：基线已核对，计划建立。后续每步在对应提交中更新实际改动、结果和限制。

S1 工具选择：typescript-eslint 当前 peer 范围 <6.1.0，不支持项目 TS 7.0.2；移除试装依赖，采用锁定版本 Oxlint。首轮仅明确类型逃逸与基础可靠性规则，不默认启用格式/未使用变量清理。tsc 继续独立执行完整类型检查。

S1 完成：strict/allowJs/include 范围固化，typecheck/lint 分离并接入 CI；锁定 Oxlint 1.89.0。frozen install、类型、lint、41单元及生产构建通过。沿用已有构建分包/configLoader警告，不修改业务行为；本分支未推送，远端CI未执行。

S2 完成：开启 noUncheckedIndexedAccess/exactOptionalPropertyTypes，108条原始诊断全部消除；修复文档选择、撤销重做、双向滚动锚点、文件枚举、DOT捕获/布局、图片编码及DOCX选项。schema 输出省略 undefined 可选键，保留空字符串/空数组；未扩大全部接口为 undefined。新增4项运行时边界回归，45单元、20 Chromium、类型/lint/构建通过。历史基线证据不改写。

S3 完成：MathJax/Paged.js 适配入口均做运行时能力收窄和结果校验，业务层不再接触第三方启动工厂/分页组件；补充13项负例及生命周期回归。58单元、20 Chromium、类型/lint/构建通过；lint临时显式any负例确实阻断。引擎版本、超时等待/队列隔离及历史验证边界保持。详见 ../acceptance/typescript-strict-2026-10-25.md。

后续R0–R4完整审查：13组门禁/适配器/分页失败路径发现已修复；最终76单元、22 Chromium及全部门禁通过。见 ../reviews/typescript-strict-review-2026-10-25.md 与 ../acceptance/typescript-strict-review-evidence.json。本分支继续仅本地保存，未升级MathJax/Paged.js。
