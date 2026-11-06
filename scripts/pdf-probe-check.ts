/**
 * D1b 的机器校验器：从 JSONL 日志核对六条断言。
 *
 * 取信规则（见 docs/design/log-base-plan-2026-11-03.md §5）：
 * - native 侧断言只认 `origin=rust`，web 侧断言只认 `origin=web`；
 * - 跨侧对照只作诊断，不作判据；web 的成功声明不能覆盖 native 的拒绝或缺证；
 * - 日志是如实记录，不是防伪造机制——本校验器不证明事件为真，只核对"记下来的内容"。
 *
 * 证据不足一律记「未能确认」，不自动补齐：缺 run_start、未知 schema、JSON 损坏、
 * 所需事件缺失/重复、关联不匹配，都属此类。
 *
 * 用法：bun scripts/pdf-probe-check.ts <日志文件或目录...> [--run <run_id>] [--json]
 * 退出码：0 全部通过；1 有未通过或有错误级诊断；2 有未能确认。
 */
import {createHash} from 'node:crypto';
import {readdir,readFile,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';

/** 三态结论。`unconfirmed` 表示证据不足，不是失败。 */
export type Verdict='pass'|'fail'|'unconfirmed';

export interface LogRecord{
 schema_version:number;
 run_id:string;
 timestamp:string;
 level:string;
 event:string;
 origin:string;
 span:{name:string;id:number|null;parent_id:number|null}|null;
 fields:Record<string,string>;
}

/** 一行 JSON 的解析问题（损坏、字段缺失、未知 schema）。 */
export interface ParseIssue{file:string;line:number;reason:string;raw:string}

export interface ParsedFile{
 path:string;
 sha256:string;
 bytes:number;
 records:LogRecord[];
 issues:ParseIssue[];
 /** 未知 schema_version 的记录：形状不可信，不进证据池。 */
 unknownSchema:LogRecord[];
 /** 文件形态：JSONL（机器形态）或人读文本。两者由同一个写出器生成。 */
 format:'jsonl'|'text';
}

export interface RunView{
 run_id:string;
 records:LogRecord[];
 native:LogRecord[];
 web:LogRecord[];
 runStart?:LogRecord|undefined;
 runEnd?:LogRecord|undefined;
 feature?:string|undefined;
 os?:string|undefined;
 arch?:string|undefined;
 app_version?:string|undefined;
}

export interface AssertionResult{
 id:string;
 title:string;
 verdict:Verdict;
 /** 判定依据：每条都标明来源（native 观察 / web 报告 / 页面自述）。 */
 basis:string[];
 /** 未通过或未能确认的原因。 */
 issues:string[];
 /** 需人工确认的部分（不进机器判定）。 */
 manual?:string|undefined;
}

export interface Diagnostic{
 id:string;
 severity:'error'|'warning'|'info';
 message:string;
}

export interface CheckReport{
 files:{path:string;sha256:string;bytes:number;records:number;format:'jsonl'|'text'}[];
 runs:{run_id:string;feature:string;records:number;os?:string;arch?:string;app_version?:string;guarded_commands?:string[]}[];
 assertions:AssertionResult[];
 diagnostics:Diagnostic[];
}

/** 六条断言的编号与标题。 */
const ASSERTION_TITLES:[string,string][]=[
 ['D1b-1','通道阳性'],
 ['D1b-2','主窗口同命令允许'],
 ['D1b-3','输出宿主同命令拒绝'],
 ['D1b-4','选择器补充（机器部分）'],
 ['D1b-5','feature 关闭构建'],
 ['D1b-6','清理证据'],
];

/** 输入日志的大小上限：文件会被逐行解析成对象，量级与文件同阶。 */
const MAX_LOG_BYTES=256*1024*1024;

/**
 * 原生侧实际守卫过的命令。
 *
 * **这里没有硬编码清单** ✓ —— 那份清单与 Rust 的命令枚举曾同时漏掉同一个命令 ✓，
 * 于是页面回传的事件被整条拒收 ✓，而**两端都没有人看** ✓：
 * 原生那边有守卫记录 ✓，校验器那边却不查这个命令 ✓。
 *
 * 现在从**原生自己的守卫记录**推出来 ✓：**有守卫记录的命令就是受保护的命令** ✓。
 * 于是"页面说了、原生那边没有对应观察"这条诊断对每一个受保护命令都成立 ✓，
 * 不依赖任何一份要人维护的名单 ✓。
 *
 * 页面声明了、原生却从头到尾没见过面的命令不在这个集合里 ✓（如 `get_platform_info` ✓，
 * 它不受来源守卫管 ✓）——那种情况另有诊断管 ✓。
 */
function guardedCommands(run:RunView):Set<string>{
 const commands=new Set<string>();
 for(const span of commandSpans(run)){
  if(span.command)commands.add(span.command);
 }
 return commands;
}

/** 契约 §5.1 的 span 词汇表：事件名 → 应当所在 span。 */
const EXPECTED_SPAN:Record<string,string>={
 run_start:'run',run_end:'run',
 source_decision:'command',operation_result:'command',
 host_state:'host',
 probe_source_check:'probe',probe_initial_load:'probe',probe_navigation:'probe',probe_cleanup:'probe',
 probe_abort:'probe',probe_report_unreadable:'probe',probe_report_timeout:'probe',probe_eval_raw:'probe',
 probe_readiness:'probe',probe_pdf:'probe',
 page_report_observed:'probe',
 log_health:'log',
};

/** web 侧业务事件 → 应当所在 span。page_ready 没有 call_id，故不在此表。 */
const WEB_SPAN:Record<string,string>={
 call_started:'page_call',call_finished:'page_call',page_error:'page_call',
};

/** 同一 span 内区分同名事件的自然键：没有则同名即重复。 */
const DISCRIMINATOR:Record<string,string>={
 // Probe and shutdown report distinct health snapshots in the shared log span.
 log_health:'observed_by',
 page_report_observed:'host',
 host_state:'host_label',
 // 两个窗口各自读一次报告：同名事件按宿主区分，不是重复输出。
 probe_report_unreadable:'host',
 probe_report_timeout:'host',
};

const text=(value:string|undefined):string=>value??'';

/**
 * 读一个可能改过名的字段 ✓。
 *
 * **历史验收记录保留当时实际执行的字段名** ✓（见分析与验证规范 ✓），
 * 所以改名之前的证据也得读得出来 ✓——新旧两个名字都认 ✓。
 * 改名窗口过去之后，这里可以收掉旧名字 ✓。
 */
const fieldOf=(record:LogRecord,names:readonly string[]):string|undefined=>{
 for(const name of names){
  const value=record.fields[name];
  if(value!==undefined)return value;
 }
 return undefined;
};
const number=(value:string|undefined):number|undefined=>{
 if(value===undefined||value==='')return undefined;
 const parsed=Number(value);
 return Number.isFinite(parsed)?parsed:undefined;
};

/**
 * 解析一行日志。返回记录或问题。
 *
 * 两种形态都认：JSONL（机器形态）与人读文本。两者由**同一个写出器**从同一批记录
 * 生成，字段与脱敏规则相同；人读形态的值里没有转义，含空格的���由续写规则还原。
 */
export function parseLogLine(raw:string,file:string,line:number):{record?:LogRecord;issue?:ParseIssue}{
 return raw.trimStart().startsWith('{')
  ?parseJsonLine(raw,file,line)
  :parseTextLine(raw,file,line);
}

/** 解析一行 JSONL。返回记录或问题。 */
export function parseJsonLine(raw:string,file:string,line:number):{record?:LogRecord;issue?:ParseIssue}{
 let parsed:unknown;
 try{
  parsed=JSON.parse(raw);
 }catch(error){
  return {issue:{file,line,reason:`JSON 损坏：${(error as Error).message}`,raw}};
 }
 if(typeof parsed!=='object'||parsed===null||Array.isArray(parsed)){
  return {issue:{file,line,reason:'记录不是 JSON 对象',raw}};
 }
 const value=parsed as Record<string,unknown>;
 const required=['run_id','timestamp','level','event','origin'];
 const missing=required.filter(key=>typeof value[key]!=='string');
 if(missing.length){
  return {issue:{file,line,reason:`缺少必填字段：${missing.join('、')}`,raw}};
 }
 const schema=value.schema_version;
 const span=value.span;
 const spanNumber=(entry:unknown):number|null=>typeof entry==='number'&&Number.isFinite(entry)?entry:null;
 const record:LogRecord={
  schema_version:typeof schema==='number'?schema:Number.NaN,
  run_id:String(value.run_id),
  timestamp:String(value.timestamp),
  level:String(value.level),
  event:String(value.event),
  origin:String(value.origin),
  span:span&&typeof span==='object'
   ?{
    name:String((span as Record<string,unknown>).name??''),
    id:spanNumber((span as Record<string,unknown>).id),
    parent_id:spanNumber((span as Record<string,unknown>).parent_id),
   }
   :null,
  fields:{},
 };
 for(const [key,entry] of Object.entries(value)){
  if(['schema_version','run_id','timestamp','level','event','origin','span'].includes(key))continue;
  record.fields[key]=typeof entry==='string'?entry:JSON.stringify(entry);
 }
 return {record};
}

/**
 * 解析一行人读形态：`时间 级别 run_id=… event=… span=… 字段=值…`。
 *
 * span 写作 `name{id=…,parent_id=…}`，无 span 写作 `-`。
 * 值不含转义：含空格的��按"续写上一个字段"还原（写出器的字段值里目前没有空格，
 * 这条规则只是兜底；值里若含 `=` 则以第一个 `=` 分界）。
 */
export function parseTextLine(raw:string,file:string,line:number):{record?:LogRecord;issue?:ParseIssue}{
 const parts=raw.trim().split(/\s+/);
 if(parts.length<3){
  return {issue:{file,line,reason:'人读形态的行字段不足',raw}};
 }
 const timestamp=parts[0]??'';
 const level=parts[1]??'';
 const fields:Record<string,string>={};
 let span:LogRecord['span']=null;
 let lastKey:string|null=null;
 for(const token of parts.slice(2)){
  if(token.startsWith('span=')){
   span=parseTextSpan(token.slice(5));
   lastKey=null;
   continue;
  }
  const at=token.indexOf('=');
  if(at>0){
   const key=token.slice(0,at);
   fields[key]=token.slice(at+1);
   lastKey=key;
  }else if(lastKey){
   fields[lastKey]=`${fields[lastKey]??''} ${token}`;
  }else{
   return {issue:{file,line,reason:`无法归属的片段：${token}`,raw}};
  }
 }
 const missing=['run_id','event','origin'].filter(key=>!fields[key]);
 if(missing.length){
  return {issue:{file,line,reason:`人读形态缺必填字段：${missing.join('、')}`,raw}};
 }
 const {run_id,event,origin,...rest}=fields;
 const record:LogRecord={
  schema_version:1,
  run_id:run_id??'',
  timestamp,
  level,
  event:event??'',
  origin:origin??'',
  span,
  fields:rest,
 };
 return {record};
}

/** 人读形态的 span：`name{id=…,parent_id=…}`，或 `-`（无 span）。 */
function parseTextSpan(raw:string):LogRecord['span']{
 if(raw==='-')return null;
 const at=raw.indexOf('{');
 if(at<0)return null;
 const name=raw.slice(0,at);
 const body=raw.slice(at+1).replace(/}$/,'');
 const parts=body.split(',');
 let id:number|null=null;
 let parent:number|null=null;
 for(const part of parts){
  const [key,value]=part.split('=');
  if(key==='id')id=value==='null'?null:Number(value);
  if(key==='parent_id')parent=value==='null'?null:Number(value);
 }
 return {name,id,parent_id:parent};
}

