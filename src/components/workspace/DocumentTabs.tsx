import {FileText,X} from 'lucide-react';
interface Tab {id:string;title:string;dirty:boolean}
interface Props {tabs:Tab[];activeId:string;onActivate:(id:string)=>void;onClose:(id:string)=>void}
export function DocumentTabs({tabs,activeId,onActivate,onClose}:Props){
 return <nav aria-label="打开的文档" className="shrink-0 border-t border-neutral-800 bg-neutral-900 overflow-x-auto no-print" data-document-tabs="true"><div role="tablist" aria-label="文档标签页" className="flex min-w-max h-10">
  {tabs.map((tab,index)=><div key={tab.id} role="presentation" className={`flex items-center border-r border-neutral-800 ${activeId===tab.id?'bg-neutral-950 text-teal-300':'text-neutral-300 hover:bg-neutral-800'}`}>
   <button type="button" role="tab" id={'tab-'+encodeURIComponent(tab.id)} aria-selected={activeId===tab.id} aria-controls="workbench-document" tabIndex={activeId===tab.id?0:-1} title={tab.title+(tab.dirty?'（未保存）':'')} onClick={()=>onActivate(tab.id)} onKeyDown={event=>{let next:number|undefined;if(event.key==='ArrowRight')next=(index+1)%tabs.length;if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;if(event.key==='Home')next=0;if(event.key==='End')next=tabs.length-1;if(event.key==='Delete'){event.preventDefault();onClose(tab.id)}if(next!==undefined){event.preventDefault();const target=tabs[next];if(target){onActivate(target.id);document.getElementById('tab-'+encodeURIComponent(target.id))?.focus()}}}} className="flex items-center gap-2 px-3 h-full max-w-56 text-xs focus-visible:outline-2 focus-visible:outline-teal-400 focus-visible:-outline-offset-2">
    <FileText aria-hidden="true" className="size-3.5 shrink-0"/><span className="truncate">{tab.title||'未命名文档'}</span>{tab.dirty&&<span className="size-1.5 rounded-full bg-teal-300 shrink-0" aria-label="未保存"/>}
   </button><button type="button" tabIndex={-1} aria-label={'关闭 '+tab.title} title="关闭标签页（不删除文档）" onClick={()=>onClose(tab.id)} className="mr-1 p-1.5 hover:bg-neutral-700 rounded focus-visible:outline-2 focus-visible:outline-teal-400"><X aria-hidden="true" className="size-3.5"/></button>
  </div>)}
 </div></nav>;
}
