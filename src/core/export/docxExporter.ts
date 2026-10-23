import {Document as WordDocument,Packer,Paragraph,TextRun,ImageRun,ExternalHyperlink,HeadingLevel,Table,TableRow,TableCell,WidthType,AlignmentType,LevelFormat} from 'docx';
import type {DocumentRecord} from '../model/document';
import {inspectDocx} from './outputCapabilities';
import {renderDocument,assertArtifact} from '../render/documentRenderer';
import {collectAssets} from './documentAssets';
import {documentStyle} from '../render/documentPresentation';
import {waitForLayout,withDeadline} from './documentPrint';
type Run=TextRun|ImageRun|ExternalHyperlink;
interface InlineStyle {bold?:boolean;italics?:boolean;strike?:boolean;font?:string}
async function rasterImage(source:string,width:number,height:number):Promise<Uint8Array>{
 const image=new Image();image.src=source;await withDeadline(image.decode(),'DOCX 图片转换超时');
 const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.ceil(width*2));canvas.height=Math.max(1,Math.ceil(height*2));
 const ctx=canvas.getContext('2d');if(!ctx)throw new Error('DOCX 图片转换不可用');ctx.drawImage(image,0,0,canvas.width,canvas.height);
 const base64=canvas.toDataURL('image/png').split(',')[1];return Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
}
async function picture(el:Element):Promise<ImageRun>{
 const box=el.getBoundingClientRect(),scale=Math.min(1,640/Math.max(1,box.width),850/Math.max(1,box.height));
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
async function inline(node:Node,style:InlineStyle={}):Promise<Run[]>{
 if(node.nodeType===Node.TEXT_NODE){const text=node.textContent||'';return node.parentElement?.closest('pre')?text.split('\n').flatMap((part,i)=>i?[new TextRun({break:1}),new TextRun({...style,text:part})]:[new TextRun({...style,text:part})]):[new TextRun({...style,text})]}
 if(!(node instanceof Element))return [];
 const tag=node.tagName.toLowerCase();
 if(tag==='svg'||tag==='img')return [await picture(node)];
 if(tag==='br')return [new TextRun({break:1})];
 const next={...style,bold:style.bold||tag==='strong'||tag==='b',italics:style.italics||tag==='em'||tag==='i',strike:style.strike||tag==='del',font:tag==='code'?'Consolas':style.font};
 const runs=(await Promise.all(Array.from(node.childNodes,n=>inline(n,next)))).flat();
 if(tag==='a'&&node.getAttribute('href')&&!node.getAttribute('href')!.startsWith('#'))return [new ExternalHyperlink({link:node.getAttribute('href')!,children:runs})];
 return runs;
}
export async function exportDocumentToDocx(input:DocumentRecord,options:{allowSourceFallback?:boolean;allowRemoteAssets?:boolean}={}):Promise<Blob>{
 const doc=structuredClone(input),issues=inspectDocx(doc.markdown);
 if(issues.length&&!options.allowSourceFallback)throw new Error(issues.map(i=>i.nodeId+': '+i.message).join('\n'));
 const artifact=await renderDocument(doc.markdown,'svg');assertArtifact(artifact);
 const assets=await collectAssets(artifact.html,doc.assets,options.allowRemoteAssets);
 const root=document.createElement('article');root.className='mf-document-shell mf-doc';for(const [name,value]of Object.entries(documentStyle(doc.theme)))root.style.setProperty(name,value);
 root.style.cssText+=';position:fixed;left:-20000px;top:0;width:640px;visibility:hidden';
 root.innerHTML=assets.html;document.body.append(root);
 try{
  await waitForLayout(root);const children:(Paragraph|Table)[]=[];
  const paragraph=async(el:Element,extra:object={})=>new Paragraph({children:await inline(el),spacing:{after:120},...extra});
  const blocks=async(nodes:Element[],level=0)=>{
   for(const node of nodes){
    const tag=node.tagName.toLowerCase();
    if(/^h[1-6]$/.test(tag)){const headings=[HeadingLevel.HEADING_1,HeadingLevel.HEADING_2,HeadingLevel.HEADING_3,HeadingLevel.HEADING_4,HeadingLevel.HEADING_5,HeadingLevel.HEADING_6];children.push(await paragraph(node,{heading:headings[Number(tag[1])-1]}))}
    else if(tag==='table'){
     const rows:TableRow[]=[];
     for(const row of Array.from(node.querySelectorAll('tr'))){
      const cells:TableCell[]=[];
      for(const cell of Array.from(row.children))cells.push(new TableCell({children:[await paragraph(cell)],shading:cell.tagName==='TH'?{fill:'F3F4F6'}:undefined}));
      rows.push(new TableRow({tableHeader:row.parentElement?.tagName==='THEAD',children:cells}));
     }children.push(new Table({width:{size:100,type:WidthType.PERCENTAGE},rows}));
    }else if(tag==='ul'||tag==='ol'){
     for(const li of Array.from(node.children)){
      const own=li.cloneNode(true) as Element;for(const nested of own.querySelectorAll('ul,ol'))nested.remove();
      children.push(await paragraph(own,{numbering:{reference:tag==='ol'?'mf-numbers':'mf-bullets',level:Math.min(8,level)}}));
      for(const nested of Array.from(li.children))if(/^(UL|OL)$/.test(nested.tagName))await blocks([nested],level+1);
     }
    }else if(node.classList.contains('mf-page-break'))children.push(new Paragraph({pageBreakBefore:true}));
    else if(['p','pre','blockquote','figure'].includes(tag)||node.classList.contains('mf-math'))children.push(await paragraph(node,{alignment:node.classList.contains('mf-math')?AlignmentType.CENTER:undefined}));
    else if(tag==='hr')children.push(new Paragraph({text:'—'}));
    else if(node.children.length)await blocks(Array.from(node.children),level);
    else if(node.textContent)children.push(await paragraph(node));
   }
  };
  await blocks(Array.from(root.children));
  const m=doc.theme.margins,twips=(mm:number)=>Math.round(mm*1440/25.4);
  const word=new WordDocument({styles:{default:{document:{run:{font:doc.theme.fontFamily==='mono'?'Consolas':doc.theme.fontFamily==='serif'?'SimSun':'Microsoft YaHei',size:Math.round(doc.theme.fontSize*1.5)},paragraph:{spacing:{line:Math.round(doc.theme.lineHeight*240)}}}}},numbering:{config:['mf-bullets','mf-numbers'].map(reference=>({reference,levels:Array.from({length:9},(_,level)=>({level,format:reference==='mf-bullets'?LevelFormat.BULLET:LevelFormat.DECIMAL,text:reference==='mf-bullets'?'•':'%'+(level+1)+'.',alignment:AlignmentType.LEFT}))}))},sections:[{properties:{page:{margin:{top:twips(m.top),right:twips(m.right),bottom:twips(m.bottom),left:twips(m.left)}}},children}]});
  return await Packer.toBlob(word);
 }finally{root.remove()}
}