/** 解析一个日志文件的全部记录。 */
export async function parseLogFile(path:string):Promise<ParsedFile>{
 const bytes=await readFile(path);
 // 输入大小上限：日志会被逐行解析成对象，量级与文件同阶。
 if(bytes.length>MAX_LOG_BYTES){
  throw new Error(`日志文件过大：${bytes.length} 字节，上限 ${MAX_LOG_BYTES}`);
 }
 const text=bytes.toString('utf8');
 const records:LogRecord[]=[];
 const unknownSchema:LogRecord[]=[];
 const issues:ParseIssue[]=[];
 const lines=text.split('\n');
 let format:'jsonl'|'text'='jsonl';
 for(let index=0;index<lines.length;index++){
  const raw=(lines[index]??'').trim();
  if(!raw)continue;
  if(format==='jsonl'&&index===0&&!raw.startsWith('{'))format='text';
  const {record,issue}=parseLogLine(raw,path,index+1);
  if(issue){issues.push(issue);continue}
  if(!record)continue;
  // 人读形态不带 schema_version：由同一个写出器生成，版本即写出器的版本。
  if(record.schema_version!==1){
   unknownSchema.push(record);
   issues.push({file:path,line:index+1,reason:`未知 schema_version：${record.schema_version}`,raw});
   continue;
  }
  records.push(record);
 }
 return {
  path,
  sha256:createHash('sha256').update(bytes).digest('hex'),
  bytes:bytes.length,
  records,
  issues,
  unknownSchema,
  format,
 };
}

