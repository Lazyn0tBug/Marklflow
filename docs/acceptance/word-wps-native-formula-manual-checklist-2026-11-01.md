# Word/WPS 原生公式人工验收

日期：2026-11-01。样本：`tests/fixtures/acceptance/word-wps-formula-sample.docx`（源：`.../word-wps-formula-sample.md`，由应用的生产导出路径产出）。

## 0. 本轮要证明什么

**OOXML 结构已被自动化覆盖**（`tests/unit/docx-math-ooml.test.ts` 断言 `m:oMath`/`m:f`/`m:num`/`m:den`/根式/上下标；`tests/unit/docx-formula-report.test.ts` 断言本样本的实际结构）。缺的只是**宿主应用的事实**：Word 与 WPS 认不认这个文件、公式能不能编辑、保存重开会不会提示修复。

⇒ 这一轮**不能**由结构检查代替；三个应用（macOS Word、Windows Word、WPS）**各记一份，不互相推定**。

## 1. 预期答案（由 `bun scripts/check-docx-formulas.ts tests/fixtures/acceptance/word-wps-formula-sample.docx` 给出）

原生公式（应为 **Word 可编辑公式**）：

| #   | 文本           | 结构                                    |
| --- | -------------- | --------------------------------------- |
| 1   | `E=mc2`        | m:sSup, m:e, m:r                        |
| 2   | `a+bc=x2`      | m:f, m:num, m:den, m:rad, m:d, m:e, m:r |
| 3   | `3x+1`         | m:rad, m:d, m:e, m:r                    |
| 4   | `xi2 yij zijk` | m:sSub, m:sSubSup, m:e, m:r             |
| 5   | `(a+b)2=c`     | m:sSup, m:e, m:r                        |

降级公式（应为 **图片**，替代文本带源 LaTeX）：

| #   | 替代文本                                     |
| --- | -------------------------------------------- |
| 1   | `\sum_{i=1}^{n} i`                           |
| 2   | `\begin{matrix} a & b \\ c & d \end{matrix}` |

其它图片：0。

## 2. 每个应用走一遍

对 **macOS Word / Windows Word / WPS** 各做一次，逐项记 **通过 / 异常**：

1. 打开文件：是否直接打开、**有无「文件已损坏，是否修复」提示**（有 ⇒ 记为异常，附提示原文）。
2. 原生公式 1（`E=mc2`）：单击是否进入**公式编辑态**（光标出现、可改结构），还是只能选中一个图片/对象。
3. 原生公式 2（`a+bc=x2`）：分式与根式是否都是原生对象，能否分别编辑分子/分母/根号内。
4. 原生公式 4（`xi2 yij zijk`）：上下标是否原生可编辑。
5. **改一处**：把公式 1 的 `2` 改成 `3`（或任意可编辑改动），保存。
6. 关闭并**重新打开**：改动是否还在；有无修复提示。
7. 降级公式 1（求和）：确认它是**图片**（不能编辑公式结构）；右键 →「查看替代文字/alt text」是否显示 `\sum_{i=1}^{n} i`。
8. 降级公式 2（矩阵）：同上，替代文本应为 `\begin{matrix} a & b \\ c & d \end{matrix}`。
9. 版面抽查：段落标题、代码块、表格是否仍正常（公式降级不应破坏排版）。

## 3. 回填格式（每个应用一份）

```text
应用与版本：
操作系统与版本：
文件：tests/fixtures/acceptance/word-wps-formula-sample.docx

打开：无/有修复提示（原文：）
公式 1 E=mc2：可编辑公式 / 图片 / 其他（现象：）
公式 2 分式根式：
公式 4 上下标：
改动并保存重开：改动保留 / 丢失；有无修复提示：
降级公式 1（求和）：图片 + 替代文本 = ...
降级公式 2（矩阵）：图片 + 替代文本 = ...
版面抽查：
截图：
未验证项：
```

证据落点：`docs/acceptance/word-wps-native-formula-<应用>-<日期>.md`，截图进 `docs/acceptance/`。

## 4. 边界

- 三个应用结论**不互推**：Word 的通过不代表 WPS 通过，反之亦然。
- 若某应用打不开文件（提示修复），先记现象与提示原文，**不要**用「Word 会自动修复」解释掉；这是本轮最需要暴露的问题。
- 只如实记录观察到的行为；没有实测的项写「未验证」，不写成通过。
