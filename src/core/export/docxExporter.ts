import {sharedDom} from '../platform/web/sharedDom';
import {Document as WordDocument,Packer,Paragraph,TextRun,ImageRun,ExternalHyperlink,HeadingLevel,Table,TableRow,TableCell,WidthType,AlignmentType,LevelFormat,Bookmark,InternalHyperlink,type ParagraphChild,type IParagraphOptions,type INumberingOptions,PageBreak} from 'docx';
import type {ExportHtmlArtifact} from '../model/exportHtml';
import {inspectDocx,groupDocxIssues} from './outputCapabilities';
import {waitForLayout,withDeadline} from './documentPrint';
type Run=ParagraphChild;
interface InlineContext {bookmarks:Map<string,string>;width:number;height:number}
interface InlineStyle {bold?:boolean;italics?:boolean;strike?:boolean;font?:string;superScript?:boolean;subScript?:boolean}
async function rasterImage(source:string,width:number,height:number):Promise<Uint8Array>{
 const image=new Image();image.src=source;await withDeadline(image.decode(),'DOCX 图片转换超时');
 const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.ceil(width*2));canvas.height=Math.max(1,Math.ceil(height*2));
 const ctx=canvas.getContext('2d');if(!ctx)throw new Error('DOCX 图片转换不可用');ctx.drawImage(image,0,0,canvas.width,canvas.height);
 const base64=canvas.toDataURL('image/png').split(',')[1];if(!base64)throw new Error('DOCX 图片编码失败');return Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
}
async function picture(el:Element,context:InlineContext):Promise<ImageRun>{
 const box=el.getBoundingClientRect(),scale=Math.min(1,context.width/Math.max(1,box.width),context.height/Math.max(1,box.height));
 const width=Math.max(1,box.width*scale),height=Math.max(1,box.height*scale);
 if(el.tagName.toLowerCase()==='svg'){
  const clone=el.cloneNode(true) as SVGElement;clone.setAttribute('xmlns','http://www.w3.org/2000/svg');clone.setAttribute('width',String(Math.max(1,box.width)));clone.setAttribute('height',String(Math.max(1,box.height)));
  const xml=new XMLSerializer().serializeToString(clone),data=new TextEncoder().encode(xml);
  const source='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(xml)));
  const fallback=await rasterImage(source,width,height);
  return new ImageRun({type:'svg',data,transformation:{width,height},fallback:{type:'png',data:fallback}});
 }
 const png=await rasterImage((el as HTMLImageElement).src,width,height);
 return new ImageRun({type:'png',data:png,transformation:{width,height}});
}
async function inline(node:Node,context:InlineContext,style:InlineStyle={}):Promise<Run[]>{
 if(node.nodeType===Node.TEXT_NODE){const text=node.textContent||'';return node.parentElement?.closest('pre')?text.split('\n').flatMap((part,i)=>i?[new TextRun({break:1}),new TextRun({...style,text:part})]:[new TextRun({...style,text:part})]):[new TextRun({...style,text})]}
 if(!(node instanceof Element))return [];
 const tag=node.tagName.toLowerCase();
 // Semantic MathML accompanies SVG in canonical HTML; only the selected presentation is drawn here.
 if(node.classList.contains('mf-math-semantics')&&node.hasAttribute('hidden'))return [];
 if(tag==='svg'||tag==='img')return [await picture(node,context)];
 if(tag==='br')return [new TextRun({break:1})];
 const next={...style,bold:style.bold||tag==='strong'||tag==='b',italics:style.italics||tag==='em'||tag==='i',strike:style.strike||tag==='del',...(tag==='code'?{font:'Consolas'}:{}),superScript:style.superScript||tag==='sup',subScript:style.subScript||tag==='sub'};
 let runs:Run[]=[];for(const child of node.childNodes)runs.push(...await inline(child,context,next));
 if(tag==='a'&&node.getAttribute('href')){
  const href=node.getAttribute('href')!;
  if(href.startsWith('#')){const id=href.slice(1);let decoded=id;try{decoded=decodeURIComponent(id)}catch{}const anchor=context.bookmarks.get(id)||context.bookmarks.get(decoded);if(anchor)runs=[new InternalHyperlink({anchor,children:runs})]}
  else runs=[new ExternalHyperlink({link:href,children:runs})];
 }
 if(node.id&&context.bookmarks.has(node.id))return [new Bookmark({id:context.bookmarks.get(node.id)!,children:runs})];
 return runs;
}
export async function exportDocumentToDocx(input:ExportHtmlArtifact,options:{allowSourceFallback?:boolean}={}):Promise<Blob>{
 const frozenOptions={...options};
 const issues=inspectDocx(input);
 if(issues.some(i=>i.adaptation==='unsupported')||issues.length&&!frozenOptions.allowSourceFallback)throw new Error(groupDocxIssues(issues).map(group=>group.summary+'（'+group.issues[0]!.nodeId+'等，详情见导出窗口）').join('\n'));
 const word=await sharedDom.step('export','engine',new AbortController().signal,async({resources})=>{
 const root=document.createElement('article');root.className='mf-document-shell mf-doc';
 for(const [name,value]of Object.entries(input.presentation.variables))root.style.setProperty(name,value);
 const m=input.presentation.page.margins,twips=(mm:number)=>Math.round(mm*1440/25.4);
 const context:InlineContext={bookmarks:new Map(),width:(210-m.left-m.right)*96/25.4,height:(297-m.top-m.bottom)*96/25.4-20};
 root.style.cssText+=';position:fixed;left:-20000px;top:0;width:'+context.width+'px;visibility:hidden';
 root.innerHTML=input.html;for(const detail of root.querySelectorAll('details'))detail.setAttribute('open','');const stage=document.createElement('div'),style=document.createElement('style');style.textContent=input.presentation.css;stage.className='mf-docx-export-stage';resources.register('docx-export-stage','host',0,()=>stage.remove());stage.append(style,root);document.body.append(stage);
  await waitForLayout(root);
  for(const el of root.querySelectorAll('[id]'))if(!context.bookmarks.has(el.id))context.bookmarks.set(el.id,'mf_bookmark_'+context.bookmarks.size);
  const numbering:INumberingOptions['config'][number][]=[];
  const headings:Record<string,typeof HeadingLevel.HEADING_1|typeof HeadingLevel.HEADING_2|typeof HeadingLevel.HEADING_3|typeof HeadingLevel.HEADING_4|typeof HeadingLevel.HEADING_5|typeof HeadingLevel.HEADING_6>={h1:HeadingLevel.HEADING_1,h2:HeadingLevel.HEADING_2,h3:HeadingLevel.HEADING_3,h4:HeadingLevel.HEADING_4,h5:HeadingLevel.HEADING_5,h6:HeadingLevel.HEADING_6};
  const blockTags=new Set(['p','pre','blockquote','figure','figcaption','div','section','article','main','aside','header','footer','details','summary','ul','ol','table','h1','h2','h3','h4','h5','h6','hr']);
  async function blocks(nodes:Node[],level=0,firstOptions:IParagraphOptions={}):Promise<(Paragraph|Table)[]>{
   const out:(Paragraph|Table)[]=[];let pending:Node[]=[],first=true;
   async function paragraph(nodes:Node[],extra:IParagraphOptions={},id?:string){
    let children:Run[]=[];for(const node of nodes)children.push(...await inline(node,context));
    if(id&&context.bookmarks.has(id))children=[new Bookmark({id:context.bookmarks.get(id)!,children})];
    out.push(new Paragraph({children,spacing:{after:120},...(first?firstOptions:{}),...extra}));first=false;
   }
   async function flush(){if(pending.some(n=>n.nodeType!==Node.TEXT_NODE||n.textContent?.trim()))await paragraph(pending);pending=[]}
   for(const node of nodes){
    if(!(node instanceof Element)){pending.push(node);continue}
    const tag=node.localName;
    if(!blockTags.has(tag)&&!node.classList.contains('mf-math')){pending.push(node);continue}
    await flush();
    const heading=headings[tag],blockStart=out.length;
    const paragraphBlock=!!heading||['p','pre','summary','figcaption'].includes(tag)||node.classList.contains('mf-math');
    if(heading)await paragraph([...node.childNodes],{heading,keepNext:true},node.id);
    else if(node.classList.contains('mf-page-break'))out.push(new Paragraph({children:[new PageBreak()]}));
    else if(tag==='table'){
     const caption=node.querySelector(':scope > caption');if(caption)await paragraph([...caption.childNodes]);
     const rows:TableRow[]=[];
     for(const row of Array.from((node as HTMLTableElement).rows)){
      const cells:TableCell[]=[];
      for(const cell of Array.from(row.cells)){
       const alignment=cell.getAttribute('align');
       const content=await blocks([...cell.childNodes],0,{alignment:alignment==='right'?AlignmentType.RIGHT:alignment==='center'?AlignmentType.CENTER:AlignmentType.LEFT});
       if(!(content[content.length-1] instanceof Paragraph))content.push(new Paragraph({}));
       cells.push(new TableCell({children:content,columnSpan:cell.colSpan,rowSpan:cell.rowSpan,...(cell.localName==='th'?{shading:{fill:'F3F4F6'}}:{})}));
      }
      rows.push(new TableRow({tableHeader:row.parentElement?.localName==='thead',children:cells}));
     }
     if(rows.length)out.push(new Table({width:{size:100,type:WidthType.PERCENTAGE},rows}));
    }else if(tag==='ul'||tag==='ol'){
     const ordered=tag==='ol',reference='mf_list_'+numbering.length,start=ordered?(node as HTMLOListElement).start:1;
     numbering.push({reference,levels:Array.from({length:9},(_,i)=>({level:i,format:ordered?LevelFormat.DECIMAL:LevelFormat.BULLET,text:ordered?'%'+(i+1)+'.':'•',start,alignment:AlignmentType.LEFT}))});
     for(const li of Array.from(node.children).filter(n=>n.localName==='li'))out.push(...await blocks([...li.childNodes],level+1,{numbering:{reference,level:Math.min(8,level)}}));
    }else if(['p','pre','summary','figcaption'].includes(tag)||node.classList.contains('mf-math'))await paragraph([...node.childNodes],node.classList.contains('mf-math')?{alignment:AlignmentType.CENTER}:{},node.id);
    else if(tag==='hr')await paragraph([document.createTextNode('—')]);
    else {const nested=await blocks([...node.childNodes],level,first?firstOptions:{});out.push(...nested);if(nested.length)first=false}
    if(node.id&&context.bookmarks.has(node.id)&&!paragraphBlock){
     const bookmark=new Bookmark({id:context.bookmarks.get(node.id)!,children:[]});
     const destination=out.slice(blockStart).find(item=>item instanceof Paragraph);
     if(destination){destination.addChildElement(bookmark.start);destination.addChildElement(bookmark.end)}
     else out.splice(blockStart,0,new Paragraph({children:[bookmark],spacing:{before:0,after:0}}));
    }
   }
   await flush();return out;
  }
  const children=await blocks([...root.childNodes]);
  return new WordDocument({styles:{default:{document:{run:{font:(input.presentation.variables['--mf-font']||'').includes('Consolas')?'Consolas':(input.presentation.variables['--mf-font']||'').includes('Noto Serif')?'SimSun':'Microsoft YaHei',size:Math.round(Number.parseFloat(input.presentation.variables['--mf-size']||'15')*1.5)},paragraph:{spacing:{line:Math.round(Number.parseFloat(input.presentation.variables['--mf-leading']||'1.75')*240)}}}}},numbering:{config:numbering},sections:[{properties:{page:{size:{width:twips(210),height:twips(297)},margin:{top:twips(m.top),right:twips(m.right),bottom:twips(m.bottom),left:twips(m.left)}}},children}]});
 });
 return Packer.toBlob(word);
}
