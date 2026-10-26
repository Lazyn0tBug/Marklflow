import type {ExportHtmlArtifact} from '../model/exportHtml';
import {DOCX_FORMULA_IMAGE_MESSAGE,type OutputIssue} from '../model/exportDiagnostics';
export {DOCX_FORMULA_IMAGE_MESSAGE,groupDocxIssues,type OutputIssue,type DocxIssueGroup} from '../model/exportDiagnostics';
/** Capability decisions are made from accepted HTML, never from editable source. */
export function inspectDocx(input:ExportHtmlArtifact):OutputIssue[]{
 const root=document.createElement('article');root.innerHTML=input.html;const issues:OutputIssue[]=[];
 const add=(node:Element,adaptation:OutputIssue['adaptation'],message:string)=>{const nodeId='line-'+(node.closest('[data-line]')?.getAttribute('data-line')||'0');if(adaptation==='unsupported'&&issues.some(issue=>issue.nodeId===nodeId&&issue.message===message&&issue.adaptation===adaptation))return;issues.push({nodeId,adaptation,message})};
 for(const node of root.querySelectorAll('*')){
  if(node.hasAttribute('data-mf-math-id'))add(node,node.querySelector('svg')?'static':'unsupported',node.querySelector('svg')?DOCX_FORMULA_IMAGE_MESSAGE:'DOCX公式需要HTML内已生成的SVG，当前不重新解析源公式');
  if(node.hasAttribute('data-mf-author-mathml')||node.matches('math,mfrac,msqrt,mrow,msup,msub,msubsup,mtable')&&!node.closest('[data-mf-math-id]')&&!node.parentElement?.closest('math,mfrac,msqrt,mrow,msup,msub,msubsup,mtable'))add(node,'unsupported','原始MathML尚无DOCX适配器，请改用LaTeX公式或静态图像');
  if(node.matches('[rowspan],[reversed],li[value]'))add(node,'unsupported','当前不支持原始HTML的跨行表格或逐项/倒序列表编号，请改用简单表格和顺序列表');
  if(node.hasAttribute('data-mf-author-html')&&!node.parentElement?.closest('[data-mf-author-html]'))add(node,'mapped','原始HTML采用安全语义重排，Grid/容器布局和交互不保留');
  if(node.localName==='img')add(node,'static','图片封装进DOCX，外部资源须先收集完成');
  if(node.hasAttribute('data-mf-diagram'))add(node,'static','图表输出SVG/PNG图片，不保留运行交互');
 }
 return issues.sort((a,b)=>Number(a.nodeId.slice(5))-Number(b.nodeId.slice(5)));
}
