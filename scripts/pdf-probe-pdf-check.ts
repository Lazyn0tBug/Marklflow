/**
 * 探针产出 PDF 的内容检查（D1d 的机器部分）。
 *
 * 核对四件事：
 * 1. **页数与页面尺寸**：每页的 MediaBox（冻结样本的页面盒是 210mm×297mm @96dpi）。
 * 2. **每页正文**：从内容流里取出文字。WebView2 的 PDF 用子集字体，
 *    字形码要经字体的 ToUnicode CMap 才能还原成字符——只解内容流会得到乱码。
 * 3. **首末标记落在哪一页**：冻结样本的首尾标记串各出现一次（HEAD 在第 1 页、TAIL 在末页）。
 * 4. **字体与图像**：每个字体的子类型、是否内嵌、是否子集、有无 ToUnicode；
 *    每页的图像对象数量与尺寸。公式在 PDF 里是矢量图形，故另计每页的绘图算子数。
 *
 * **不引外部工具**：poppler 未安装且需另行授权（TBD-13），故自己解 PDF。
 * 局限写在输出里：矢量图形的"是不是那个公式"只能目视，机器只能证明"有矢量内容"。
 *
 * 用法：bun scripts/pdf-probe-pdf-check.ts <pdf> [--marker <串>...] [--expect-pages <n>]
 */
import {readFileSync} from 'node:fs';
import {inflateSync} from 'node:zlib';

// ---------------------------------------------------------------------------
// 资源上界。
//
// 这个脚本读的是**别人给的文件**，文件里的每个数字都可能很大。凡是"循环次数或
// 分配量由文件内容决定"的地方，都必须有硬上界——否则一个小文件就能把内存吃光
// （实测：一个 `<0000> <FFFF>` 区间 × 33 个字体就能让进程被 OOM 杀掉）。
// 每个上界都注明它拦的是什么。
// ---------------------------------------------------------------------------

/** 单个流解压后的最大字节数：防解压炸弹（几 KB 的压缩数据能撑出几个 GB）。 */
const MAX_STREAM_BYTES=16*1024*1024;
/** 全文解压后的累计上限：防"很多个中等流"合计撑爆内存。 */
const MAX_TOTAL_STREAM_BYTES=64*1024*1024;
/** 单个内容流的最大字节数：内容流会被切成记号数组，量级是它的若干倍。 */
const MAX_CONTENT_BYTES=8*1024*1024;
/** 记号数量的上限：内容流的记号数约为其字节数的十几倍。 */
const MAX_TOKENS=2_000_000;
/** 输入 PDF 的最大字节数。 */
const MAX_PDF_BYTES=64*1024*1024;

/** PDF 里的一个间接对象。 */
interface PdfObject{
 number:number;
 /** 对象的字典部分（原始文本）。 */
 dict:string;
 /** 流内容（解压后）。 */
 stream?:Buffer;
}

/** 一个字体的报告项（对应 pdffonts 的 type/emb/sub/uni 四列）。 */
export interface FontReport{
 name:string;
 subtype:string;
 baseFont:string;
 /** 是否内嵌了字体程序。 */
 embedded:boolean;
 /** 是否为子集（基名带 ABCDEF+ 前缀）。 */
 subset:boolean;
 /** 是否有 ToUnicode 映射（决定文字能否还原）。 */
 hasToUnicode:boolean;
}

/** 一页的检查结果。 */
export interface PageReport{
 index:number;
 /** MediaBox 尺寸（点，1pt = 1/72 英寸）。 */
 width:number;
 height:number;
 /** 页面盒尺寸（CSS 像素 @96dpi）。 */
 cssSize:string;
 /** 该页提取到的文字。 */
 text:string;
 /** 该页的图像对象数量与尺寸。 */
 images:{count:number;sizes:string[]}[];
 /** 该页的矢量绘图算子数量（公式在 PDF 里是矢量图形）。 */
 vectorOps:number;
}

/** 整份 PDF 的检查结果。 */
export interface PdfReport{
 pages:number;
 pageReports:PageReport[];
 fonts:FontReport[];
 /** 字体程序与图像的总览。 */
 embeddedFonts:number;
 subsetFonts:number;
 fontsWithToUnicode:number;
}

