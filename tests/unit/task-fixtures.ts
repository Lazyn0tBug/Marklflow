import {type TaskRequest,type TaskArtifact,type TaskClock} from '../../src/application/tasks/contracts';
import {createPreviewSubmission} from '../../src/application/tasks/previewIdentity';
import {DEFAULT_THEME} from '../../src/core/model/document';
export function request(id='task-1',documentId='A',kind:TaskRequest['kind']='preview.flow',revision=1):TaskRequest{
 const document={schemaVersion:1 as const,id:documentId,revision,markdown:'# Test',meta:{title:'Test',createdAt:'2026-10-25',updatedAt:'2026-10-25'},theme:DEFAULT_THEME,options:{syntaxProfile:'commonmark-gfm-v1' as const,mathMode:'mathml' as const}};
 const identity={protocolVersion:1 as const,taskId:id,documentId};
 return {identity,kind,document,cacheKey:createPreviewSubmission({taskId:id,document,previewKind:kind,role:'foreground',renderConfigVersion:1}).cacheKey};
}
export function previewRequest(r:TaskRequest,role:'foreground'|'background',renderConfigVersion=1){return createPreviewSubmission({taskId:r.identity.taskId,document:r.document,previewKind:r.kind,role,renderConfigVersion})}
export function artifact():TaskArtifact{return {schemaVersion:1,artifactId:'artifact',mediaType:'text/html',encoding:'utf8',content:'<h1>Test</h1>',sourceMap:[],resources:[],diagnostics:[]}}
export class FakeClock implements TaskClock{
 time=0;private sequence=0;private timers=new Map<number,{at:number;callback:()=>void}>();
 now(){return this.time}
 schedule(delay:number,callback:()=>void){const id=++this.sequence;this.timers.set(id,{at:this.time+delay,callback});return()=>{this.timers.delete(id)}}
 advance(ms:number){const end=this.time+ms;for(;;){const entry=[...this.timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];if(!entry)break;this.timers.delete(entry[0]);this.time=entry[1].at;entry[1].callback()}this.time=end}
 get pending(){return this.timers.size}
}
