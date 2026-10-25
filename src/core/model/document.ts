/**
 * MarkFlow (墨流) 核心文档数据规范
 * 依据《Markdown 编辑器总体设计方案 V0.2.8》第 5.1 节实现
 */

export interface DocumentMeta {
  title: string;
  author?: string;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
  filePath?: string;
}

export interface ThemeSpec {
  fontFamily: 'sans' | 'serif' | 'mono';
  fontSize: number; // 14 ~ 18px
  lineHeight: number; // 1.5 ~ 2.0
  primaryColor: string;
  paperTheme: 'clean-white' | 'warm-paper' | 'dark-slate';
  paperSize: 'A4';
  margins: {
    top: number; // mm
    bottom: number;
    left: number;
    right: number;
  };
}

export interface DocumentAsset {source:string;mime:string;bytes:number;sha256:string;data:string;license?:string}

export interface DocumentRecord {
  assets?: DocumentAsset[];
  schemaVersion: 1;
  id: string;
  revision: number;
  markdown: string;
  meta: DocumentMeta;
  theme: ThemeSpec;
  options: {
    syntaxProfile: 'commonmark-gfm-v1';
    mathMode: 'mathml' | 'svg';
  };
}

export const DEFAULT_THEME: ThemeSpec = {
  fontFamily: 'sans',
  fontSize: 15,
  lineHeight: 1.75,
  primaryColor: '#0d9488',
  paperTheme: 'clean-white',
  paperSize: 'A4',
  margins: {
    top: 20,
    bottom: 25,
    left: 20,
    right: 20,
  },
};