/** 按 run_id 分组。 */
export function groupRuns(files:ParsedFile[]):RunView[]{
 const runs=new Map<string,RunView>();
 for(const file of files){
  for(const record of file.records){
   let run=runs.get(record.run_id);
   if(!run){
    run={run_id:record.run_id,records:[],native:[],web:[]};
    runs.set(record.run_id,run);
   }
   run.records.push(record);
   if(record.origin==='rust')run.native.push(record);
   else if(record.origin==='web')run.web.push(record);
  }
 }
 for(const run of runs.values()){
  run.records.sort((left,right)=>left.timestamp.localeCompare(right.timestamp));
  run.native.sort((left,right)=>left.timestamp.localeCompare(right.timestamp));
  run.web.sort((left,right)=>left.timestamp.localeCompare(right.timestamp));
  run.runStart=run.native.find(record=>record.event==='run_start');
  run.runEnd=run.native.find(record=>record.event==='run_end');
  run.feature=run.runStart?.fields.feature;
  run.os=run.runStart?.fields.os;
  run.arch=run.runStart?.fields.arch;
  run.app_version=run.runStart?.fields.app_version;
 }
 return [...runs.values()];
}

/** native 的一个 command span：守卫判定与操作结果。 */
interface CommandSpan{
 spanId:number;
 command:string;
 window:string;
 webview:string;
 decision?:string|undefined;
 reasonCode?:string|undefined;
 result?:string|undefined;
 bytes?:number|undefined;
 elapsedMs?:number|undefined;
 events:string[];
}

/** web 侧的一次调用回传。 */
interface WebCall{
 callId:string;
 command:string;
 window:string;
 webview:string;
 pageEvent:string;
 result?:string|undefined;
 errorCategory?:string|undefined;
 bytes?:number|undefined;
 timestamp:string;
}

/** 汇总 native 的 command span。 */
export function commandSpans(run:RunView):CommandSpan[]{
 const spans=new Map<number,CommandSpan>();
 for(const record of run.native){
  if(record.event!=='source_decision'&&record.event!=='operation_result')continue;
  const spanId=record.span?.id;
  if(spanId===null||spanId===undefined)continue;
  let span=spans.get(spanId);
  if(!span){
   span={
    spanId,
    command:text(record.fields.command),
    window:text(record.fields.window),
    webview:text(record.fields.webview),
    events:[],
   };
   spans.set(spanId,span);
  }
  span.events.push(record.event);
  if(record.event==='source_decision'){
   span.decision=record.fields.decision;
   span.reasonCode=record.fields.reason_code;
   if(record.fields.command)span.command=record.fields.command;
   if(record.fields.window)span.window=record.fields.window;
   if(record.fields.webview)span.webview=record.fields.webview;
  }else{
   span.result=record.fields.result;
   span.bytes=number(record.fields.bytes);
   span.elapsedMs=number(record.fields.elapsed_ms);
   if(record.fields.command)span.command=record.fields.command;
  }
 }
 return [...spans.values()];
}

/** 汇总 web 侧的调用回传（只取完成事件，另记未完成的开始事件）。 */
export function webCalls(run:RunView):{calls:WebCall[];unfinished:WebCall[]}{
 const calls:WebCall[]=[];
 const unfinished:WebCall[]=[];
 for(const record of run.web){
  const pageEvent=record.fields.page_event;
  if(!pageEvent)continue;
  const call:WebCall={
   callId:text(record.fields.call_id),
   command:text(record.fields.command),
   window:text(record.fields.window_label),
   webview:text(record.fields.webview_label),
   pageEvent,
   result:record.fields.result,
   errorCategory:record.fields.error_category,
   bytes:number(record.fields.bytes),
   timestamp:record.timestamp,
  };
  if(pageEvent==='call_finished')calls.push(call);
  else if(pageEvent==='call_started')unfinished.push(call);
 }
 return {calls,unfinished};
}

/**
 * 输出宿主的身份判定：首个实例用基名，后续实例追加序号（见 output_host::next_label）。
 * 校验器按前缀认它，避免多实例时漏判。
 */
const isOutputHost=(window:string):boolean=>window==='pdf-output'||window.startsWith('pdf-output-');

/** 关联键：身份对 + 命令。native 与 web 的身份字段名不同，先归一。 */
const pairKey=(window:string,webview:string,command:string):string=>`${window}|${webview}|${command}`;
const identityKey=(window:string,webview:string):string=>`${window}|${webview}`;

/**
 * **有页面侧事件的身份** ✓：只有这些身份上的原生调用才是页面驱动的 ✓。
 *
 * 一个身份**根本没有页面侧事件** ✓ ⇒ 那条原生调用**不经过页面** ✓
 * （生产轮的导出由界面发起 ✓）—— 那不是"页面调了而原生没记" ✓，
 * 而是"这条路径本来就不走页面" ✓ ✓。
 */
function pageDrivenIdentities(run:RunView):Set<string>{
 const identities=new Set<string>();
 for(const record of run.records){
  if(record.origin!=='web')continue;
  identities.add(identityKey(text(record.fields.window_label),text(record.fields.webview_label)));
 }
 return identities;
}

/** 跨侧配对结果。 */
interface Pairing{
 key:string;
 native:CommandSpan[];
 web:WebCall[];
 mismatch?:string;
}

/**
 * 跨侧配对：按「身份对 + 命令 + 出现次序」配对，不按时间近似配对。
 * 数量不等即关联不匹配——不宣称调用已对应。
 */
export function pairSides(run:RunView):Pairing[]{
 const guarded=guardedCommands(run);
 const nativeGroups=new Map<string,CommandSpan[]>();
 for(const span of commandSpans(run)){
  if(!guarded.has(span.command))continue;
  const key=pairKey(span.window,span.webview,span.command);
  const list=nativeGroups.get(key)??[];
  list.push(span);
  nativeGroups.set(key,list);
 }
 const webGroups=new Map<string,WebCall[]>();
 for(const call of webCalls(run).calls){
  if(!guarded.has(call.command))continue;
  const key=pairKey(call.window,call.webview,call.command);
  const list=webGroups.get(key)??[];
  list.push(call);
  webGroups.set(key,list);
 }
 const keys=new Set([...nativeGroups.keys(),...webGroups.keys()]);
 const pageDriven=pageDrivenIdentities(run);
 return [...keys].map(key=>{
  const native=nativeGroups.get(key)??[];
  const web=webGroups.get(key)??[];
  const pairing:Pairing={key,native,web};
  // **只对页面驱动的身份判不匹配** ✓：生产轮的调用来自界面 ✓，页面侧没有对应记录 ✓，
  // 那不是失配 ✓ —— 是那条路径不走页面 ✓ ✓。
  const [window,webview]=key.split('|');
  if(native.length!==web.length&&pageDriven.has(identityKey(window??'',webview??''))){
   pairing.mismatch=`native ${native.length} 条 vs web ${web.length} 条`;
  }
  return pairing;
 });
}

/** 页面报告的读数（native 读回 DOM，内容仍是页面自述）。 */
interface PageReport{
 host:string;
 role:string;
 readOk:boolean;
 readError:string;
 readMatchesFixture:boolean;
 selectError:string;
 releaseError:string;
}

