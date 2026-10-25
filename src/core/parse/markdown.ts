import {unified} from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import {visit} from 'unist-util-visit';
import type {Root,RootContent} from 'mdast';
export interface HeadingItem {id:string;level:number;text:string;line:number}
export interface SourceRange {start:{line:number;column:number;offset:number};end:{line:number;column:number;offset:number}}
export interface SemanticBlock {nodeId:string;kind:RootContent['type'];sourceRange:SourceRange}
export function parseMarkdownSyntax(markdown:string):Root{
 const tree=createMarkdownReader().parse(markdown);
 // remark strips an initial BOM; restore offsets/columns to the original editor text.
 if(markdown.startsWith('\ufeff'))visit(tree,node=>{if(node.position)for(const point of [node.position.start,node.position.end]){if(point.offset!==undefined)point.offset++;if(point.line===1)point.column++}});
 return tree;
}
export function analyzeMarkdown(markdown:string){
 const tree=parseMarkdownSyntax(markdown);
 const blocks:SemanticBlock[]=tree.children.map(node=>{
  const p=node.position;
  if(!p||p.start.offset===undefined||p.end.offset===undefined)throw new Error('Markdown节点缺少源码范围');
  return {nodeId:`node-${node.type}-${p.start.offset}-${p.end.offset}`,kind:node.type,sourceRange:{start:{line:p.start.line,column:p.start.column,offset:p.start.offset},end:{line:p.end.line,column:p.end.column,offset:p.end.offset}}};
 });
 return {schemaVersion:1 as const,tree,blocks};
}
export function createHeadingId(lineIndex:number,text:string):string {
 const clean=text.replace(/[*_\x60~[\]]/g,'').replace(/\$(.*?)\$/g,'$1');
 return 'heading_'+lineIndex+'_'+encodeURIComponent(clean.slice(0,24).toLowerCase().replace(/\s+/g,'-'));
}
export function textOf(node:RootContent):string {
 if('value' in node)return String(node.value);
 return 'children' in node?node.children.map(c=>textOf(c as RootContent)).join(''):'';
}
export const createMarkdownReader=()=>unified().use(remarkParse).use(remarkGfm).use(remarkMath);
export function extractOutline(markdown:string):HeadingItem[] {
 const tree=parseMarkdownSyntax(markdown),out:HeadingItem[]=[];
 visit(tree,'heading',n=>{const text=textOf(n),line=n.position!.start.line;out.push({id:createHeadingId(line-1,text),level:n.depth,text,line})});return out;
}
export function generateMarkdownTable(cols: number = 3, rows: number = 3): string {
  const safeCols = Math.max(1, Math.min(cols, 12));
  const safeRows = Math.max(1, Math.min(rows, 20));

  const headerCols = Array.from({ length: safeCols }, (_, i) => `表头 ${i + 1}`);
  const alignCols = Array.from({ length: safeCols }, () => ':---');
  const headerLine = `| ${headerCols.join(' | ')} |`;
  const alignLine = `| ${alignCols.join(' | ')} |`;
  const dataLines = Array.from({ length: Math.max(1, safeRows - 1) }, (_, r) => {
    const rowCols = Array.from({ length: safeCols }, (_, c) => `数据 ${r + 1}-${c + 1}`);
    return `| ${rowCols.join(' | ')} |`;
  });

  return `\n${headerLine}\n${alignLine}\n${dataLines.join('\n')}\n`;
}


export function mathExpressions(markdown:string):{value:string;display:boolean}[] {
 const out:{value:string;display:boolean}[]=[];
 visit(parseMarkdownSyntax(markdown),node=>{
  if(node.type==='math'||node.type==='inlineMath')out.push({value:node.value,display:node.type==='math'});
 });return out;
}
