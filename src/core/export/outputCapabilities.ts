import {unified} from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import {visit} from 'unist-util-visit';
export interface OutputIssue {nodeId:string;adaptation:'mapped'|'static'|'unsupported';message:string}
export function inspectDocx(markdown:string):OutputIssue[]{
 const tree=unified().use(remarkParse).use(remarkGfm).use(remarkMath).parse(markdown);
 const issues:OutputIssue[]=[];
 visit(tree,node=>{
  const id='line-'+(node.position?.start.line||0);
  if(node.type==='html'){
   const template=document.createElement('template');template.innerHTML=node.value;
   if(template.content.querySelector('math,mfrac,msqrt,mrow'))issues.push({nodeId:id,adaptation:'unsupported',message:'原始MathML尚无DOCX适配器，请改用LaTeX公式或静态图像'});
   if(template.content.querySelector('[rowspan],[reversed],li[value]'))issues.push({nodeId:id,adaptation:'unsupported',message:'当前不支持原始HTML的跨行表格或逐项/倒序列表编号，请改用简单表格和顺序列表'});
   if(template.content.querySelector('img'))issues.push({nodeId:id,adaptation:'static',message:'图片封装进DOCX，外部资源须先收集完成'});
  }
  if(node.type==='html')issues.push({nodeId:id,adaptation:'mapped',message:'原始HTML采用安全语义重排，Grid/容器布局和交互不保留'});
  if(node.type==='math'||node.type==='inlineMath')issues.push({nodeId:id,adaptation:'mapped',message:'公式采用原生 Word OOML (Office Math) 矢量嵌入'});
  if(node.type==='image')issues.push({nodeId:id,adaptation:'static',message:'图片封装进DOCX，外部资源须先收集完成'});
  if(node.type==='code'&&/^(mermaid|dot|graphviz)$/.test(node.lang||''))issues.push({nodeId:id,adaptation:'static',message:'图表输出SVG/PNG图片，不保留运行交互'});
 });return issues;
}
