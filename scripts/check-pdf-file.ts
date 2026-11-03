import {readFile} from 'node:fs/promises';
import {inflateSync} from 'node:zlib';

/**
 * Inspects a produced PDF without a PDF library: how many pages it has, what page size it uses and,
 * when the text can be read, whether the expected markers are in it. Text inside a subset font is
 * not readable as characters, so an unreadable extraction is reported as undecided rather than as
 * a missing marker.
 */
export interface PdfReport {pages:number;mediaBoxes:string[];text:string|null;state:PdfTextState}

/** Whether the characters in the file can be read back: readable, encoded as subset glyphs, or not readable at all. */
export type PdfTextState='readable'|'encoded'|'unreadable';

/** The page boxes declared in the file, and how many pages it claims to have. */
export function reportPdfStructure(bytes:Buffer):{pages:number;mediaBoxes:string[]}{
 const source=bytes.toString('latin1');
 const pages=(source.match(/\/Type\s*\/Page(?![s])/g)??[]).length;
 const mediaBoxes=[...source.matchAll(/\/MediaBox\s*\[([^\]]*)\]/g)].map(match=>(match[1]??'').trim().replace(/\s+/g,' '));
 return {pages,mediaBoxes};
}

/** The text the content streams carry, and how far the text could be read. */
export function reportPdfText(bytes:Buffer):{text:string|null;state:PdfTextState}{
 const source=bytes.toString('latin1');
 const parts:string[]=[];let inflated=0;
 for(const match of source.matchAll(/stream\r?\n/g)){
  const start=match.index+match[0].length;
  const dictionary=source.slice(source.lastIndexOf('endobj',match.index)+6,match.index);
  if(!/\/FlateDecode/.test(dictionary))continue;
  const length=Number(/\/Length\s+(\d+)/.exec(dictionary)?.[1]??'');
  if(!Number.isFinite(length)||length<=0)continue;
  let content:Buffer;
  // 解压必须有输出上限：PDF 里的流是文件给的，几 KB 的压缩数据能撑出几个 GB。
  try{content=inflateSync(bytes.subarray(start,start+length),{maxOutputLength:64*1024*1024})}catch{continue}
  inflated++;
  const text=content.toString('latin1');
  for(const literal of text.matchAll(/\(((?:[^()\\]|\\.)*)\)\s*Tj/g))parts.push(literal[1]??'');
  for(const array of text.matchAll(/\[((?:[^\][\\]|\\.)*)\]\s*TJ/g)){
   for(const literal of array[1]?.matchAll(/\(((?:[^()\\]|\\.)*)\)/g)??[])parts.push(literal[1]??'');
  }
 }
 if(parts.length)return {text:parts.join(''),state:'readable'};
 return {text:null,state:inflated?'encoded':'unreadable'};

}

export function reportPdf(bytes:Buffer):PdfReport{
 return {...reportPdfStructure(bytes),...reportPdfText(bytes)};
}

if(process.argv[1]?.endsWith('check-pdf-file.ts')){
 const path=process.argv[2];
 if(!path){console.error('usage: bun scripts/check-pdf-file.ts <file.pdf> [marker ...]');process.exitCode=1}
 else{
  const report=reportPdf(await readFile(path));
  console.log('页数:',report.pages);
  console.log('页面尺寸:',report.mediaBoxes.length?report.mediaBoxes.join(' | '):'未读到');
  const markers=process.argv.slice(3);
  if(!markers.length)console.log('（未给标记，跳过文本核对）');
  else if(report.state!=='readable')console.log('文本：未判定（'+(report.state==='encoded'?'内容流以子集字形编码，字符无法还原':'内容流无法解压')+'）');
  else for(const marker of markers)console.log('标记 '+JSON.stringify(marker)+'：'+(report.text!.includes(marker)?'存在':'未判定（抽到的文本与标记不匹配）'));
 }
}
