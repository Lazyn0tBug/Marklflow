/**
 * MarkFlow (墨流) 版本规划与 1.0 验收审查看板
 * 对应设计方案第 13 章：0.1 至 0.9 实施路径与 0.9->1.0 审查验证放行机制
 */

import React, { useState } from 'react';
import { CheckCircle2, ShieldCheck, Flag, Sparkles, X, RefreshCw } from 'lucide-react';
import {renderDocument,assertArtifact} from '../../core/render/documentRenderer';
import { DocumentRecord } from '../../core/model/document';
import { extractOutline } from '../../core/parser/markdownParser';

interface RoadmapModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentDoc: DocumentRecord;
}

export const RoadmapModal: React.FC<RoadmapModalProps> = ({ isOpen, onClose, currentDoc }) => {
  const [activeTab, setActiveTab] = useState<'roadmap' | 'audit' | 'diagnostics'>('roadmap');
  const [testLog, setTestLog] = useState<string[]>([]);
  const [testing, setTesting] = useState(false);

  if (!isOpen) return null;

  const milestones = [
    {
      version: '0.1',
      phase: 'P0 / H0',
      title: '工程规范与基线验证',
      desc: '锁定 React 19/Vite/Tailwind v4 工具链，完成公式、图表、分页与导出原型基线验证。',
      status: 'verifying',
    },
    {
      version: '0.2',
      phase: 'P1',
      title: '三栏编辑器与交互基线',
      desc: '实现三栏布局、标题折叠、撤销/重做、格式快捷指令、中文输入法保护及字数统计。',
      status: 'verifying',
    },
    {
      version: '0.3',
      phase: 'P1 / P2',
      title: '工作区与草稿恢复',
      desc: '多文档会话管理、IndexedDB 本地自动保存、多文档切换及实时大纲树提取。',
      status: 'verifying',
    },
    {
      version: '0.4',
      phase: 'P2 / H1',
      title: '全要素排版与公式图表引擎',
      desc: '原生 MathML 优先渲染、MathJax SVG 切换、Mermaid 流程/时序图、Graphviz DOT 矢量图。',
      status: 'verifying',
    },
    {
      version: '0.5',
      phase: 'P3 / H1',
      title: 'A4 物理分页与源载荷 HTML 闭环',
      desc: '210×297mm 纸张排版、页码指示、单文件含源载荷可编辑 HTML 导出与 源载荷往返导入（按样例验证）。',
      status: 'verifying',
    },
    {
      version: '0.6',
      phase: 'P3 / P4',
      title: '系统级打印 PDF 与原生 DOCX',
      desc: '浏览器 @media print 无损打印 A4 PDF、docx 库构建原生 Word 段落与表格、能力降级诊断。',
      status: 'verifying',
    },
    {
      version: '0.7',
      phase: 'P4 / H1',
      title: 'PWA 离线能力与环境自包含',
      desc: 'Web App Manifest 配置、全离线字体与静态资产支持、断网独立使用、安装提示支持。',
      status: 'verifying',
    },
    {
      version: '0.8',
      phase: 'P0-P4 汇总',
      title: '综合排版健壮性与边界防护',
      desc: '超宽表格滚动保护、长公式自适应、渲染错误隔离、草稿未保存防丢失提示。',
      status: 'verifying',
    },
    {
      version: '0.9',
      phase: 'Feature Freeze',
      title: '功能完整冻结候选版本 (当前)',
      desc: '0.9候选版本正在审查；功能状态以版本证据和已知限制为准。',
      status: 'current',
    },
    {
      version: '1.0',
      phase: 'Audit & Release',
      title: '1.0 正式审查验证放行',
      desc: '无新功能添加，仅执行文档审查、输出格式跨阅读器复验、全流程验收与稳定放行。',
      status: 'verifying',
    },
    {
      version: '1.1',
      phase: 'Backlog / TODO',
      title: '排版进阶与输出静态化 (TODO 演进储备)',
      desc: '暂存演进：① DOCX 公式进阶升级（接入 MathML -> OMML 映射，使 Word/WPS 中呈现原生可编辑公式对象）；② Mermaid 导出离线静态化（预提取已渲染 SVG 节点达成真正零外链静态化）。',
      status: 'planned',
    },
  ];

  const auditChecklist = [
    {
      id: 'g1',
      category: '架构铁律',
      item: 'Markdown 原文权威真理原则',
      detail: '编辑事务直接驱动文档修订，禁止从展示 DOM 反向推导或猜测恢复 Markdown 原文。',
      verified: false,
    },
    {
      id: 'g2',
      category: '零外部依赖',
      item: '开箱即用免安装环境',
      detail: '用户端无需安装 Node、Python、TeX、Pandoc 或 Graphviz CLI 即可完成所有公式、图表与导出。',
      verified: false,
    },
    {
      id: 'g3',
      category: '公式双模',
      item: 'MathML 优先与 SVG 模式切换',
      detail: '支持原生轻量 MathML 与高保真矢量 SVG 一键切换，并在全局/文档配置中持久化。',
      verified: false,
    },
    {
      id: 'g4',
      category: '数据完整性',
      item: '单文件 HTML 载荷 100% 往返还原',
      detail: '导出的可编辑 HTML 通过嵌入非执行 JSON 载荷，再次导入时准确恢复文档内容、标题与元数据。',
      verified: false,
    },
    {
      id: 'g5',
      category: '排版物理保真',
      item: 'A4 纸张仿真与打印 PDF',
      detail: '提供物理尺寸比例仿真预览，浏览器打印对话框一键保存 A4 PDF，保留矢量与可选文字。',
      verified: false,
    },
    {
      id: 'g6',
      category: 'Word 兼容',
      item: '原生 DOCX 结构映射',
      detail: '不以假 HTML 冒充 Word，使用 docx 生成纯正 OpenXML 文档，表格与段落原生可编辑。',
      verified: false,
    },
    {
      id: 'g7',
      category: '数据隐私',
      item: '纯本地 IndexedDB 存储，不自动上传',
      detail: '无账号体系，不将用户正文上传至任何第三方服务器，外部资源访问受文档与网络策略约束。',
      verified: false,
    },
  ];

  const runDiagnostics=async()=>{
    setTesting(true);setTestLog([]);const frozen=structuredClone(currentDoc),logs:string[]=[];
    try{
      logs.push('检查冻结修订 '+frozen.id+' / Rev '+frozen.revision);
      logs.push('大纲标题：'+extractOutline(frozen.markdown).length);
      for(const mode of ['mathml','svg'] as const){const artifact=await renderDocument(frozen.markdown,mode);assertArtifact(artifact);logs.push(mode+'：生成 '+artifact.html.length+' 字符，警告 '+artifact.diagnostics.length+' 项')}
      logs.push('当前样本渲染检查完成。未执行离线、分页、DOCX阅读器或系统打印验收；不能据此放行1.0。');
    }catch(error){logs.push('检查失败：'+String(error))}finally{setTestLog(logs);setTesting(false)}
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 no-print animate-in fade-in duration-200">
      <div className="w-full max-w-4xl max-h-[88vh] flex flex-col rounded-xl bg-neutral-900 border border-neutral-700/80 shadow-2xl text-neutral-100 overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-950/40">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-neutral-100">MarkFlow 版本规划与 1.0 验收审查看板</h2>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-teal-950/80 text-teal-300 border border-teal-700/60">
                  当前：0.9-RC2 冻结候选
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                依据 V0.2.8 规划：0.1~0.9 功能开发结束；0.9 至 1.0 仅执行审查、验证与放行。
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-neutral-800 bg-neutral-900/60">
          <button
            onClick={() => setActiveTab('roadmap')}
            className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'roadmap'
                ? 'border-teal-500 text-teal-300'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Flag className="w-3.5 h-3.5" />
            0.1 至 0.9 版本演进里程碑
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'audit'
                ? 'border-teal-500 text-teal-300'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            0.9 → 1.0 准入验证清单
          </button>
          <button
            onClick={() => setActiveTab('diagnostics')}
            className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'diagnostics'
                ? 'border-teal-500 text-teal-300'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            实时自检与诊断工具
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeTab === 'roadmap' && (
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-teal-950/30 border border-teal-800/40 text-xs text-teal-200 flex items-start gap-2">
                <span className="font-semibold text-teal-400 shrink-0">设计准则：</span>
                <span>
                  本应用已全面覆盖 0.1 至 0.9 所有核心需求，功能开发已进入 0.9 冻结态。所有在 1.3 节规划的编辑、公式、图表、分页、单文件 HTML、打印 PDF 与 DOCX 导出均已落地！
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {milestones.map((m) => {
                  const isCurrent = m.status === 'current';
                  const isDone = m.status === 'completed';
                  return (
                    <div
                      key={m.version}
                      className={`p-3.5 rounded-lg border transition-all ${
                        isCurrent
                          ? 'bg-neutral-800/90 border-teal-500/80 shadow-lg shadow-teal-950/20 ring-1 ring-teal-500/30'
                          : isDone
                          ? 'bg-neutral-900/80 border-neutral-800 hover:border-neutral-700'
                          : 'bg-neutral-950/60 border-neutral-800/80 opacity-80'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-sm text-teal-400">{m.version}</span>
                          <span className="text-[11px] font-medium text-neutral-400">· {m.phase}</span>
                        </div>
                        {isCurrent && (
                          <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-teal-500 text-neutral-950 font-bold">
                            Feature Freeze 0.9
                          </span>
                        )}
                        {isDone && (
                          <span className="text-[10px] text-teal-400/90 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> 已就绪
                          </span>
                        )}
                        {m.status === 'verifying' && (
                          <span className="text-[10px] text-amber-400/90 flex items-center gap-1">
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" /> 审查中
                          </span>
                        )}
                        {m.status === 'planned' && (
                          <span className="text-[10px] text-sky-400/90 flex items-center gap-1 font-mono">
                            <Sparkles className="w-3.5 h-3.5" /> 待办规划 (TODO)
                          </span>
                        )}
                      </div>
                      <div className="font-medium text-xs text-neutral-200 mb-1">{m.title}</div>
                      <p className="text-[11px] text-neutral-400 leading-relaxed">{m.desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'audit' && (
            <div className="space-y-3">
              <div className="text-xs text-neutral-300 pb-2 border-b border-neutral-800">
                根据《Markdown 编辑器总体设计方案 V0.2.8》第 13.3 节要求，0.9 到 1.0 为无新功能添加的纯审查验证过程。以下为 1.0 准入放行检验项：
              </div>
              <div className="space-y-2">
                {auditChecklist.map((check) => (
                  <div
                    key={check.id}
                    className="p-3 rounded-lg bg-neutral-950/40 border border-neutral-800/80 flex items-start gap-3"
                  >
                    <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                    <div className="flex-1 text-xs">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-semibold text-neutral-200">{check.item}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-neutral-800 text-neutral-400">
                          {check.category}
                        </span>
                      </div>
                      <p className="text-[11px] text-neutral-400 leading-normal">{check.detail}</p>
                    </div>
                    <span className="text-[10px] font-mono text-teal-400 shrink-0">待独立验收</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'diagnostics' && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-neutral-950 border border-neutral-800 text-xs">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="font-semibold text-neutral-200">当前文档实时解析与就绪屏障测试</div>
                    <div className="text-[11px] text-neutral-400">
                      针对当前编辑中的文档实时运行 AST、大纲、公式与图表解析，检查当前样本渲染；不代替各输出格式验收。
                    </div>
                  </div>
                  <button
                    onClick={runDiagnostics}
                    disabled={testing}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-teal-600 hover:bg-teal-500 text-white transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
                    {testing ? '正在测试...' : '执行一键验证'}
                  </button>
                </div>

                {testLog.length > 0 ? (
                  <div className="p-3 rounded bg-neutral-900 border border-neutral-800/80 font-mono text-[11px] text-teal-300 space-y-1 max-h-60 overflow-y-auto">
                    {testLog.map((log, i) => (
                      <div key={i}>{log}</div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-neutral-500 text-xs">
                    点击右上角“执行一键验证”以检测当前文档在 0.9 候选态下的渲染指标。
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-neutral-800 bg-neutral-950/60 text-xs text-neutral-400">
          <div>MarkFlow V0.9 候选审查状态：审查中 · 尚未作出 1.0 放行结论</div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition-colors"
          >
            返回工作台
          </button>
        </div>
      </div>
    </div>
  );
};