/** 从 latin1 文本里取出一个字典项的值（原始文本片段）。 */
function dictValue(dict:string,key:string):string|null{
 const pattern=new RegExp(`/${key}\\s*(\\[[^\\]]*\\]|<<[^]*?>>|/[A-Za-z0-9+#-]+|\\d+\\s+\\d+\\s+R|-?\\d+(?:\\.\\d+)?)`);
 const matched=pattern.exec(dict);
 return matched?matched[1]??null:null;
}

/** 取出字典里某个键对应的全部间接引用号。 */
function dictRefs(dict:string,key:string):number[]{
 const matched=/\/[A-Za-z0-9-]+\s+<<[^]*?>>/.exec(dict);
 const scope=matched?matched[0]:dict;
 const pattern=new RegExp(`/${key}\\s*<<[^]*?>>`,'s');
 const found=pattern.exec(scope);
 if(!found)return [];
 const refs=[...found[0].matchAll(/(\d+)\s+\d+\s+R/g)].map(entry=>Number(entry[1]));
 return refs.filter(value=>Number.isFinite(value));
}

/** 取出字典里某个键对应的单个间接引用号。 */
function dictRef(dict:string,key:string):number|null{
 const pattern=new RegExp(`/${key}\\s+(\\d+)\\s+\\d+\\s+R`);
 const matched=pattern.exec(dict);
 return matched?Number(matched[1]):null;
}

/**
 * 解析文件里的全部间接对象。
 *
 * **顺序扫描，遇到流就跳过流数据**：若在整个文件上扫 `N M obj`，压缩流里的字节序列
 * 会被当成对象并**覆盖真对象**（内容流对象就是这样被冲掉的，表现为提取不到任何文字）。
 * 顺带修掉"流数据里含 endobj 导致对象体被截断"。
 */
export function parseObjects(source:string):Map<number,PdfObject>{
 const objects=new Map<number,PdfObject>();
 const pattern=/(\d+)\s+(\d+)\s+obj\b/g;
 let index=0;
 let totalStreamBytes=0;
 while(index<source.length){
  pattern.lastIndex=index;
  const matched=pattern.exec(source);
  if(!matched)break;
  const number=Number(matched[1]);
  const bodyStart=matched.index+matched[0].length;
  const bodyEnd=source.indexOf('endobj',bodyStart);
  if(bodyEnd<0)break;
  const body=source.slice(bodyStart,bodyEnd);
  const streamAt=body.indexOf('stream');
  if(streamAt<0){
   objects.set(number,{number,dict:body});
   index=bodyEnd+'endobj'.length;
   continue;
  }
  const dict=body.slice(0,streamAt);
  // **偏移一律用 source 的绝对下标**：body 是切片，body 里的偏移是相对的。
  // 混用会让 contentStart 指到文件前部，index 反而倒退 → 同一个对象被无限重解析
  // （内存一路涨到进程被 OOM 杀掉）。
  let contentStart=bodyStart+streamAt+'stream'.length;
  // stream 关键字后是 CRLF 或 LF：都跳过，否则流数据头上多一个字节，解压直接失败。
  if(source[contentStart]==='\r')contentStart+=1;
  if(source[contentStart]==='\n')contentStart+=1;
  const contentEnd=source.indexOf('endstream',contentStart);
  if(contentEnd<0){
   objects.set(number,{number,dict});
   break;
  }
  const raw=Buffer.from(source.slice(contentStart,contentEnd),'latin1');
  let stream=raw;
  if(/\/FlateDecode/.test(dict)){
   // 解压炸弹：几 KB 的压缩数据能撑出几个 GB。解压必须带输出上限。
   try{stream=inflateSync(raw,{maxOutputLength:MAX_STREAM_BYTES});}catch{stream=raw;}
  }
  totalStreamBytes+=stream.length;
  if(totalStreamBytes>MAX_TOTAL_STREAM_BYTES){
   // 累计解压量超限：后面的流不再解压（后面的对象多半用不到了）。
   stream=raw;
  }
  objects.set(number,{number,dict,stream});
  index=contentEnd+'endstream'.length;
 }
 return objects;
}

