import JSZip from 'jszip';
import {visit} from 'unist-util-visit';
import {parseMarkdownSyntax} from '../parse/markdown';
import type {DocumentRecord,DocumentAsset} from '../model/document';
import {decodeImage} from './documentAssets';
import {prepareExportContent,type PreparedExportContent} from './exportContent';
function pathFor(asset:DocumentAsset):string{return 'assets/'+asset.sha256+'.'+asset.mime.split('/')[1]}
/** Rewrite only parsed image/definition/HTML nodes; unrelated Markdown bytes remain unchanged. */
export function bundleMarkdown(markdown:string,assets:DocumentAsset[]):string{
 const paths=new Map(assets.map(asset=>[asset.source,pathFor(asset)]));
 const lookup=(url:string)=>paths.get(url)??paths.get(encodeURI(url));
 const edits:{start:number;end:number;text:string}[]=[];
 const label=(value:string)=>Array.from(value).map(c=>['[',']',String.fromCharCode(92)].includes(c)?String.fromCharCode(92)+c:c).join('');
 visit(parseMarkdownSyntax(markdown),node=>{
  const start=node.position?.start.offset,end=node.position?.end.offset;if(start===undefined||end===undefined)return;
  let text:string|undefined;
  if(node.type==='image'||node.type==='definition'){
   const path=lookup(node.url);if(!path)return;
   const title=node.title?' '+JSON.stringify(Array.from(node.title).map(c=>c.charCodeAt(0)<32?' ':c).join('')):'';
   text=node.type==='image'?'!['+label(node.alt??'')+']('+path+title+')':'['+label(node.label??node.identifier)+']: '+path+title;
  }else if(node.type==='html'){
   const template=document.createElement('template');template.innerHTML=node.value;let changed=false;
   for(const el of template.content.querySelectorAll('img,svg image')){
    const attr=el.hasAttribute('src')?'src':el.hasAttribute('href')?'href':'xlink:href',value=el.getAttribute(attr),path=value?lookup(value):undefined;
    if(path){el.setAttribute(attr,path);changed=true}
   }
   if(changed)text=template.innerHTML;
  }
  if(text!==undefined)edits.push({start,end,text});
 });
 let result=markdown;for(const edit of edits.sort((a,b)=>b.start-a.start))result=result.slice(0,edit.start)+edit.text+result.slice(edit.end);
 return result;
}
export async function buildMarkdownBundle(prepared:PreparedExportContent):Promise<Blob>{
 const {assets,...source}=prepared.document,zip=new JSZip();
 zip.file('document.md',bundleMarkdown(source.markdown,assets));
 const manifest=assets.map(asset=>{const {data,...record}=asset;zip.file(pathFor(asset),decodeImage(data).bytes);return {...record,path:pathFor(asset)}});
 zip.file('manifest.json',JSON.stringify({schemaVersion:1,document:source,assets:manifest},null,2));
 const bytes=await zip.generateAsync({type:'uint8array',compression:'DEFLATE'});if(bytes.byteLength>50*1024*1024)throw new Error('Markdown资源包超过50MB限制');
 return new Blob([Uint8Array.from(bytes).buffer],{type:'application/zip'});
}
export async function generateMarkdownBundle(doc:DocumentRecord,options:{mathMode:'mathml'|'svg';allowRemoteAssets:boolean}):Promise<Blob>{return buildMarkdownBundle(await prepareExportContent(doc,options))}
