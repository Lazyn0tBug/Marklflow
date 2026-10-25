import {workerStartSchema,executionIdentitySchema,type ExecutorMessage,type TaskArtifact} from './contracts';
import {summarizeMarkdown} from '../../core/parse/markdownSummary';
import {taskBudget,estimatedBytes} from './budget';
/** Unknown command boundary shared by the real worker and protocol unit tests. */
export function runMarkdownWorkerTask(raw:unknown,send:(message:ExecutorMessage)=>void):void {
 const parsed=workerStartSchema.safeParse(raw);
 if(!parsed.success){const header=raw&&typeof raw==='object'&&'execution'in raw?executionIdentitySchema.safeParse(raw.execution):undefined;if(header?.success)send({protocolVersion:1,execution:header.data,type:'error',code:'input',message:'Invalid Markdown worker request'});return}
 const {request,execution}=parsed.data;
 if(request.kind!=='preview.flow'||new TextEncoder().encode(request.document.markdown).byteLength>taskBudget.input.markdownUtf8Bytes){send({protocolVersion:1,execution,type:'error',code:'input',message:'Unsupported preview mode or Markdown input limit exceeded'});return}
 send({protocolVersion:1,execution,type:'start',stage:'parse'});
 try{
  const summary=summarizeMarkdown(request.document.markdown,taskBudget.input.semanticNodes);
  const artifact:TaskArtifact={schemaVersion:1,artifactId:request.identity.taskId,mediaType:'application/json',encoding:'utf8',content:JSON.stringify(summary),sourceMap:summary.blocks.map(b=>({nodeId:b.nodeId,...b.sourceRange})),resources:[],diagnostics:[]};
  if(estimatedBytes(artifact)>taskBudget.memory.activeArtifactBytes)throw new Error('Markdown result limit exceeded');
  send({protocolVersion:1,execution,type:'result',artifact});
 }catch(error){send({protocolVersion:1,execution,type:'error',code:'engine',message:String(error).slice(0,8192)})}
}
