import type {HeadingItem} from './markdown';

/**
 * 大纲树：一个标题加上它的后代。key 是与行号无关的稳定键（见 §2.3）。
 */
export interface OutlineNode {item:HeadingItem;children:OutlineNode[];key:string}
/** 可见的一行。收起状态的节点只隐藏后代，自身仍然可见。 */
interface OutlineRow {item:HeadingItem;key:string;hasChildren:boolean;collapsed:boolean}

/** 稳定键里的分隔符。标题文本不含 NUL（导入时已拒），所以它不会与文本混淆。 */
const SEP='\u0000';

/** 在文档中出现至少一次的标题文本。用于判断同名组。 */
export function duplicateHeadingTexts(items:readonly HeadingItem[]):ReadonlySet<string>{
 const counts=new Map<string,number>();
 for(const item of items)counts.set(item.text,(counts.get(item.text)??0)+1);
 const out=new Set<string>();
 for(const [text,count] of counts)if(count>1)out.add(text);
 return out;
}

/**
 * 叠树：父节点是它前面最近的、level 更小的标题。跳级不报错。
 * 稳定键：唯一的标题用文本本身，同名的标题用文本加出现序号。
 */
export function buildOutlineTree(items:readonly HeadingItem[]):OutlineNode[]{
 const duplicates=duplicateHeadingTexts(items),counters=new Map<string,number>();
 const roots:OutlineNode[]=[],stack:OutlineNode[]=[];
 for(const item of items){
  const index=(counters.get(item.text)??0)+1;counters.set(item.text,index);
  const node:OutlineNode={item,children:[],key:duplicates.has(item.text)?item.text+SEP+index:item.text};
  while(stack.length&&stack[stack.length-1]!.item.level>=item.level)stack.pop();
  const parent=stack[stack.length-1];
  if(parent)parent.children.push(node);else roots.push(node);
  stack.push(node);
 }
 return roots;
}

/** 可见的行。收起状态的节点只隐藏后代，兄弟分支不受影响。 */
export function outlineRows(tree:readonly OutlineNode[],collapsed:ReadonlySet<string>):OutlineRow[]{
 const rows:OutlineRow[]=[];
 const walk=(nodes:readonly OutlineNode[])=>{
  for(const node of nodes){
   const hasChildren=node.children.length>0;
   const isCollapsed=hasChildren&&collapsed.has(node.key);
   rows.push({item:node.item,key:node.key,hasChildren,collapsed:isCollapsed});
   if(!isCollapsed)walk(node.children);
  }
 };
 walk(tree);
 return rows;
}

/** 生效的收起集合：用户显式改过的按显式值，其余按树深度。 */
export function effectiveCollapsed(tree:readonly OutlineNode[],overrides:ReadonlyMap<string,boolean>,defaultCollapsedDepth:number):ReadonlySet<string>{
 const out=new Set<string>();
 const walk=(nodes:readonly OutlineNode[],depth:number)=>{
  for(const node of nodes){
   if(node.children.length){
    const override=overrides.get(node.key);
    const collapsed=override===undefined?depth>=defaultCollapsedDepth:override;
    if(collapsed)out.add(node.key);
   }
   walk(node.children,depth+1);
  }
 };
 walk(tree,0);
 return out;
}

/** 收起状态的节点里，哪些的子树包含当前高亮标题。 */
export function collapsedAncestors(tree:readonly OutlineNode[],activeId:string|null,collapsed:ReadonlySet<string>):ReadonlySet<string>{
 const out=new Set<string>();
 if(!activeId)return out;
 const walk=(nodes:readonly OutlineNode[],ancestors:readonly OutlineNode[])=>{
  for(const node of nodes){
   if(node.item.id===activeId){
    for(const ancestor of ancestors)if(collapsed.has(ancestor.key))out.add(ancestor.key);
    return;
   }
   walk(node.children,[...ancestors,node]);
  }
 };
 walk(tree,[]);
 return out;
}

/** 某个标题的祖先节点的稳定键，从上到下。 */
export function ancestorKeys(tree:readonly OutlineNode[],itemId:string):string[]{
 const found:string[]=[];
 const walk=(nodes:readonly OutlineNode[],ancestors:readonly OutlineNode[]):boolean=>{
  for(const node of nodes){
   if(node.item.id===itemId){found.push(...ancestors.map(ancestor=>ancestor.key));return true;}
   if(walk(node.children,[...ancestors,node]))return true;
  }
  return false;
 };
 walk(tree,[]);
 return found;
}

/** 所有可折叠节点的稳定键。 */
export function collapsibleKeys(tree:readonly OutlineNode[]):string[]{
 const out:string[]=[];
 const walk=(nodes:readonly OutlineNode[])=>{
  for(const node of nodes){
   if(node.children.length)out.push(node.key);
   walk(node.children);
  }
 };
 walk(tree);
 return out;
}

/**
 * 修订变化时清理覆盖：上一修订或当前修订里出现过同名的标题，它的覆盖一律丢弃。
 * 同名组较早恢复默认，好过把覆盖转移到另一节。
 */
export function pruneOverrides(overrides:ReadonlyMap<string,boolean>,duplicates:ReadonlySet<string>,previousDuplicates:ReadonlySet<string>):ReadonlyMap<string,boolean>{
 const ambiguous=new Set<string>([...duplicates,...previousDuplicates]);
 if(!ambiguous.size)return overrides;
 let changed=false;
 const next=new Map<string,boolean>();
 for(const [key,value] of overrides){
  const text=key.split(SEP)[0]??key;
  if(ambiguous.has(text)){changed=true;continue;}
  next.set(key,value);
 }
 return changed?next:overrides;
}