export const INITIAL_SAMPLE_MARKDOWN = `# 量子退相干与量子计算系统工程报告

> **编制单位**：MarkFlow 量子系统架构组  
> **文档版本**：v0.9-RC2 (基线稳定版)  
> **保密级别**：公开技术报告 · 遵守 CC-BY 4.0 协议

---

## 1. 摘要与背景

在现代物理与量子信息处理中，微观量子比特（Qubit）与宏观外界环境的不可逆相互作用会导致**量子退相干（Quantum Decoherence）**。

本工程报告评估超导量子处理芯片在极低温环境（$T < 15\\text{ mK}$）下的相干衰减动力学模型，并给出基于纠错编码的稳定容错阈值。

### 1.1 关键物理指标
- 超导传输子（Transmon）主频：$f_{01} \\approx 4.852\\text{ GHz}$
- 平均横向相干弛豫时间：$T_2^* = 124.6\\ \\mu\\text{s}$
- 双比特受控非门保真度：$\\mathcal{F}_{\\text{CZ}} \\ge 99.82\\%$

---

## 2. 动力学理论与数学公式

超导量子比特体系的密度矩阵演化由 **Lindblad 主方程** 精确描述：

$$\\frac{d\\rho}{dt} = -\\frac{i}{\\hbar}[H, \\rho] + \\sum_{k} \\left( L_k \\rho L_k^\\dagger - \\frac{1}{2} \\{L_k^\\dagger L_k, \\rho\\} \\right)$$

### 2.1 行内物理公式推导
当纯态处于基态 $|0\\rangle$ 与激发态 $|1\\rangle$ 的相干叠加态 $|\\psi(0)\\rangle = \\alpha |0\\rangle + \\beta |1\\rangle$ 时，在布洛赫球面上的退相位因子为 $\\gamma(t) = \\exp(-t / T_2)$，满足概率归一条件 $|\\alpha|^2 + |\\beta|^2 = 1$。

### 2.2 矩阵表示与多行推导
量子哈密顿量矩阵与测量跃迁算符如下式所示：

$$H = \\hbar \\begin{pmatrix} \\frac{\\omega_q}{2} & g \\cos(\\omega_d t) \\\\ g \\cos(\\omega_d t) & -\\frac{\\omega_q}{2} \\end{pmatrix}$$

高斯退相干分布的概率密度函数可表述为：

$$P(x) = \\frac{1}{\\sigma \\sqrt{2\\pi}} \\exp\\left( -\\frac{(x - \\mu)^2}{2\\sigma^2} \\right)$$

著名的欧拉恒等式展现了代数与几何的统一：

$$e^{i\\pi} + 1 = 0$$

---pagebreak---

## 3. 系统架构与硬件工作流

量子测控主机（QPU Controller）通过低温微波链路实现纳秒级脉冲下发。以下时序图展示了一个单次量子测量与实时前馈纠错循环：

\`\`\`mermaid
sequenceDiagram
    autonumber
    participant FPGA as 极速测控 FPGA
    participant DAC as AWG 微波发生器
    participant QPU as 低温超导芯片
    participant ADC as 量子放大量子探测器

    FPGA->>DAC: 触发预失真高斯测控脉冲
    DAC->>QPU: 注入微波调制共振腔 (4.85 GHz)
    QPU-->>ADC: 腔反射信号相位偏转
    ADC->>FPGA: 快速解调 I/Q 信号 (20ns 采样)
    Note over FPGA: 实时阈值判决与错误校正
    FPGA->>DAC: 发送动态纠错相位补偿
\`\`\`

### 3.1 测控网络拓扑图 (Graphviz DOT)
分布式多通道量子测控机箱连接架构如下所示：

\`\`\`dot
digraph QuantumControlTopology {
    rankdir=LR;
    node [shape=box, style=filled, fillcolor="#f0fdf4", color="#16a34a", fontname="sans-serif"];
    edge [color="#0d9488", fontname="sans-serif"];

    MasterClock [label="超稳铷原子钟基准\\n(10 MHz)", fillcolor="#e0f2fe", color="#0284c7"];
    HostPC [label="中央编译控制器\\n(MarkFlow 调度器)", fillcolor="#fef3c7", color="#d97706"];
    SubRackA [label="通道机箱 A\\n(Q0 - Q31)"];
    SubRackB [label="通道机箱 B\\n(Q32 - Q63)"];
    QPU [label="64 量子比特超导芯片\\n(稀释制冷机 15mK)", fillcolor="#ede9fe", color="#7c3aed"];

    MasterClock -> SubRackA [label="高精度同步时钟"];
    MasterClock -> SubRackB [label="时钟分配"];
    HostPC -> SubRackA [label="QASM 脉冲指令"];
    HostPC -> SubRackB [label="QASM 脉冲指令"];
    SubRackA -> QPU [label="XY / Z 测控线"];
    SubRackB -> QPU [label="读出谐振腔"];
}
\`\`\`

---

## 4. 实验测试数据汇总

测试机组对不同微波驱动功率下的退相干时间进行了 10,000 次蒙特卡洛统计：

| 测控组别 | 微波功率 (dBm) | 平均 $T_1$ (μs) | 平均 $T_2^*$ (μs) | 读出保真度 | 状态判定 |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Control-A1** | -30.5 | 118.2 | 96.4 | 98.4% | 符合工程标准 |
| **Control-A2** | -28.0 | 134.7 | 112.9 | 99.1% | 优异表现 |
| **Control-B1** | -25.0 | 142.1 | 124.6 | 99.8% | 最佳工作点 |
| **Control-B2** | -22.5 | 98.4 | 64.2 | 96.5% | 存在功率展宽 |

---

## 5. 软件与测控算法实现

算法调度核心采用 TypeScript 实现，保证无阻断响应时间：

\`\`\`typescript
interface QuantumPulse {
  channelId: number;
  frequencyHz: number;
  durationNs: number;
  amplitude: number;
}

export function scheduleSyndromeExtraction(rounds: number): QuantumPulse[] {
  const pulseQueue: QuantumPulse[] = [];
  for (let r = 0; r < rounds; r++) {
    // 注入 X 轴校准脉冲
    pulseQueue.push({
      channelId: r % 4,
      frequencyHz: 4.852e9,
      durationNs: 24,
      amplitude: 0.85
    });
  }
  return pulseQueue;
}
\`\`\`

---

## 6. 结论与发布建议

本批次超导量子芯片在 $T < 15\\text{ mK}$ 环境下完全具备容错表面码运行能力。建议直接在 **0.9 候选基线** 冻结当前配置，并进入 **1.0 正式验证与验收流程**。
`;
