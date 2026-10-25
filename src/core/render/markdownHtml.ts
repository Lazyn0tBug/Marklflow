import {createRenderNonce} from '../platform/crypto';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeStringify from 'rehype-stringify';
import { SKIP, visit } from 'unist-util-visit';
import type { Root } from 'mdast';
import type { Element } from 'hast';
import {unpreparedMath,type PreparedMath} from './mathRender';
import { escapeHtml, sanitizeDocumentHtml, inspectAuthorHtml, rewriteFragments, type ContentDiagnostic } from './htmlPolicy';
export interface ParseOptions {mathMode?:'mathml'|'svg';isDark?:boolean;startLineIndex?:number;preparedMath?:PreparedMath}
import {createMarkdownReader,createHeadingId,textOf} from '../parse/markdown';
export function parseMarkdownDocument(markdown:string,options:ParseOptions={}):{html:string;diagnostics:ContentDiagnostic[]} {
 const diagnostics:ContentDiagnostic[]=[];
 const offset=options.startLineIndex||0,nonce=createRenderNonce();
 const originalOffset=(value:number|undefined)=>value===undefined?undefined:value+(markdown.startsWith('\ufeff')?1:0);
 const math=options.preparedMath??((value:string)=>unpreparedMath(value));
 const processor=createMarkdownReader().use(()=>(tree:Root)=>{
  visit(tree,'html',node=>{diagnostics.push(...inspectAuthorHtml(node.value,(node.position?.start.line||1)+offset))});
  visit(tree,'listItem',node=>{
   if(typeof node.checked==='boolean'){
    const state=node.checked?'☑ 已完成：':'☐ 未完成：';
    const first=node.children[0];
    if(first?.type==='paragraph')first.children.unshift({type:'text',value:state});
    node.checked=null;
   }
  });
  visit(tree,'paragraph',(node,index,parent)=>{
   const first=node.children[0];
   if(node.children.length===1&&first?.type==='text'&&first.value.trim()==='---pagebreak---'&&parent&&index!==undefined){
    parent.children[index]={type:'html',value:'<div class="mf-page-break" role="separator" aria-label="分页"></div>',position:node.position};
   }
  });
 }).use(remarkRehype,{allowDangerousHtml:true,handlers:{
  heading(state,node){
   const line=node.position!.start.line+offset,id=createHeadingId(line-1,textOf(node));
   const result:Element={type:'element',tagName:'h'+node.depth,properties:{id,dataHeadingId:id,dataLine:line,dataMfOrigin:nonce},children:state.all(node)};
   state.patch(node,result);return result;
  },
  code(_state,node){
   const lang=(node.lang||'plaintext').toLowerCase(),line=node.position!.start.line+offset;
   const position='data-mf-origin="'+nonce+'" data-line="'+line+'" data-source-end="'+(node.position!.end.line+offset)+'"';
   const html=lang==='mermaid'?'<figure class="mf-diagram" '+position+' data-mermaid-code="'+encodeURIComponent(node.value)+'"><figcaption>Mermaid 渲染中</figcaption></figure>':/^(dot|graphviz)$/.test(lang)?'<figure class="mf-diagram" '+position+' data-dot-code="'+encodeURIComponent(node.value)+'"><figcaption>DOT 渲染中</figcaption></figure>':'<pre class="mf-code" '+position+'><code class="language-'+escapeHtml(lang)+'">'+escapeHtml(node.value)+'\n</code></pre>';
   return {type:'raw' as const,value:html};
  },
  math(_state,node){return {type:'raw' as const,value:'<div class="mf-math" data-mf-origin="'+nonce+'" data-line="'+(node.position!.start.line+offset)+'">'+math(node.value,true,originalOffset(node.position?.start.offset))+'</div>'}},
  inlineMath(_state,node){return {type:'raw' as const,value:math(node.value,false,originalOffset(node.position?.start.offset))}},
 }}).use(rehypeRaw).use(()=>(tree)=>{
  const authorIds=new Map<string,string>();
  visit(tree,'element',(node:Element)=>{if(node.properties.id&&node.properties.dataMfOrigin!==nonce)authorIds.set(String(node.properties.id),'mf_author_'+encodeURIComponent(String(node.properties.id)))});
  visit(tree,'element',(node:Element)=>{
   const trusted=node.properties.dataMfOrigin===nonce;
   if(!trusted&&node.properties.id)node.properties.id=authorIds.get(String(node.properties.id))!;
   for(const [key,value]of Object.entries(node.properties)){if(typeof value!=='string'||key==='id')continue;node.properties[key]=rewriteFragments(value,authorIds,key)}
   for(const key of Object.keys(node.properties))if(key.startsWith('data')&&(!trusted||!['dataLine','dataSourceEnd','dataHeadingId','dataMermaidCode','dataDotCode'].includes(key)))delete node.properties[key];
   if(node.position&&!trusted)node.properties.dataLine=node.position.start.line+offset;
   if(node.position&&!trusted)node.properties.dataSourceEnd=node.position.end.line+offset;
   if(node.tagName==='table')node.properties.className=['mf-table'];
  });
  visit(tree as import('hast').Root,'element',(node:Element,index:number|undefined,parent)=>{if(node.tagName==='table'&&parent&&index!==undefined){parent.children[index]={type:'element',tagName:'div',properties:{className:['mf-table-scroll']},children:[node]};return SKIP}});
 }).use(rehypeStringify);
 return {html:sanitizeDocumentHtml(String(processor.processSync(markdown))),diagnostics};
}
export function parseMarkdownToHtml(markdown:string,options:ParseOptions={}):string {
 return parseMarkdownDocument(markdown,options).html;
}
export function parseInline(text:string,mathMode:'mathml'|'svg'='mathml'):string {
 return parseMarkdownToHtml(text,{mathMode}).replace(/^<p[^>]*>([\s\S]*)<\/p>\s*$/,'$1');
}