function pageReports(run:RunView):PageReport[]{
 return run.native
  .filter(record=>record.event==='page_report_observed')
  .map(record=>({
   host:text(record.fields.host),
   role:text(record.fields.role),
   readOk:record.fields.read_ok==='true',
   readError:text(record.fields.read_error),
   readMatchesFixture:record.fields.read_matches_fixture==='true',
   selectError:text(record.fields.select_error),
   releaseError:text(record.fields.release_error),
  }));
}

/** 找出 native 侧的某个命令在某身份下的 span。 */
function nativeSpansFor(spans:CommandSpan[],command:string,window:string):CommandSpan[]{
 return spans.filter(span=>span.command===command&&span.window===window);
}

/** 构造断言结果。 */
function assertion(id:string,title:string,verdict:Verdict,basis:string[],issues:string[],manual?:string):AssertionResult{
 return manual===undefined?{id,title,verdict,basis,issues}:{id,title,verdict,basis,issues,manual};
}

/** 诊断：同一 span 内同名事件重复（按自然键区分）。 */
function duplicateDiagnostics(run:RunView):Diagnostic[]{
 const seen=new Map<string,LogRecord>();
 const diagnostics:Diagnostic[]=[];
 for(const record of run.records){
  const spanId=record.span?.id;
  if(spanId===null||spanId===undefined)continue;
  const key=`${spanId}|${record.event}|${text(record.fields[DISCRIMINATOR[record.event]??''])}`;
  const previous=seen.get(key);
  if(previous){
   diagnostics.push({
    id:'duplicate-event',
    severity:'error',
    message:`同一 span 内事件重复：span=${record.span?.name}#${spanId} event=${record.event}（${previous.timestamp} 与 ${record.timestamp}）`,
   });
  }else seen.set(key,record);
 }
 return diagnostics;
}

/**
 * 诊断：同一次页面调用的事件被报了两次。
 *
 * **按 `call_id` + 页面事件名去重** ✓，不看 span ✓ —— 页面侧每个 web 事件各开一个 span ✓
 * （契约写的是"每次调用一个 span" ✓，实现是每事件一个 ✓），
 * 所以同一个 `call_id` 的同名事件落在不同 span 里 ✓，
 * **上面那条"同一 span 内重复"抓不到它** ✓。交付宿主上就漏过一次 ✓：
 * 同一份 `call_finished` 被提交了两遍 ✓，日志里长得不一样 ✓（时间戳与 span id 不同 ✓），
 * 而契约说的是"同一事件不得重复输出" ✓。
 *
 * 一次调用有 `call_started` 与 `call_finished` ✓ —— 事件名不同 ✓，不算重复 ✓。
 */
function duplicateWebEventDiagnostics(run:RunView):Diagnostic[]{
 const seen=new Map<string,LogRecord>();
 const diagnostics:Diagnostic[]=[];
 for(const record of run.records){
  if(record.event!=='web_event')continue;
  const callId=text(record.fields.call_id);
  const pageEvent=text(record.fields.page_event);
  if(!callId||!pageEvent)continue;
  const key=`${callId}|${pageEvent}`;
  const previous=seen.get(key);
  if(previous){
   diagnostics.push({
    id:'duplicate-web-event',
    severity:'error',
    message:`同一次页面调用的事件重复：call_id=${callId} page_event=${pageEvent}（${previous.timestamp} 与 ${record.timestamp}）`,
   });
  }else seen.set(key,record);
 }
 return diagnostics;
}

/** 诊断：span 结构是否合契约（调用 span 都是根的直接子；事件落在规定的 span 内）。 */
function spanDiagnostics(run:RunView):Diagnostic[]{
 const diagnostics:Diagnostic[]=[];
 const runSpanId=run.records
  .find(record=>record.span?.name==='run')
  ?.span?.id??null;
 for(const record of run.records){
  const expected=record.origin==='web'
   ?WEB_SPAN[record.fields.page_event??'']
   :EXPECTED_SPAN[record.event];
  if(!expected)continue;
  const span=record.span;
  if(!span){
   diagnostics.push({
    id:'event-outside-span',
    severity:'error',
    message:`事件不在契约规定的 span 内：event=${record.event} 应在 ${expected} span 内，实际无 span`,
   });
   continue;
  }
  if(span.name!==expected){
   diagnostics.push({
    id:'event-in-wrong-span',
    severity:'error',
    message:`事件落在错误的 span 内：event=${record.event} 应在 ${expected}，实际在 ${span.name}`,
   });
   continue;
  }
  if(expected!=='run'&&runSpanId!==null&&span.parent_id!==runSpanId){
   diagnostics.push({
    id:'span-not-child-of-run',
    severity:'error',
    message:`调用 span 不是根 span 的直接子：${span.name}#${span.id} 的 parent_id=${span.parent_id}，根 span id=${runSpanId}`,
   });
  }
 }
 return diagnostics;
}

/** 诊断：web 侧只记了开始、没有记完成（调用中断）。 */
function unfinishedCallDiagnostics(run:RunView):Diagnostic[]{
 const {calls,unfinished}=webCalls(run);
 const finished=new Set(calls.map(call=>call.callId));
 return unfinished
  .filter(call=>call.callId!==''&&!finished.has(call.callId))
  .map(call=>({
   id:'call-without-finish',
   severity:'warning' as const,
   message:`web 侧有开始无完成：${call.command}（${call.window}/${call.webview}，call_id=${call.callId}）`,
  }));
}

/**
 * 诊断：command span 的完整性——每个受保护命令的 span 都该有 operation_result 与 elapsed_ms。
 *
 * **不再按命令名过滤** ✓：command span 只有走守卫的命令才会有 ✓，
 * 所以"每个 command span 都得完整"就是契约那句话本身 ✓（§5.1 ✓）。
 */
function commandSpanDiagnostics(run:RunView):Diagnostic[]{
 const diagnostics:Diagnostic[]=[];
 for(const span of commandSpans(run)){
  if(!span.events.includes('operation_result')){
   diagnostics.push({
    id:'command-span-without-result',
    severity:'warning',
    message:`command span 缺 operation_result（${span.command}，${span.window}/${span.webview}）：该次调用的最终结果不可见`,
   });
   continue;
  }
  if(span.elapsedMs===undefined){
   diagnostics.push({
    id:'operation-result-without-elapsed',
    severity:'warning',
    message:`operation_result 缺 elapsed_ms（${span.command}，${span.window}/${span.webview}）：契约要求结束事件带耗时`,
   });
  }
 }
 return diagnostics;
}

/** 诊断：契约词汇表之外的事件名（按需扩展的枚举，不该出现未知名）。 */
function vocabularyDiagnostics(run:RunView):Diagnostic[]{
 const diagnostics:Diagnostic[]=[];
 for(const record of run.records){
  if(record.origin==='web')continue;
  if(record.event==='web_event')continue;
  if(EXPECTED_SPAN[record.event])continue;
  diagnostics.push({
   id:'unknown-event-name',
   severity:'info',
   message:`事件名不在契约词汇表内：${record.event}`,
  });
 }
 return diagnostics;
}

