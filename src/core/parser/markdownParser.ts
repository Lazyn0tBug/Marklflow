import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeStringify from 'rehype-stringify';
import { visit } from 'unist-util-visit';
import type { Root, RootContent } from 'mdast';
import type { Element } from 'hast';
import { latexToMathML, latexToSVG } from '../render/mathRender';
import { renderDotToSVG } from '../render/graphvizRender';
import { escapeHtml, sanitizeDocumentHtml } from '../render/htmlPolicy';
export interface HeadingItem {id:string;level:number;text:string;line:number}
export interface ParseOptions {mathMode?:'mathml'|'svg';isDark?:boolean;startLineIndex?:number}
export function createHeadingId(lineIndex:number,text:string):string {
 const clean=text.replace(/[*_\x60~[\]]/g,'').replace(/\$(.*?)\$/g,'$1');
 return 'heading_'+lineIndex+'_'+encodeURIComponent(clean.slice(0,24).toLowerCase().replace(/\s+/g,'-'));
}
function textOf(node:RootContent):string {
 if('value' in node)return String(node.value);
 return 'children' in node?node.children.map(c=>textOf(c as RootContent)).join(''):'';
}
const reader=()=>unified().use(remarkParse).use(remarkGfm).use(remarkMath);
export function extractOutline(markdown:string):HeadingItem[] {
 const tree=reader().parse(markdown),out:HeadingItem[]=[];
 visit(tree,'heading',n=>{const text=textOf(n),line=n.position!.start.line;out.push({id:createHeadingId(line-1,text),level:n.depth,text,line})});return out;
}
export function parseMarkdownToHtml(markdown:string,options:ParseOptions={}):string {
 const offset=options.startLineIndex||0,mode=options.mathMode||'mathml';
 const math=(v:string,d:boolean)=>mode==='svg'?latexToSVG(v,d):latexToMathML(v,d);
 const processor=reader().use(()=>(tree:Root)=>{
  visit(tree,'paragraph',(node,index,parent)=>{
   if(node.children.length===1&&node.children[0].type==='text'&&node.children[0].value.trim()==='---pagebreak---'&&parent&&index!==undefined){
    parent.children[index]={type:'html',value:'<div class="mf-page-break" role="separator" aria-label="分页"></div>',position:node.position};
   }
  });
 }).use(remarkRehype,{allowDangerousHtml:true,handlers:{
  heading(state,node){
   const line=node.position!.start.line+offset,id=createHeadingId(line-1,textOf(node));
   const result:Element={type:'element',tagName:'h'+node.depth,properties:{id,dataHeadingId:id,dataLine:line},children:state.all(node)};
   state.patch(node,result);return result;
  },
  code(_state,node){
   const lang=(node.lang||'plaintext').toLowerCase(),line=node.position!.start.line+offset;
   const position='data-line="'+line+'" data-source-end="'+(node.position!.end.line+offset)+'"';
   const html=lang==='mermaid'?'<figure class="mf-diagram" '+position+' data-mermaid-code="'+encodeURIComponent(node.value)+'"><figcaption>Mermaid 渲染中</figcaption></figure>':/^(dot|graphviz)$/.test(lang)?'<figure class="mf-diagram" '+position+'>'+renderDotToSVG(node.value)+'</figure>':'<pre class="mf-code" '+position+'><code class="language-'+escapeHtml(lang)+'">'+escapeHtml(node.value)+'\n</code></pre>';
   return {type:'raw' as const,value:html};
  },
  math(_state,node){return {type:'raw' as const,value:'<div class="mf-math" data-line="'+(node.position!.start.line+offset)+'">'+math(node.value,true)+'</div>'}},
  inlineMath(_state,node){return {type:'raw' as const,value:math(node.value,false)}},
 }}).use(rehypeRaw).use(()=>(tree)=>{
  visit(tree,'element',(node:Element)=>{
   if(node.position&&!node.properties.dataLine)node.properties.dataLine=node.position.start.line+offset;
   if(node.position)node.properties.dataSourceEnd=node.position.end.line+offset;
   if(node.tagName==='table')node.properties.className=['mf-table'];
  });
 }).use(rehypeStringify);
 return sanitizeDocumentHtml(String(processor.processSync(markdown)));
}
export function parseInline(text:string,mathMode:'mathml'|'svg'='mathml'):string {
 return parseMarkdownToHtml(text,{mathMode}).replace(/^<p[^>]*>([\s\S]*)<\/p>\s*$/,'$1');
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
 visit(reader().parse(markdown),node=>{
  if(node.type==='math'||node.type==='inlineMath')out.push({value:node.value,display:node.type==='math'});
 });return out;
}
