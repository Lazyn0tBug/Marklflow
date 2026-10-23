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
  if(node.type==='html')issues.push({nodeId:id,adaptation:'unsupported',message:'原始HTML/布局未提供DOCX映射；保留源码文本需明确接受'});
  if(node.type==='math'||node.type==='inlineMath')issues.push({nodeId:id,adaptation:'unsupported',message:'当前DOCX尚无公式图片适配；本次会保留LaTeX文本，不是可编辑公式'});
  if(node.type==='image')issues.push({nodeId:id,adaptation:'unsupported',message:'当前DOCX尚无图片适配；本次保留图片引用源文'});
  if(node.type==='code'&&/^(mermaid|dot|graphviz)$/.test(node.lang||''))issues.push({nodeId:id,adaptation:'unsupported',message:'当前DOCX图表将保留围栏源码，不是图像'});
 });return issues;
}