/** 诊断：跨侧结果不一致（只作线索，不作判据）。 */
function crossSideDiagnostics(run:RunView):Diagnostic[]{
 const diagnostics:Diagnostic[]=[];
 for(const pairing of pairSides(run)){
  if(pairing.mismatch){
   diagnostics.push({
    id:'correlation-mismatch',
    severity:'error',
    message:`关联不匹配：${pairing.key} —— ${pairing.mismatch}`,
   });
   continue;
  }
  pairing.native.forEach((span,index)=>{
   const call=pairing.web[index];
   if(!call)return;
   const nativeOutcome=span.decision==='deny'?'denied':span.result==='ok'?'ok':span.result?'error':'unknown';
   const webOutcome=call.result??'unknown';
   if(nativeOutcome!=='unknown'&&webOutcome!=='unknown'&&nativeOutcome!==webOutcome){
    diagnostics.push({
     id:'cross-side-mismatch',
     severity:'warning',
     message:`两侧记述不一致：${pairing.key} native=${nativeOutcome}${span.reasonCode?`(${span.reasonCode})`:''} vs web=${webOutcome}${call.errorCategory?`(${call.errorCategory})`:''}`,
    });
   }
  });
 }
 return diagnostics;
}

/** 诊断：web 侧声明了完成但没有对应的 native 观察。 */
function unobservedDiagnostics(run:RunView):Diagnostic[]{
 const diagnostics:Diagnostic[]=[];
 const spans=commandSpans(run);
 const guarded=guardedCommands(run);
 for(const call of webCalls(run).calls){
  if(!guarded.has(call.command))continue;
  const observed=spans.some(span=>span.command===call.command&&span.window===call.window);
  if(!observed){
   diagnostics.push({
    id:'web-claim-without-native-observation',
    severity:'error',
    message:`web 侧声明了 ${call.command}（${call.window}/${call.webview}），但没有对应的 native 观察`,
   });
  }
 }
 return diagnostics;
}

/** 诊断：日志健康状态与完整性。 */
function healthDiagnostics(run:RunView):Diagnostic[]{
 const diagnostics:Diagnostic[]=[];
 const health=run.native.filter(record=>record.event==='log_health').pop();
 if(!health){
  diagnostics.push({id:'no-health-summary',severity:'warning',message:'未见 log_health 摘要：丢弃与写入故障不可见'});
 }else{
  const failures=['write_failures','rotate_failures','delete_failures']
   .filter(key=>number(health.fields[key])!==0);
  if(failures.length){
   diagnostics.push({
    id:'sink-failure',
    severity:'error',
    message:`日志 sink 有故障计数（${failures.map(key=>`${key}=${health.fields[key]}`).join('、')}）：证据可能缺失，相关断言记未能确认`,
   });
  }
  if(health.fields.file_unavailable==='true'){
   diagnostics.push({id:'file-unavailable',severity:'error',message:'日志文件不可用：证据不完整'});
  }
  if(health.fields.stdout_failed==='true'){
   diagnostics.push({id:'stdout-failed',severity:'warning',message:'stdout 输出失败（文件 sink 为主证据，不影响判定）'});
  }
  const lost=['dropped','rejected'].filter(key=>number(health.fields[key])!==0);
  if(lost.length){
   diagnostics.push({
    id:'records-lost',
    severity:'warning',
    message:`有记录未落盘（${lost.map(key=>`${key}=${health.fields[key]}`).join('、')}）：个别事件可能缺失`,
   });
  }
 }
 if(!run.runEnd){
  diagnostics.push({id:'no-run-end',severity:'warning',message:'未见 run_end：不得宣称日志完整（进程可能未正常退出）'});
 }
 if(!run.runStart){
  diagnostics.push({id:'no-run-start',severity:'error',message:'未见 run_start：本次运行无法圈定，相关断言记未能确认'});
 }
 return diagnostics;
}

/**
 * 查询串里的凭据参数名：出现凭据词就算泄露。
 *
 * 参数名**含**凭据词即算，不要求恰好是 key：交付宿主上的一次运行把
 * `readKey=` 与 `writeKey=` 原样写进了日志，而只匹配 `?key=` 的规则漏了它。
 */
