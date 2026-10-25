import frozen from '../../../docs/contracts/architecture-runtime-budget.json';
import type {TaskKind} from './contracts';
/** Frozen A0 policy is shared, not a second hand-maintained set of values. */
function freeze<T extends object>(value:T):Readonly<T>{for(const child of Object.values(value))if(child&&typeof child==='object')freeze(child);return Object.freeze(value)}
export const taskBudget=freeze(frozen);
export function totalDeadline(kind:TaskKind):number{
 switch(kind){
  case 'preview.flow':return taskBudget.deadlinesMs.previewFlowTotal;
  case 'preview.a4':return taskBudget.deadlinesMs.previewA4Total;
  case 'export.md':return taskBudget.deadlinesMs.exportMdTotal;
  case 'export.mdBundle':return taskBudget.deadlinesMs.exportMdBundleTotal;
  case 'export.html':return taskBudget.deadlinesMs.exportHtmlTotal;
  case 'export.docx':return taskBudget.deadlinesMs.exportDocxTotal;
  case 'export.print':return taskBudget.deadlinesMs.exportPrintGenerationTotal;
 }
}

/** Serialized UTF-8 estimate, entered once per owned value; not a physical heap measurement. */
export function estimatedBytes(value:unknown):number{return new TextEncoder().encode(JSON.stringify(value)).byteLength}
