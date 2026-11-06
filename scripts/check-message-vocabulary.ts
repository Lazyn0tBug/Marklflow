import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {MESSAGE_CATEGORIES} from '../src/application/messages';

/**
 * 词表对齐：**两侧那一份封闭类别表必须是同一份** ✓。
 *
 * 类别词表跨 Rust 与前端两侧 ⇒ ⇒ 两边各存一份就一定会漂 ✓ ⇒ ⇒ 这里把它们对起来 ✓。
 * 这不是"检查一下心里踏实" ⇒ ⇒ 这是**唯一的同步保障** ✓：
 * 基座已有的"两处必须同步改"是先例 ✓ ⇒ ⇒ 那条约定要有兜底 ✓ ⇒ ⇒ 就是这个检查 ✓。
 *
 * **前端那份是导入进来的** ✓（不是抄一份来比 ✓）⇒ ⇒ 抄一份就是又一处事实的副本 ✓
 * ⇒ ⇒ 副本会自己烂掉 ✓ ⇒ ⇒ 那就白检查了 ✓。
 *
 * **Rust 那边只有一个字面量** ✓：`web_error_categories!` 宏把变体、线上名字与取名字的
 * 函数一起生成 ✓ ⇒ ⇒ 名字改一处就够 ✓ ⇒ ⇒ 枚举内部不会自己漂 ✓。
 */

/** 仓库根。 */
const repo=resolve(import.meta.dirname,'..');

/**
 * Rust 侧的类别：变体 => 线上名字 ✓。
 *
 * **按宏的调用处取** ✓，不按宏的定义取 ✓ ⇒ ⇒ 定义里的 `$name` 不会被当成类别 ✓。
 * 解析不出像类别名的东西就**响着失败** ✓：宁可失败 ✓，不可静默放过 ✓。
 */
export function nativeCategories(source:string):string[]{
  const anchor='web_error_categories!';
  const start=source.indexOf(anchor);
  if(start<0)throw new Error('源码里找不到 web_error_categories 宏的调用');
  const open=source.indexOf('{',start);
  const close=source.indexOf('\n}',open);
  if(open<0||close<0)throw new Error('类别清单没有正常结束');
  const names:string[]=[];
  for(const raw of source.slice(open+1,close).split('\n')){
    const line=raw.replace(/\/\/.*$/,'').trim();
    if(line.length===0)continue;
    const match=/^[A-Za-z][A-Za-z0-9]*\s*=>\s*"([^"]+)"\s*,?$/.exec(line);
    if(!match)throw new Error(`解析不到类别清单：出现了不像类别名的东西「${line}」——写法变了 ✓`);
    names.push(match[1]??'');
  }
  if(names.length===0)throw new Error('解析不到类别清单：清单是空的 ✓');
  return names;
}

/** 两侧对不上的地方：哪一侧多、哪一侧少、哪一侧重了 ✓。 */
export interface VocabularyGap{
  missingInNative:string[];
  missingInWeb:string[];
  duplicatedInNative:string[];
  duplicatedInWeb:string[];
}

/** 比两份名单 ✓。空数组表示一致 ✓。 */
export function vocabularyGap(native:string[],web:string[]):VocabularyGap{
  const count=(list:string[])=>{
    const seen=new Map<string,number>();
    for(const name of list)seen.set(name,(seen.get(name)??0)+1);
    return seen;
  };
  const nativeCounts=count(native),webCounts=count(web);
  const duplicates=(counts:Map<string,number>)=>[...counts.entries()].filter(([,times])=>times>1).map(([name])=>name).sort();
  return {
    missingInNative:web.filter(name=>!nativeCounts.has(name)).sort(),
    missingInWeb:native.filter(name=>!webCounts.has(name)).sort(),
    duplicatedInNative:duplicates(nativeCounts),
    duplicatedInWeb:duplicates(webCounts),
  };
}

/** 两份名单都取回来 ✓。 */
export function readVocabulary(root:string=repo):{native:string[];web:string[]}{
  const source=readFileSync(join(root,'src-tauri/src/logging.rs'),'utf8');
  return {native:nativeCategories(source),web:[...MESSAGE_CATEGORIES]};
}

export default function checkMessageVocabulary():void{
  const {native,web}=readVocabulary();
  const gap=vocabularyGap(native,web);
  const problems:string[]=[];
  if(gap.missingInNative.length){
    problems.push(
     '这些类别前端有、原生侧没有（页面的这类事件会被整条拒收）：',
     ...gap.missingInNative.map(name=>`  ${name}`),
     '把它们加进 logging.rs 的 web_error_categories! 宏 ✓。',
    );
  }
  if(gap.missingInWeb.length){
    problems.push(
     '这些类别原生侧有、前端没有（前端报不出来）：',
     ...gap.missingInWeb.map(name=>`  ${name}`),
     '把它们加进 src/application/messages.ts 的 MESSAGE_CATEGORIES ✓。',
    );
  }
  if(gap.duplicatedInNative.length){
    problems.push('原生侧有重名的类别：',...gap.duplicatedInNative.map(name=>`  ${name}`));
  }
  if(gap.duplicatedInWeb.length){
    problems.push('前端有重名的类别：',...gap.duplicatedInWeb.map(name=>`  ${name}`));
  }
  if(problems.length){
    console.error(problems.join('\n'));
    process.exitCode=1;
    return;
  }
  console.log(`消息词表对齐：两侧各 ${native.length} 个类别，同一份 ✓`);
}

if(import.meta.url===pathToFileURL(resolve(process.argv[1]||'')).href)checkMessageVocabulary();
