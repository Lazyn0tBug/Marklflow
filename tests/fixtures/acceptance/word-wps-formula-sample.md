# Word/WPS 原生公式验收样本

本文件用于人工核对：导出的 .docx 里，下列公式应当是 **Word 原生可编辑公式**，而标注为「降级」的应当是 **图片**（其替代文本带源 LaTeX）。期望答案由 `scripts/check-docx-formulas.ts` 给出。

## 原生公式

行内：$E=mc^2$

块级分式与根式：

$$
\frac{a+b}{c}=\sqrt{x^2+1}
$$

带次数的根式：

$$
\sqrt[3]{x+1}
$$

上下标：

$$
x_i^2 \quad y_{ij} \quad z_{ijk}
$$

带括号与等号：

$$
\left(a+b\right)^2=c
$$

## 降级公式（图片，替代文本带源 LaTeX）

求和：

$$
\sum_{i=1}^{n} i
$$

矩阵：

$$
\begin{matrix} a & b \\ c & d \end{matrix}
$$

样本结束标记：FORMULA_SAMPLE_END。
