import JSZip from 'jszip';
import {parseFragment,type DefaultTreeAdapterTypes} from 'parse5';
import {visit} from 'unist-util-visit';
import {parseMarkdownSyntax} from '../parse/markdown';
import type {DocumentRecord,DocumentAsset} from '../model/document';
import {decodeImage,collectAssets} from './documentAssets';
import {documentSchema} from '../model/documentSchema';
import {escapeHtml} from '../policy/htmlRules';
function pathFor(asset:DocumentAsset):string{return 'assets/'+asset.sha256+'.'+asset.mime.split('/')[1]}
/** Rewrite only parsed image/definition/HTML nodes; unrelated Markdown bytes remain unchanged. */
export function bundleMarkdown(markdown:string,assets:readonly DocumentAsset[]):string{
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
   // HTML blocks can leave wrappers open across Markdown nodes. Never serialize a repaired DOM.
   const rewrite=(element:DefaultTreeAdapterTypes.Element)=>{
    if(element.tagName==='img'||element.tagName==='image'){
     const attribute=['src','href','xlink:href'].map(name=>element.attrs.find(attr=>(attr.prefix?attr.prefix+':':'')+attr.name===name)).find(attr=>attr!==undefined);
     const path=attribute?lookup(attribute.value):undefined;
     const name=attribute?(attribute.prefix?attribute.prefix+':':'')+attribute.name:undefined;
     const location=name?element.sourceCodeLocation?.attrs?.[name]:undefined;
     if(path&&location){
      const raw=node.value.slice(location.startOffset,location.endOffset),equals=raw.indexOf('=');
      if(equals>=0){
       let from=equals+1;while(/\s/.test(raw[from]??''))from++;
       const quote=raw[from],quoted=quote==='"'||quote==="'";
       if(quoted)from++;
       const to=quoted?raw.lastIndexOf(quote):raw.length;
       if(to>=from)edits.push({start:start+location.startOffset+from,end:start+location.startOffset+to,text:path});
      }
     }
    }
    for(const child of element.childNodes)if('tagName'in child)rewrite(child);
   };
   for(const child of parseFragment(node.value,{sourceCodeLocationInfo:true}).childNodes)if('tagName'in child)rewrite(child);
  }
  if(text!==undefined)edits.push({start,end,text});
 });
 let result=markdown;for(const edit of edits.sort((a,b)=>b.start-a.start))result=result.slice(0,edit.start)+edit.text+result.slice(edit.end);
 return result;
}
export async function buildMarkdownBundle(input:DocumentRecord,assets:readonly DocumentAsset[]=input.assets??[]):Promise<Blob>{
 const {assets:_existing,...source}=input,zip=new JSZip();void _existing;
 zip.file('document.md',bundleMarkdown(source.markdown,assets));
 const manifest=assets.map(asset=>{const {data,...record}=asset;zip.file(pathFor(asset),decodeImage(data).bytes);return {...record,path:pathFor(asset)}});
 zip.file('manifest.json',JSON.stringify({schemaVersion:1,document:source,assets:manifest},null,2));
 const bytes=await zip.generateAsync({type:'uint8array',compression:'DEFLATE'});if(bytes.byteLength>50*1024*1024)throw new Error('Markdown资源包超过50MB限制');
 return new Blob([Uint8Array.from(bytes).buffer],{type:'application/zip'});
}
/** Collect only source image references. Formula/diagram rendering never gates saving source. */
export async function generateMarkdownBundle(input:DocumentRecord,options:{allowRemoteAssets:boolean}):Promise<Blob>{
 const doc=documentSchema.parse(input),allowRemote=options.allowRemoteAssets,tree=parseMarkdownSyntax(doc.markdown),references=new Map<string,string>(),urls=new Set<string>();
 visit(tree,'definition',node=>{if(!references.has(node.identifier))references.set(node.identifier,node.url)});
 visit(tree,node=>{
  if(node.type==='image')urls.add(node.url);
  if(node.type==='imageReference'){const url=references.get(node.identifier);if(url)urls.add(url)}
  if(node.type==='html'){
   const scan=(element:DefaultTreeAdapterTypes.Element)=>{
    if(element.tagName==='img'||element.tagName==='image'){const attr=element.attrs.find(item=>['src','href','xlink:href'].includes((item.prefix?item.prefix+':':'')+item.name));if(attr)urls.add(attr.value)}
    for(const child of element.childNodes)if('tagName'in child)scan(child);
   };
   for(const child of parseFragment(node.value).childNodes)if('tagName'in child)scan(child);
  }
 });
 const {assets}=await collectAssets([...urls].map(url=>'<img src="'+escapeHtml(url)+'">').join(''),doc.assets,allowRemote);
 return buildMarkdownBundle(doc,assets);
}