/** 字体名到字体对象的编号（页面的 /Resources /Font）。 */
function pageFonts(dict:string,objects:Map<number,PdfObject>):Map<string,number>{
 const fonts=new Map<string,number>();
 const scope=/\/Font\s*<<[^]*?>>/.exec(dict)?.[0]??'';
 for(const entry of scope.matchAll(/\/([A-Za-z0-9#+-]+)\s+(\d+)\s+\d+\s+R/g)){
  fonts.set(entry[1]??'',Number(entry[2]));
 }
 return fonts;
}

/** 页面树：按顺序取页面对象编号（Kids 递归）。 */
function pageOrder(objects:Map<number,PdfObject>):number[]{
 const catalog=[...objects.values()].find(entry=>/\/Type\s*\/Catalog/.test(entry.dict));
 const rootRef=catalog?dictRef(catalog.dict,'Pages'):null;
 const pages:number[]=[];
 const walk=(number:number,depth:number):void=>{
  if(depth>32)return;
  const object=objects.get(number);
  if(!object)return;
  if(/\/Type\s*\/Page\b/.test(object.dict)&&!/\/Type\s*\/Pages\b/.test(object.dict)){
   pages.push(number);
   return;
  }
  const kids=/\/Kids\s*\[([^]*?)\]/.exec(object.dict)?.[1]??'';
  for(const entry of kids.matchAll(/(\d+)\s+\d+\s+R/g)){
   walk(Number(entry[1]),depth+1);
  }
 };
 if(rootRef!==null)walk(rootRef,0);
 if(pages.length===0){
  // 兜底：没有页树就按对象出现顺序取 /Type /Page。
  for(const object of objects.values()){
   if(/\/Type\s*\/Page\b/.test(object.dict)&&!/\/Type\s*\/Pages\b/.test(object.dict))pages.push(object.number);
  }
 }
 return pages;
}

/**
 * 一个字体的 ToUnicode 映射。
 *
 * **区间不展开**：`bfrange` 的区间可以长达 65536（`<0000> <FFFF>`），
 * 展开成表就是几十个字体 × 65536 项——内存被吃光，进程被 OOM 杀掉。
 * 故区间按 (low, high, base) 存着，查某个码时再算它落在哪个区间。
 */
export interface CMap{
 /** 单个码的映射（bfchar）。 */
 chars:Map<number,string>;
 /** 区间映射（bfrange 的标量形式）。 */
 ranges:{low:number;high:number;base:string}[];
 /** 一个码占几个字节。 */
 codeBytes:number;
}

/**
 * 查一个码对应的字符；查不到返回 null。
 *
 * 区间是线性扫描的：区间数量由文件决定（每个 CMap 的 bfrange 条数），
 * 故单个字体的查表是 O(区间数)。字体数量 × 区间数 × 码数在正常 PDF 上是毫秒级；
 * 极端文件会慢，但不会失控——区间本身不再展开（见 CMap 的说明）。
 */
export function lookupCMap(cmap:CMap,code:number):string|null{
 const single=cmap.chars.get(code);
 if(single!==undefined)return single;
 for(const range of cmap.ranges){
  if(code<range.low||code>range.high)continue;
  if(range.base.length===0)return '';
  const offset=code-range.low;
  const last=range.base.charCodeAt(range.base.length-1);
  return range.base.slice(0,-1)+String.fromCharCode(last+offset);
 }
 return null;
}

/** 解码字体的 ToUnicode CMap。 */
export function parseToUnicode(content:string):CMap{
 const chars=new Map<number,string>();
 const ranges:{low:number;high:number;base:string}[]=[];
 let codeBytes=1;
 const space=/begincodespacerange([^]*?)endcodespacerange/.exec(content)?.[1]??'';
 const first=/<([0-9A-Fa-f]+)>/.exec(space)?.[1];
 if(first)codeBytes=Math.max(1,Math.ceil(first.length/2));
 const hexToCode=(hex:string):number=>parseInt(hex,16);
 const hexToText=(hex:string):string=>{
  let out='';
  for(let index=0;index+3<hex.length+1;index+=4){
   const unit=hex.slice(index,index+4);
   if(unit.length<4)break;
   out+=String.fromCharCode(parseInt(unit,16));
  }
  return out;
 };
 for(const block of content.matchAll(/beginbfchar([^]*?)endbfchar/g)){
  for(const pair of (block[1]??'').matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/g)){
   chars.set(hexToCode(pair[1]??''),hexToText(pair[2]??''));
  }
 }
 for(const block of content.matchAll(/beginbfrange([^]*?)endbfrange/g)){
  for(const range of (block[1]??'').matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(?:<([0-9A-Fa-f]*)>|\[([^]*?)\])/g)){
   const low=hexToCode(range[1]??'');
   const high=hexToCode(range[2]??'');
   if(range[3]!==undefined){
    // 标量形式：整个区间共用一个基串，最后一字符按偏移递增。
    ranges.push({low,high,base:hexToText(range[3])});
   }else if(range[4]!==undefined){
    // 数组形式：逐项给出，量与文件同阶，直接展开成单码映射。
    const items=[...range[4].matchAll(/<([0-9A-Fa-f]*)>/g)];
    items.forEach((item,offset)=>{
     chars.set(low+offset,hexToText(item[1]??''));
    });
   }
  }
 }
 return {chars,ranges,codeBytes};
}

/** 内容流里的一个记号。 */
type Token =
 |{kind:'string';bytes:Buffer}
 |{kind:'name';value:string}
 |{kind:'number';value:number}
 |{kind:'array';items:Token[]}
 |{kind:'operator';value:string};

/** 把内容流切成记号。 */
export function tokenize(content:string):Token[]{
 const tokens:Token[]=[];
 let index=0;
 // 记号数量的硬上界：内容流可以任意大，记号数组不能跟着涨。
 const push=(token:Token):void=>{
  if(tokens.length<MAX_TOKENS)tokens.push(token);
 };
 const isSpace=(char:string):boolean=>' \t\r\n\f\x00'.includes(char);
 const isDelimiter=(char:string):boolean=>'()<>[]{}/%'.includes(char);
 while(index<content.length){
  const char=content[index]??'';
  if(isSpace(char)){index+=1;continue;}
  if(char==='%'){
   while(index<content.length&&content[index]!=='\n'&&content[index]!=='\r')index+=1;
   continue;
  }
  if(char==='('){
   index+=1;
   const bytes:number[]=[];
   let depth=1;
   while(index<content.length){
    const current=content[index]??'';
    index+=1;
    if(current==='\\'){
     const escaped=content[index]??'';
     index+=1;
     const table:{[key:string]:string}={'n':'\n','r':'\r','t':'\t','b':'\b','f':'\f'};
     if(escaped in table)bytes.push(table[escaped]?.charCodeAt(0)??32);
     else if(/[0-7]/.test(escaped)){
      const octal=escaped+(content[index]??'');
      bytes.push(parseInt(octal,8)&0xff);
      if(octal.length<3)index+=1;
     }else bytes.push(escaped.charCodeAt(0));
     continue;
    }
    if(current==='(')depth+=1;
    if(current===')'){
     depth-=1;
     if(depth===0)break;
    }
    bytes.push(current.charCodeAt(0));
   }
   push({kind:'string',bytes:Buffer.from(bytes)});
   continue;
  }
  if(char==='<'){
   if(content[index+1]==='<'){
    // 内联字典：跳过（资源与字典不参与文字提取）。
    const end=content.indexOf('>>',index);
    index=end<0?content.length:end+2;
    continue;
   }
   index+=1;
   let hex='';
   while(index<content.length&&content[index]!=='>'){
    hex+=content[index]??'';
    index+=1;
   }
   index+=1;
   const padded=hex.length%2?hex+'0':hex;
   push({kind:'string',bytes:Buffer.from(padded,'hex')});
   continue;
  }
  if(char==='['){
   index+=1;
   const items:Token[]=[];
   while(index<content.length&&content[index]!==']'){
    const before=index;
    const token=readToken(content,index);
    if(!token){index=before+1;continue;}
    index=token.next;
    items.push(token.token);
   }
   index+=1;
   push({kind:'array',items});
   continue;
  }
  if(char==='/'){
   index+=1;
   let name='';
   while(index<content.length&&!isSpace(content[index]??'')&&!isDelimiter(content[index]??'')){
    name+=content[index]??'';
    index+=1;
   }
   push({kind:'name',value:name});
   continue;
  }
  if(/[0-9+-]/.test(char)){
   let number='';
   while(index<content.length&&/[0-9+.\-]/.test(content[index]??'')){
    number+=content[index]??'';
    index+=1;
   }
   const value=Number(number);
   push({kind:'number',value:Number.isFinite(value)?value:0});
   continue;
  }
  if(isDelimiter(char)){index+=1;continue;}
  let operator='';
  while(index<content.length&&!isSpace(content[index]??'')&&!isDelimiter(content[index]??'')){
   operator+=content[index]??'';
   index+=1;
  }
  if(operator)push({kind:'operator',value:operator});
 }
 return tokens;
}

/** 从某个位置读一个记号（数组内部用）。 */
function readToken(content:string,index:number):{token:Token;next:number}|null{
 const char=content[index]??'';
 if(' \t\r\n'.includes(char))return null;
 if(char==='('){
  let depth=1;
  let cursor=index+1;
  const bytes:number[]=[];
  while(cursor<content.length){
   const current=content[cursor]??'';
   cursor+=1;
   if(current==='\\'){bytes.push((content[cursor]??'').charCodeAt(0));cursor+=1;continue;}
   if(current==='(')depth+=1;
   if(current===')'){depth-=1;if(depth===0)break;}
   bytes.push(current.charCodeAt(0));
  }
  return {token:{kind:'string',bytes:Buffer.from(bytes)},next:cursor};
 }
 if(char==='<'){
  let hex='';
  let cursor=index+1;
  while(cursor<content.length&&content[cursor]!=='>'){hex+=content[cursor]??'';cursor+=1;}
  const padded=hex.length%2?hex+'0':hex;
  return {token:{kind:'string',bytes:Buffer.from(padded,'hex')},next:cursor+1};
 }
 let operator='';
 let cursor=index;
 while(cursor<content.length&&!/[ \t\r\n()<>[\]{}/%]/.test(content[cursor]??'')){
  operator+=content[cursor]??'';
  cursor+=1;
 }
 if(!operator)return null;
 if(/^[+-]?[\d.]+$/.test(operator))return {token:{kind:'number',value:Number(operator)},next:cursor};
 if(operator.startsWith('/'))return {token:{kind:'name',value:operator.slice(1)},next:cursor};
 return {token:{kind:'operator',value:operator},next:cursor};
}

/** 页面内容流里的文字（按当前字体解码）。 */
function extractText(content:string,fonts:Map<string,CMap>):string{
 const tokens=tokenize(content);
 let out='';
 let current:CMap|null=null;
 const decode=(bytes:Buffer):string=>{
  if(!current)return bytes.toString('latin1');
  const {chars,ranges,codeBytes}=current;
  let text='';
  if(codeBytes===1){
   for(const byte of bytes){
    const mapped=lookupCMap(current,byte);
    text+=mapped??String.fromCharCode(byte);
   }
   return text;
  }
  for(let index=0;index+1<bytes.length;index+=2){
   const code=(bytes[index]??0)*256+(bytes[index+1]??0);
   text+=lookupCMap(current,code)??'';
  }
  return text;
 };
 for(let index=0;index<tokens.length;index++){
  const token=tokens[index]!;
  if(token.kind==='operator'&&token.value==='Tf'){
   const name=tokens[index-2];
   current=name&&name.kind==='name'?fonts.get(name.value)??null:null;
   continue;
  }
  if(token.kind==='operator'&&(token.value==='Tj'||token.value==="'"||token.value==='"')){
   const operand=tokens[index-1];
   if(operand?.kind==='string')out+=decode(operand.bytes);
   continue;
  }
  if(token.kind==='operator'&&token.value==='TJ'){
   const operand=tokens[index-1];
   if(operand?.kind==='array'){
    for(const item of operand.items){
     if(item.kind==='string')out+=decode(item.bytes);
    }
   }
   continue;
  }
 }
 return out;
}

/** 页面内容流里的绘图算子数量（矢量图形：公式与裁切标记都是它）。 */
function countVectorOps(content:string):number{
 const tokens=tokenize(content);
 let count=0;
 for(const token of tokens){
  if(token.kind!=='operator')continue;
  if(['m','l','c','v','y','re','f','F','f*','B','B*','b','b*','S','s','n','W','W*'].includes(token.value))count+=1;
 }
 return count;
}

/** 页面里的图像对象（XObject /Image）。 */
function pageImages(objects:Map<number,PdfObject>,pageDict:string):{count:number;sizes:string[]}[]{
 const scope=/\/XObject\s*<<[^]*?>>/.exec(pageDict)?.[0]??'';
 const images:{count:number;sizes:string[]}[]=[];
 for(const entry of scope.matchAll(/\/([A-Za-z0-9#+-]+)\s+(\d+)\s+\d+\s+R/g)){
  const object=objects.get(Number(entry[2]));
  if(!object||!/\/Subtype\s*\/Image/.test(object.dict))continue;
  const width=Number(dictValue(object.dict,'Width')??'0');
  const height=Number(dictValue(object.dict,'Height')??'0');
  images.push({count:1,sizes:[`${width}x${height}`]});
 }
 return images;
}

/** 读一份 PDF 并给出内容报告。 */
export function reportPdf(bytes:Buffer):PdfReport{
 // 上界在这里，不在 CLI 入口：任何调用方（包括将来的库用法）都受约束。
 if(bytes.length>MAX_PDF_BYTES){
  throw new Error(`PDF 过大：${bytes.length} 字节，上限 ${MAX_PDF_BYTES}`);
 }
 const source=bytes.toString('latin1');
 const objects=parseObjects(source);
 const order=pageOrder(objects);
 const pageReports:PageReport[]=[];
 const fontsSeen=new Map<string,FontReport>();
 const fontDecoders=new Map<string,CMap>();
 const readFont=(name:string,number:number):void=>{
  if(fontsSeen.has(name))return;
  const object=objects.get(number);
  if(!object)return;
  const toUnicodeRef=dictRef(object.dict,'ToUnicode');
  let hasToUnicode=false;
  let decoder:CMap={chars:new Map(),ranges:[],codeBytes:1};
  if(toUnicodeRef!==null){
   const cMap=objects.get(toUnicodeRef);
   if(cMap?.stream){
    hasToUnicode=true;
    decoder=parseToUnicode(cMap.stream.toString('latin1'));
   }
  }
  const baseFont=dictValue(object.dict,'BaseFont')??'';
  fontsSeen.set(name,{
   name,
   subtype:dictValue(object.dict,'Subtype')??'',
   baseFont,
   // 内嵌：普通字体看 /FontFile；Type3 的字形是内容流（/CharProcs），也算内嵌。
   embedded:/\/FontFile\d?/.test(object.dict)||/\/CharProcs/.test(object.dict),
   subset:/^[A-Z]{6}\+/.test(baseFont),
   hasToUnicode,
  });
  fontDecoders.set(name,decoder);
 };
 order.forEach((pageNumber,index)=>{
  const page=objects.get(pageNumber);
  if(!page)return;
  const mediaBox=dictValue(page.dict,'MediaBox');
  const box=mediaBox?mediaBox.replace(/[[\]]/g,'').trim().split(/\s+/).map(Number):[0,0,595,842];
  const width=Math.abs((box[2]??0)-(box[0]??0));
  const height=Math.abs((box[3]??0)-(box[1]??0));
  const fontRefs=pageFonts(page.dict,objects);
  for(const [name,number] of fontRefs)readFont(name,number);
  const contentRefs=page.dict.match(/\/Contents\s+(\d+)\s+\d+\s+R/);
  let content='';
  if(contentRefs?.[1]){
   content=objects.get(Number(contentRefs[1]))?.stream?.toString('latin1')??'';
  }else{
   const array=/\/Contents\s*\[([^]*?)\]/.exec(page.dict)?.[1]??'';
   const parts=[...array.matchAll(/(\d+)\s+\d+\s+R/g)].map(entry=>objects.get(Number(entry[1]))?.stream?.toString('latin1')??'');
   content=parts.join('\n');
  }
  // 内容流会被切成记号数组（量级是字节数的十几倍）：超限就只读前面一段。
  if(content.length>MAX_CONTENT_BYTES)content=content.slice(0,MAX_CONTENT_BYTES);
  const decoders=new Map<string,CMap>();
  for(const [name] of fontRefs)decoders.set(name,fontDecoders.get(name)??{chars:new Map(),ranges:[],codeBytes:1});
  pageReports.push({
   index:index+1,
   width,
   height,
   cssSize:`${Math.round(width/72*96)}x${Math.round(height/72*96)}`,
   text:extractText(content,decoders),
   images:pageImages(objects,page.dict),
   vectorOps:countVectorOps(content),
  });
 });
 const fonts=[...fontsSeen.values()];
 return {
  pages:pageReports.length,
  pageReports,
  fonts,
  embeddedFonts:fonts.filter(font=>font.embedded).length,
  subsetFonts:fonts.filter(font=>font.subset).length,
  fontsWithToUnicode:fonts.filter(font=>font.hasToUnicode).length,
 };
}

/** 找每个标记串出现在第几页。 */
export function findMarkers(report:PdfReport,markers:string[]):{marker:string;pages:number[]}[]{
 return markers.map(marker=>({
  marker,
  pages:report.pageReports.filter(page=>page.text.includes(marker)).map(page=>page.index),
 }));
}

/** 渲染成人读文本。 */
export function renderReport(report:PdfReport,markers:{marker:string;pages:number[]}[]):string{
 const lines:string[]=[];
 lines.push(`页数：${report.pages}`);
 lines.push(`字体：${report.fonts.length} 个（内嵌 ${report.embeddedFonts}，子集 ${report.subsetFonts}，有 ToUnicode ${report.fontsWithToUnicode}）`);
 for(const font of report.fonts){
  lines.push(`  ${font.name} ${font.subtype} ${font.baseFont} 内嵌=${font.embedded} 子集=${font.subset} ToUnicode=${font.hasToUnicode}`);
 }
 for(const page of report.pageReports){
  const text=page.text.replace(/\s+/g,' ').trim();
  lines.push(`第 ${page.index} 页：${page.width.toFixed(2)}x${page.height.toFixed(2)}pt（${page.cssSize}px @96dpi）`);
  lines.push(`  文字 ${text.length} 字；绘图算子 ${page.vectorOps}；图像 ${page.images.length} 个${page.images.length?`（${page.images.map(image=>image.sizes.join(',')).join('；')}）`:''}`);
  lines.push(`  正文片段：${text.slice(0,160)}`);
 }
 if(markers.length){
  lines.push('标记：');
  for(const marker of markers){
   lines.push(`  ${marker.marker}：${marker.pages.length?`第 ${marker.pages.join('、')} 页`:'未找到'}`);
  }
 }
 return lines.join('\n');
}

function main():void{
 const args=process.argv.slice(2);
 // 路径是第一个既不是选项、也不是选项取值的参数（--marker 的值不算路径）。
 let path:string|undefined;
 for(let index=0;index<args.length;index++){
  const value=args[index]??'';
  if(value.startsWith('--')){
   if(value==='--marker'||value==='--expect-pages')index+=1;
   continue;
  }
  path=value;
  break;
 }
 if(!path){
  console.error('用法：bun scripts/pdf-probe-pdf-check.ts <pdf> [--marker <串>...] [--expect-pages <n>]');
  process.exitCode=2;
  return;
 }
 const markers:string[]=[];
 for(let index=0;index<args.length;index++){
  if(args[index]==='--marker'&&args[index+1])markers.push(args[index+1]??'');
 }
 const expectPages=args.includes('--expect-pages')?Number(args[args.indexOf('--expect-pages')+1]):undefined;
 // 大小上界由 reportPdf 把关（它会抛错），这里只负责把错说清楚。
 let report:PdfReport;
 try{
  report=reportPdf(readFileSync(path));
 }catch(error){
  console.error(String(error));
  process.exitCode=1;
  return;
 }
 const found=findMarkers(report,markers);
 console.log(renderReport(report,found));
 let failed=false;
 if(expectPages!==undefined&&report.pages!==expectPages){
  console.error(`页数不符：期望 ${expectPages}，实际 ${report.pages}`);
  failed=true;
 }
 for(const marker of found){
  if(marker.pages.length===0){
   console.error(`标记未找到：${marker.marker}`);
   failed=true;
  }
 }
 if(failed)process.exitCode=1;
}

if(process.argv[1]?.endsWith('pdf-probe-pdf-check.ts'))main();