const credentialParameter=(value:string):string|null=>{
 for(const entry of value.matchAll(/[?&]([^=&#]*)=/g)){
  const name=entry[1]??'';
  if(/key|secret|token|password|auth|credential/i.test(name))return name;
 }
 return null;
};

/** 诊断：脱敏扫描——凭据片段、绝对路径、带凭据 URL、正文。 */
function redactionDiagnostics(run:RunView):Diagnostic[]{
 const diagnostics:Diagnostic[]=[];
 const pathPattern=/^(?:[A-Za-z]:\\|\/(?:Users|home|var|tmp|opt|private)\/)/;
 const fixturePattern=/MF-PROBE-FIXTURE/;
 for(const record of run.records){
  for(const [key,value] of Object.entries(record.fields)){
   if(!value)continue;
   if(/key|secret|token|password/i.test(key)&&/[0-9a-f]{6,}/i.test(value)){
    diagnostics.push({
     id:'credential-fragment',
     severity:'error',
     message:`疑似凭据片段入日志：字段 ${key}（event=${record.event}）`,
    });
   }
   if(pathPattern.test(value)){
    diagnostics.push({
     id:'absolute-path',
     severity:'error',
     message:`完整本地路径入日志：字段 ${key}（event=${record.event}）`,
    });
   }
   const parameter=credentialParameter(value);
   if(parameter){
    diagnostics.push({
     id:'credential-url',
     severity:'error',
     message:`带凭据 URL 入日志：字段 ${key}（参数 ${parameter}，event=${record.event}）`,
    });
   }
   if(fixturePattern.test(value)){
    diagnostics.push({
     id:'document-body',
     severity:'error',
     message:`夹具正文入日志：字段 ${key}（event=${record.event}）`,
    });
   }
  }
 }
 return diagnostics;
}

/** 评估一次 pdf-probe 运行。 */
export function evaluateProbeRun(run:RunView,defaultRuns:RunView[]):{assertions:AssertionResult[];diagnostics:Diagnostic[]}{
 const assertions:AssertionResult[]=[];
 const diagnostics:Diagnostic[]=[
  ...duplicateDiagnostics(run),
  ...duplicateWebEventDiagnostics(run),
  ...spanDiagnostics(run),
  ...commandSpanDiagnostics(run),
  ...vocabularyDiagnostics(run),
  ...unfinishedCallDiagnostics(run),
  ...crossSideDiagnostics(run),
  ...unobservedDiagnostics(run),
  ...healthDiagnostics(run),
  ...redactionDiagnostics(run),
 ];
 const spans=commandSpans(run);
 const calls=webCalls(run).calls;
 const reports=pageReports(run);

 // 全局前提：缺 run_start 时一律未能确认。
 if(!run.runStart){
  for(const id of ['D1b-1','D1b-2','D1b-3','D1b-4','D1b-5','D1b-6']){
   assertions.push(assertion(id,'', 'unconfirmed',[],['本次运行缺 run_start：无法圈定运行边界']));
  }
  return {assertions,diagnostics};
 }

 // D1b-1 通道阳性：主窗口 get_platform_info 成功。
 {
  const identity=calls.filter(call=>call.command==='get_platform_info'&&call.window==='main');
  const nativeDenial=spans.some(span=>span.command==='get_platform_info'&&span.decision==='deny');
  const basis:string[]=[];
  const issues:string[]=[];
  let verdict:Verdict='unconfirmed';
  if(nativeDenial){
   verdict='fail';
   issues.push('原生侧记录了 get_platform_info 的拒绝');
  }else if(identity.length===0){
   issues.push('未见主窗口 get_platform_info 的回传记录');
  }else{
   const ok=identity.find(call=>call.result==='ok');
   if(ok){
    verdict='pass';
    basis.push('web 观察：主窗口 get_platform_info 返回 ok');
    basis.push('native 侧无该命令的守卫记录（它不属受保护命令集），故通道阳性只由调用方观察得到');
   }else{
    verdict='fail';
    issues.push(`主窗口 get_platform_info 的结果为 ${identity.map(call=>call.result??'未知').join('、')}，非 ok`);
   }
  }
  assertions.push(assertion('D1b-1','通道阳性',verdict,basis,issues));
 }

 // D1b-2 主窗口同命令允许。
 {
  const readSpans=nativeSpansFor(spans,'read_native_text','main');
  const allowed=readSpans.filter(span=>span.decision==='allow');
  const basis:string[]=[];
  const issues:string[]=[];
  let verdict:Verdict='unconfirmed';
  if(readSpans.length===0){
   issues.push('未见主窗口 read_native_text 的守卫记录');
  }else if(allowed.length===0){
   verdict='fail';
   issues.push('主窗口 read_native_text 被拒');
  }else{
   const ok=allowed.find(span=>span.result==='ok');
   const mainReport=reports.find(report=>report.host==='main');
   const webRead=calls.find(call=>call.command==='read_native_text'&&call.window==='main'&&call.result==='ok');
   if(!ok&&allowed.some(span=>span.events.includes('operation_result'))){
    verdict='fail';
    issues.push('主窗口 read_native_text 放行后结果不是 ok');
   }else if(!ok){
    verdict='unconfirmed';
    issues.push('放行的 command span 内缺 operation_result：该次调用的结果不可见');
   }else{
    verdict='pass';
    basis.push(`native 观察：source_decision=allow，operation_result=ok，bytes=${ok.bytes??'未记'}`);
    if(webRead)basis.push('web 观察：同一次读回传 result=ok');
    if(mainReport){
     basis.push(`页面自述：read_ok=${mainReport.readOk}，read_matches_fixture=${mainReport.readMatchesFixture}`);
     if(mainReport.readMatchesFixture===false){
      verdict='fail';
      issues.push('页面自述读到的内容与夹具不符');
     }else if(mainReport.readOk===false){
      verdict='fail';
      issues.push('页面自述读失败');
     }
    }else{
     issues.push('未见主窗口的 page_report_observed：内容相符无依据');
     verdict='unconfirmed';
    }
    if(mainReport&&mainReport.readMatchesFixture){
     diagnostics.push({
      id:'content-match-is-page-report',
      severity:'info',
      message:'D1b-2 的"内容准确"只有页面自述依据（原生只证明成功与字节数，正文不入日志）',
     });
    }
   }
  }
  assertions.push(assertion('D1b-2','主窗口同命令允许',verdict,basis,issues));
 }

 // D1b-3 输出宿主同命令拒绝。
 {
  const outputSpans=spans.filter(span=>span.command==='read_native_text'&&isOutputHost(span.window));
  const denied=outputSpans.filter(span=>span.decision==='deny');
  const basis:string[]=[];
  const issues:string[]=[];
  let verdict:Verdict='unconfirmed';
  if(outputSpans.length===0){
   issues.push('未见输出宿主 read_native_text 的守卫记录');
  }else if(denied.length===0){
   verdict='fail';
   issues.push('输出宿主 read_native_text 未被拒');
  }else{
   const span=denied[0]!;
   if(!span.reasonCode){
    verdict='unconfirmed';
    issues.push('拒绝记录没有稳定拒绝码：拒绝性质未能确认');
   }else{
    verdict='pass';
    basis.push(`native 观察：source_decision=deny，reason_code=${span.reasonCode}`);
    basis.push('拒绝层归因：Rust 来源守卫（该记录由 Rust 守卫判定后写出，命令已到达 Rust 处理函数；若被更上层拦下则不会有此记录）');
    if(span.result&&span.result!=='error'&&span.result!=='denied'){
     verdict='fail';
     issues.push(`拒绝后 operation_result=${span.result}，与拒绝不自洽`);
    }
    if(span.bytes!==undefined&&span.bytes>0){
     verdict='fail';
     issues.push(`拒绝后仍有字节数 ${span.bytes}：疑似泄露`);
    }
    const webRead=calls.find(call=>call.command==='read_native_text'&&isOutputHost(call.window));
    if(webRead?.result==='ok'){
     verdict='fail';
     issues.push('web 侧报告读取成功：与 native 的拒绝不一致，且构成内容泄露');
    }else if(webRead){
     basis.push(`web 观察：同一次读回传 result=${webRead.result??'未记'}`);
    }else{
     issues.push('未见输出宿主该次读的 web 回传：无法对照');
    }
    const outputReport=reports.find(report=>report.host==='output');
    if(outputReport){
     basis.push(`页面自述：read_ok=${outputReport.readOk}，read_error=${outputReport.readError||'无'}`);
    }
   }
  }
  assertions.push(assertion('D1b-3','输出宿主同命令拒绝',verdict,basis,issues));
 }

 // D1b-4 选择器补充（机器部分：被拒；未弹框是人工项）。
 {
  const selector=spans.filter(span=>span.command==='select_native_open'&&isOutputHost(span.window));
  const denied=selector.filter(span=>span.decision==='deny');
  const basis:string[]=[];
  const issues:string[]=[];
  let verdict:Verdict='unconfirmed';
  if(selector.length===0){
   issues.push('未见输出宿主 select_native_open 的守卫记录');
  }else if(denied.length===0){
   verdict='fail';
   issues.push('输出宿主 select_native_open 未被拒');
  }else if(!denied[0]!.reasonCode){
   verdict='unconfirmed';
   issues.push('拒绝记录没有稳定拒绝码');
  }else{
   verdict='pass';
   basis.push(`native 观察：source_decision=deny，reason_code=${denied[0]!.reasonCode}`);
   const webSelect=calls.find(call=>call.command==='select_native_open'&&isOutputHost(call.window));
   if(webSelect)basis.push(`web 观察：回传 result=${webSelect.result??'未记'}`);
  }
  assertions.push(assertion('D1b-4','选择器补充（机器部分）',verdict,basis,issues,
   '未弹出任何原生对话框——由人在交付宿主确认，不做自动窗口枚举'));
 }

 // D1b-5 feature 关闭构建。
 {
  const basis:string[]=[];
  const issues:string[]=[];
  let verdict:Verdict='unconfirmed';
  if(defaultRuns.length===0){
   issues.push('未提供默认构建（feature≠pdf-probe）的运行记录：无法核对');
  }else{
   // 「不成立」与「没观察到」是两回事：前者判未通过，后者判未能确认。
   const problems:string[]=[];
   const unobserved:string[]=[];
   for(const defaultRun of defaultRuns){
    if(defaultRun.runStart===undefined){
     problems.push(`运行 ${defaultRun.run_id} 缺 run_start`);
     continue;
    }
    const probeEvents=defaultRun.native.filter(record=>record.event.startsWith('probe_'));
    if(probeEvents.length)problems.push(`运行 ${defaultRun.run_id} 出现探针事件 ${probeEvents[0]!.event}`);
    const probeIdentity=defaultRun.native.filter(record=>record.fields.window==='pdf-output');
    if(probeIdentity.length)problems.push(`运行 ${defaultRun.run_id} 出现探针身份 pdf-output`);
    const deniedMain=commandSpans(defaultRun).filter(span=>span.decision==='deny'&&span.window==='main');
    if(deniedMain.length)problems.push(`运行 ${defaultRun.run_id} 的主窗口被拒 ${deniedMain.length} 次：生产允许路径失效`);
   }
   // 放行证据取自**任一**默认构建运行：某次运行没有触发受保护命令，
   // 只说明那次没贡献证据，不代表别的运行也不成立。
   const anyAllowed=defaultRuns.some(run=>
    commandSpans(run).some(span=>span.decision==='allow'&&span.window==='main'));
   if(!anyAllowed){
    unobserved.push('默认构建的运行都没有主窗口的放行记录：默认构建需要触发一次受保护命令，否则「允许路径仍有效」无运行期证据');
   }
   const clean=defaultRuns.every(run=>run.runStart!==undefined)
    &&!defaultRuns.some(run=>run.native.some(record=>record.event.startsWith('probe_')))
    &&!defaultRuns.some(run=>run.native.some(record=>record.fields.window==='pdf-output'));
   if(problems.length){
    verdict='fail';
    issues.push(...problems);
   }else if(unobserved.length){
    verdict='unconfirmed';
    issues.push(...unobserved);
    if(clean)basis.push('默认构建运行里无探针事件与探针身份：测试入口未进入正常构建');
   }else{
    verdict='pass';
    basis.push(`默认构建运行 ${defaultRuns.map(run=>run.run_id).join('、')}：无探针事件与探针身份，主窗口放行路径仍有效`);
   }
  }
  assertions.push(assertion('D1b-5','feature 关闭构建',verdict,basis,issues));
 }

 // D1b-6 清理证据。
 {
  const cleanup=run.native.find(record=>record.event==='probe_cleanup');
  const released=nativeSpansFor(spans,'release_native_file','main').filter(span=>span.result==='ok');
  const basis:string[]=[];
  const issues:string[]=[];
  let verdict:Verdict='unconfirmed';
  if(!cleanup){
   issues.push('未见 probe_cleanup：探针专用回收无证据');
  }else if(cleanup.fields.revoked!=='true'){
   verdict='fail';
   issues.push('probe_cleanup 未记 revoked=true');
  }else if(!released.length){
   verdict='unconfirmed';
   issues.push('未见主窗口 release_native_file 成功：业务清理是否仍在无法核对');
  }else{
   verdict='pass';
   basis.push(`native 观察：probe_cleanup revoked=true`);
   basis.push(`native 观察：主窗口 release_native_file 成功 ${released.length} 次（业务清理未被一并移除）`);
   const foreignRelease=spans.filter(span=>span.command==='release_native_file'&&isOutputHost(span.window));
   if(foreignRelease.some(span=>span.decision==='allow')){
    diagnostics.push({
     id:'foreign-release-allowed',
     severity:'error',
     message:'输出宿主的 release_native_file 被放行：越权撤销未被拦下',
    });
   }else if(foreignRelease.length){
    basis.push('native 观察：输出宿主的 release_native_file 被拒（越权撤销被拦下）');
   }
  }
  assertions.push(assertion('D1b-6','清理证据',verdict,basis,issues));
 }

 // D1c-1 就绪判据：原生求值读到目标文档，且就绪条件成立。
 {
  const readiness=run.native.filter(record=>record.event==='probe_readiness');
  const target=readiness.find(record=>fieldOf(record,['is_expected_document','is_target'])==='true');
  const basis:string[]=[];
  const issues:string[]=[];
  let verdict:Verdict='unconfirmed';
  if(readiness.length===0){
   issues.push('未见就绪探测记录：原生侧未测');
  }else if(!target){
   verdict='fail';
   // 两种"没读到目标文档"要分开：求值根本拿不到内容，与读到了别的文档，是不同的故障。
   const blind=readiness.some(record=>record.fields.eval_ok!=='true');
   issues.push(blind
    ?'就绪探测连内容都没拿到：原生求值失败'
    :'就绪探测没有读到目标文档：原生求值落在了别的文档上');
  }else if(target.fields.ready!=='true'){
   verdict='fail';
   issues.push(`目标文档未达就绪条件：ready_state=${target.fields.ready_state||'未记'}，fonts=${target.fields.fonts_status||'未记'}`);
  }else{
   verdict='pass';
   basis.push(`native 观察：目标文档就绪（ready_state=${target.fields.ready_state}，fonts=${target.fields.fonts_status}）`);
   basis.push(`页面盒 ${fieldOf(target,['page_box_count','page_boxes'])??'未记'} 个，尺寸 ${fieldOf(target,['first_page_box_size','page_box_size'])||'未记'}；图片 ${target.fields.images_loaded}/${target.fields.images_total} 已解码`);
  }
  assertions.push(assertion('D1c-1','就绪判据成立',verdict,basis,issues));
 }

 // D1c-2 打印结果：取得实际 PDF，或取得明确失败证据。
 {
  const prints=run.native.filter(record=>record.event==='probe_pdf');
  const basis:string[]=[];
  const issues:string[]=[];
  let verdict:Verdict='unconfirmed';
  if(prints.length===0){
   issues.push('未见打印结果记录：未测');
  }else{
   const printed=prints.find(record=>record.fields.ok==='true');
   const failed=prints.find(record=>record.fields.ok!=='true');
   if(printed){
    const bytes=Number(printed.fields.bytes??'0');
    if(bytes>0){
     verdict='pass';
     basis.push(`native 观察：打印成功，产出 ${bytes} 字节，耗时 ${printed.fields.elapsed_ms??'未记'} ms`);
     if(printed.fields.committed==='true')basis.push('临时文件已 rename 提交到目标');
     else{
      verdict='fail';
      issues.push('打印成功但未提交：临时文件未 rename 到目标');
     }
    }else{
     verdict='fail';
     issues.push('打印报成功但产出为 0 字节');
    }
   }else if(failed){
    verdict='pass';
    basis.push(`native 观察：打印未成功，但有明确失败证据（${failed.fields.reason||'未记原因'}）`);
   }else{
    verdict='unconfirmed';
    issues.push('打印结果记录缺失');
   }
  }
  assertions.push(assertion('D1c-2','取得 PDF 或明确失败证据',verdict,basis,issues));
 }

 return {assertions,diagnostics};
}

/** 汇总所有运行的评估结果。 */
export function evaluateRuns(runs:RunView[],targetRunId?:string):CheckReport{
 const probeRuns=runs.filter(run=>run.feature==='pdf-probe');
 const defaultRuns=runs.filter(run=>run.feature!=='pdf-probe');
 const candidates=probeRuns.length?probeRuns:runs;
 const target=targetRunId
  ?candidates.find(run=>run.run_id===targetRunId)
  :[...candidates].sort((left,right)=>right.records.length-left.records.length)[0];
 const assertions:AssertionResult[]=[];
 const diagnostics:Diagnostic[]=[];
 if(!target){
  diagnostics.push({id:'no-run',severity:'error',message:'未找到可评估的运行记录'});
 }else{
  const evaluated=evaluateProbeRun(target,defaultRuns);
  assertions.push(...evaluated.assertions);
  diagnostics.push(...evaluated.diagnostics);
 }
 return {
  files:[],
  runs:runs.map(run=>{
   // 受保护命令由原生自己的守卫记录推出 ✓：让人看见它推出来了什么 ✓。
   const guarded=[...guardedCommands(run)].sort();
   return {
    run_id:run.run_id,
    feature:run.feature??'未记',
    records:run.records.length,
    ...(run.os?{os:run.os}:{}),
    ...(run.arch?{arch:run.arch}:{}),
    ...(run.app_version?{app_version:run.app_version}:{}),
    ...(guarded.length?{guarded_commands:guarded}:{}),
   };
  }),
  assertions,
  diagnostics,
 };
}

/** 收集路径下的日志文件：`.log`、轮转归档 `.log.NNN` 与归档用的 `.jsonl`。 */
export async function collectLogFiles(paths:string[]):Promise<string[]>{
 const found:string[]=[];
 for(const path of paths){
  const absolute=resolve(path);
  const info=await stat(absolute);
  if(info.isDirectory()){
   const entries=await readdir(absolute);
   for(const entry of entries){
    if(/\.(?:log|jsonl)(?:\.\d{3})?$/.test(entry))found.push(join(absolute,entry));
   }
  }else found.push(absolute);
 }
 return found.sort();
}

/** 校验入口：读文件、分组、评估。 */
export async function checkProbeLogs(paths:string[],targetRunId?:string):Promise<CheckReport>{
 const files=await collectLogFiles(paths);
 const parsed:ParsedFile[]=[];
 for(const file of files)parsed.push(await parseLogFile(file));
 const runs=groupRuns(parsed);
 const report=evaluateRuns(runs,targetRunId);
 report.files=parsed.map(file=>({
  path:file.path,
  sha256:file.sha256,
  bytes:file.bytes,
  records:file.records.length,
  format:file.format,
 }));
 for(const file of parsed){
  for(const issue of file.issues){
   report.diagnostics.push({
    id:'parse-issue',
    severity:'error',
    message:`${issue.file}:${issue.line} ${issue.reason}`,
   });
  }
 }
 return report;
}

const VERDICT_TEXT:Record<Verdict,string>={
 pass:'通过',
 fail:'未通过',
 unconfirmed:'未能确认',
};

const SEVERITY_TEXT:Record<Diagnostic['severity'],string>={
 error:'错误',
 warning:'告警',
 info:'提示',
};

/** 把报告渲染成人读文本。 */
export function renderReport(report:CheckReport):string{
 const lines:string[]=[];
 lines.push('== 文件 ==');
 if(report.files.length===0)lines.push('（无）');
 for(const file of report.files){
  lines.push(`${file.path}\n  sha256=${file.sha256} bytes=${file.bytes} 记录=${file.records} 形态=${file.format==='jsonl'?'JSONL':'人读文本'}`);
 }
 lines.push('== 运行 ==');
 for(const run of report.runs){
  const env=[run.os,run.arch,run.app_version].filter(Boolean).join(' ');
  lines.push(`run_id=${run.run_id} feature=${run.feature} 记录=${run.records}${env?` 环境=${env}`:''}`);
  if(run.guarded_commands?.length){
   lines.push(`  受保护命令（由原生守卫记录推出）：${run.guarded_commands.join('、')}`);
  }
 }
 lines.push('== 断言 ==');
 for(const item of report.assertions){
  lines.push(`${item.id} ${item.title}：${VERDICT_TEXT[item.verdict]}`);
  for(const basis of item.basis)lines.push(`  依据：${basis}`);
  for(const issue of item.issues)lines.push(`  问题：${issue}`);
  if(item.manual)lines.push(`  人工项：${item.manual}`);
 }
 const errors=report.diagnostics.filter(item=>item.severity==='error');
 const warnings=report.diagnostics.filter(item=>item.severity==='warning');
 const infos=report.diagnostics.filter(item=>item.severity==='info');
 lines.push(`== 诊断（错误 ${errors.length}、告警 ${warnings.length}、提示 ${infos.length}）==`);
 for(const item of [...errors,...warnings,...infos]){
  lines.push(`[${SEVERITY_TEXT[item.severity]}] ${item.id}：${item.message}`);
 }
 return lines.join('\n');
}

async function main():Promise<void>{
 const args=process.argv.slice(2);
 const json=args.includes('--json');
 const runFlag=args.indexOf('--run');
 const targetRunId=runFlag>=0?args[runFlag+1]:undefined;
 const paths=args.filter((value,index)=>{
  if(value==='--json')return false;
  if(value==='--run')return false;
  if(runFlag>=0&&index===runFlag+1)return false;
  return true;
 });
 if(!paths.length){
  console.error('用法：bun scripts/pdf-probe-check.ts <日志文件或目录...> [--run <run_id>] [--json]');
  process.exitCode=2;
  return;
 }
 const report=await checkProbeLogs(paths,targetRunId);
 if(json)console.log(JSON.stringify(report,null,2));
 else console.log(renderReport(report));
 if(report.assertions.some(item=>item.verdict==='fail')||report.diagnostics.some(item=>item.severity==='error'))process.exitCode=1;
 else if(report.assertions.some(item=>item.verdict==='unconfirmed'))process.exitCode=2;
}

if(process.argv[1]?.endsWith('pdf-probe-check.ts'))await main();
