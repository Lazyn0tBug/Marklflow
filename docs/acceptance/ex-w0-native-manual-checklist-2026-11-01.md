# EX-W0 原生 PDF 保存与默认文件名手动验收（当前口径）

日期：2026-11-01。取代 [2026-10-27 版](ex-w0-native-manual-checklist-2026-10-27.md)（那版早于「打印宿主移入视口并延迟释放」与「先出字节再选位置」的交付顺序重构，结论不再适用，仅留档）。

## 0. 本轮要证明什么

**自动化的 PDF 不是系统保存证据。** 本轮只回答四件事：

1. 打印交付在系统层**真的落了文件**（实际路径、页数、内容完整）。
2. 保存框**未经修改的默认名**是什么。
3. **取消**时发生了什么（是否产生残留文件、能否重试）。
4. 哪些配置被实测覆盖（浏览器/OS/纸张/缩放/边距/页眉页脚/页数）。

不宣称未实测的设备或路径可用；不可用就写「不可用/未验证」。

## 1. 夹具与启动

```sh
bun run dev          # 或 bun run --bun vite --host 127.0.0.1 --port 4180 --strictPort
```

浏览器打开（夹具由 Vite 提供，它以 TS 模块形式引入客户端，**不能用 file:// 打开**）：

```
http://127.0.0.1:3000/tests/fixtures/architecture/web-native-pdf-probe.html
```

夹具调的是**生产导出服务**（`webExportService`），不是 `page.pdf`、不是截图。

设置：A4、100% 缩放、关闭浏览器页眉页脚；记录实际边距与背景图形选项。页数对照探针输出的 `expectedPages`（由冻结产物实时计算，不是写死的常量）；不得靠缩放把页数凑成某个值。

## 2. 探针输出要记的字段

页面下方的 JSON 面板（`<pre data-state>`）在每次导出后给出：

| 字段                                                                            | 含义                                                           | 记录           |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------- |
| `jobTitle`                                                                      | 打印宿主的标题                                                 | 待填           |
| `expectedPages` / `actualPages`                                                 | 冻结产物声明的页数 / 宿主里排出的页数                          | 待填           |
| `missingRows` / `missingParagraphs`                                             | 宿主中缺失的 `ROW_xxx` / `PARA_xxx` 标记                       | 待填（应为空） |
| `finalMarker` / `laterSourcePresent`                                            | `EXW0_FINAL_MARKER` 是否在 / `EXW0_LATER_SOURCE` 是否误入      | 待填           |
| `svgCount` / `imageCount`                                                       | 矢量与位图对象数量                                             | 待填           |
| `links`                                                                         | 宿主里的链接（外链与页内锚点）                                 | 待填           |
| `beforeprintObserved` / `exportBusyAtNativeCall` / `domAtNativeCall`            | 打印请求离开浏览器瞬间的状态（宿主已就绪、业务仍忙、DOM 快照） | 待填           |
| `afterprintObserved` / `pagehideObserved` / `remainingFrames` / `settledFrames` | 打印宿主是否被释放、延迟后是否归零                             | 待填           |
| `htmlSha256`                                                                    | 宿主 HTML 的摘要（两次导出应一致）                             | 待填           |

## 3. 保存矩阵

每个输出目标各做一次：**MathML** 与 **SVG** 两种公式模式。文件名只用于归档，**不得用手动改过的名称冒充系统默认值**。

### 3.1 macOS

| 公式模式 | 输出目标                    | 归档名           | 实际路径 | 未修改前默认名 | 结果 |
| -------- | --------------------------- | ---------------- | -------- | -------------- | ---- |
| MathML   | 浏览器「打印 → 存储为 PDF」 | macos-mathml.pdf | 待填     | 待填           | 待验 |
| SVG      | 浏览器「打印 → 存储为 PDF」 | macos-svg.pdf    | 待填     | 待填           | 待验 |

macOS 默认**没有**与「Microsoft Print to PDF」等价的系统打印设备 ⇒ 该行按「不可用/未验证」记，不要求额外安装设备；浏览器路径的结果不外推到系统设备路径。

### 3.2 Windows

| 公式模式 | 输出目标               | 归档名            | 实际路径 | 未修改前默认名 | 结果 |
| -------- | ---------------------- | ----------------- | -------- | -------------- | ---- |
| MathML   | 浏览器另存为 PDF       | edge-mathml.pdf   | 待填     | 待填           | 待验 |
| SVG      | 浏览器另存为 PDF       | edge-svg.pdf      | 待填     | 待填           | 待验 |
| MathML   | Microsoft Print to PDF | driver-mathml.pdf | 待填     | 待填           | 待验 |
| SVG      | Microsoft Print to PDF | driver-svg.pdf    | 待填     | 待填           | 待验 |

其它 OS 用其实际系统设备另开记录，不由 Windows 推断 macOS。

## 4. 文件级核验

生产可在 Windows，核验可在 Mac（同一份字节）。先用助手读事实：

```sh
bun scripts/check-pdf-file.ts <文件.pdf> CJK_CHECK EXW0_FINAL_MARKER ROW_000 ROW_059
```

助手给出**页数**、**页面尺寸**（应为 A4：595.92 × 842.88 pt）与文本标记的判定。三种判定要分开看：

- `存在` —— 抽到了字符且命中标记；
- `未判定（内容流以子集字形编码，字符无法还原）` —— **常见且不算失败**：浏览器打印把文本编码成子集字形，没有 PDF 库就还原不出字符 ⇒ 文本标记改用**人工**核对；
- `未判定（内容流无法解压）` —— 文件结构异常，值得单独看。

助手**不判定**「文字缺失」——它没有依据这么说。

人工核对（在 PDF 阅读器里）：

- 页数与 `expectedPages` 一致；无多余空白页、重复页、截断。
- 搜索 `CJK_CHECK` 旁的中文能选中复制；首段、跨页表格 `ROW_000`…`ROW_059`、末段 `EXW0_FINAL_MARKER` 都在。
- 公式位置正常（MathML 模式的分数/等号/根式；SVG 模式的公式与 Mermaid 图清楚），且**没有**混入 `EXW0_LATER_SOURCE`。
- 页内链接定位到「最终目标」，外链保留。设备若丢失链接，单列为该路径的兼容性缺口。
- 正文不是整页图像或「截图 + 隐藏文字」。

## 5. 取消

每个输出目标各取消一次，分别记录：

| 项                                         | 记录 |
| ------------------------------------------ | ---- |
| 取消位置（原生打印界面 / 保存框）          | 待填 |
| 是否产生文件（磁盘实际检查，不看应用提示） | 待填 |
| 取消后能否重新导出                         | 待填 |

取消后的应用反馈只表示「已交由浏览器处理」，**不能**当作「已保存」；也不要把 `afterprint` 标志当作保存成功。

## 6. 回填格式

```text
日期/代码提交：
OS/版本：
浏览器/版本：
纸张/缩放/边距/页眉页脚/背景图形：

探针 JSON（每个模式各一份）：
MathML：expectedPages / actualPages / missingRows / missingParagraphs / finalMarker / laterSourcePresent / svgCount / imageCount / links / beforeprintObserved / remainingFrames / settledFrames / htmlSha256
SVG：（同上）

保存矩阵（见 §3）：
文件级核验（助手输出 + 人工核对）：
取消（见 §5）：
截图：
未验证项与限制：
```
