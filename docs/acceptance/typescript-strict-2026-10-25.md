# TypeScript 严格化本地验证记录

日期：2026-10-25；分支 typescript-strict。基线 b4446e21c4c7bcf2eeb4a7d8c382223d1580ebfa，本地附注标签 0.9.2。计划见 ../design/typescript-strict-plan.md。

## 结果

| 步骤 | 结果 |
| --- | --- |
| S1 | strict=true、allowJs=false，显式 include 源码/测试/配置；类型和 Oxlint 门禁独立，CI 已配置；41单元及构建通过 |
| S2 | noUncheckedIndexedAccess/exactOptionalPropertyTypes 开启，108条诊断消除；45单元、20 Chromium及构建通过 |
| S3 | MathJax/Paged.js 最小适配接口与运行时能力/返回值校验；58单元、20 Chromium、类型/lint及构建通过 |

本地命令：bun install --frozen-lockfile；bun run check；bun run test:e2e。Oxlint 负例探针验证：临时源码显式 any 被拒绝，退出码1；文件随后删除。最终工作区不包含探针或日志产物。

## 第三方边界

- MathJax 全局入口作为 unknown，在适配器内校验启动 Promise、转换方法、文档隔离工厂及其结果；仅向业务层暴露 resetDocument/convert。
- MathML 校验 math 根节点及错误输出；SVG 校验 DOM 容器和 SVG 子节点。后续仍执行既有 HTML/SVG 净化和引用完整性检查。
- 文档宏状态隔离仍是每文档重建 TeX input jax；启动和转换有界等待保留。转换超时未结束时继续要求重载，不假装底层已取消。
- Paged.js 声明不再将未知 JS 导出视为已验证实例，适配器校验构造器、preview、chunker/polisher、三个 hook 和正整数页数；对业务层隐藏第三方实例。
- 清理幂等；chunker 销毁失败仍尝试 polisher 销毁；初始化缺失 hook 时清理可用实例。分页超时保留宿主并锁定队列直到底层结束的策略保持。
- 源文档 schema 省略 undefined 可选键，保留合法空值；没有扩大所有类型为 undefined，没有用批量非空断言/忽略标记压过诊断。

## 范围与限制

MathJax 3.2.2、Paged.js 0.4.3、TypeScript 7.0.2 保持；不实施引擎升级、Worker、跨文档缓存、编辑器迁移或 Graphviz WASM。package.json 产品版本仍为0.9.1，0.9.2只是本次指定的基线标签。

保留 skipLibCheck=true，类型检查不宣称覆盖依赖声明内部正确性；Oxlint 当前为限定基础规则，不宣称全套类型感知 lint。没有新增生产运行依赖，Oxlint仅为开发依赖。既有大分包/configLoader警告仍存在。

本次未推送，GitHub CI未运行；不宣称 Linux/其他浏览器、Word/WPS、系统实体打印或跨设备字体完整验收。历史HTML审查证据保持不变。main、html、0.9.1及0.9.2基线引用不移动。
