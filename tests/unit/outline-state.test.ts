import {expect,it} from 'vitest';
import {outlineReducer,outlineView,type OutlineAction,type OutlineState} from '../../src/application/workspace/outlineState';
import type {HeadingItem} from '../../src/core/parse/markdown';
import {buildOutlineTree,type OutlineNode} from '../../src/core/parse/outlineTree';

const h=(level:number,text:string,line:number):HeadingItem=>({id:`heading_${line}_${text}`,level,text,line});
/** 一条链：甲(深度0) → 乙(1) → 丙(2) → 丁(3) → 戊(4)。 */
const chain:HeadingItem[]=[h(1,'甲',1),h(2,'乙',3),h(3,'丙',5),h(4,'丁',7),h(5,'戊',9)];
const state=(overrides:OutlineState['overrides']=new Map(),items:readonly HeadingItem[]=chain,filter=''):OutlineState=>({
  docId:'doc-1',items,filter,overrides,duplicates:new Set(),previousDuplicates:new Set(),
});
const texts=(view:{rows:{item:{text:string}}[]})=>view.rows.map(row=>row.item.text);

it('collapses the deep branches by default and marks the leaves as unfoldable',()=>{
 const view=outlineView(state(),'doc-1',null);
 // 深度 3 的「丁」默认收起：它自己可见，更深的「戊」不可见。
 expect(texts(view)).toEqual(['甲','乙','丙','丁']);
 const row=view.rows[3]!;
 expect(row.hasChildren).toBe(true);
 expect(row.foldable).toBe(true);
 expect(row.collapsed).toBe(true);
 // 中间层的「丙」有子标题，照样可折叠。
 expect(view.rows[2]!.hasChildren).toBe(true);
 expect(view.rows[2]!.foldable).toBe(true);
 expect(view.rows[0]!.collapsed).toBe(false);
 // 叶子没有折叠按钮。
 const leaf=outlineView(state(new Map(),[h(1,'甲',1),h(2,'乙',3)]),'doc-1',null);
 expect(leaf.rows[1]!.hasChildren).toBe(false);
 expect(leaf.rows[1]!.foldable).toBe(false);
});

it('hides only the descendants of a collapsed heading',()=>{
 const items=[h(1,'甲',1),h(2,'乙',3),h(3,'丙',5),h(1,'丁',7)];
 const view=outlineView(state(new Map([['甲',true]]),items),'doc-1',null);
 // 「甲」的子树（乙、丙）隐藏，兄弟根「丁」不受影响。
 expect(texts(view)).toEqual(['甲','丁']);
 expect(view.rows[0]!.collapsed).toBe(true);
 // 收起中间的一支：它的后代隐藏，兄弟不动。
 const deeper=outlineView(state(new Map([['乙',true]]),items),'doc-1',null);
 expect(texts(deeper)).toEqual(['甲','乙','丁']);
 expect(deeper.rows[1]!.collapsed).toBe(true);
});

it('gives every row the marks the render needs',()=>{
 const view=outlineView(state(new Map([['丁',true]])),'doc-1','heading_9_戊');
 const row=view.rows.find(candidate=>candidate.item.text==='丁')!;
 expect(row.foldable).toBe(true);
 expect(row.collapsed).toBe(true);
 // 高亮在「戊」，它在「丁」的子树里 ⇒ 「丁」被标记。
 expect(row.marked).toBe(true);
 expect(view.rows.every(candidate=>candidate.key.length>0)).toBe(true);
});

it('tells where the active heading is when a collapsed branch hides it',()=>{
 const view=outlineView(state(new Map([['丁',true]])),'doc-1','heading_9_戊');
 // 高亮「戊」被收起的「丁」挡住 ⇒ 位置指向「丁」，路径是从根到它。
 expect(view.location).toEqual({key:'丁',path:['甲','乙','丙','丁']});
 // 入口行被标出来，渲染据此挂 ref；只有一行是入口。
 expect(view.rows.find(row=>row.item.text==='丁')!.entry).toBe(true);
 expect(view.rows.filter(row=>row.entry)).toHaveLength(1);
 // 高亮可见时没有位置可指。
 expect(outlineView(state(new Map([['丁',true]])),'doc-1','heading_5_丙').location).toBe(null);
 // 搜索期间忽略折叠，不给位置。
 expect(outlineView(state(new Map([['丁',true]]),chain,'戊'),'doc-1','heading_9_戊').location).toBe(null);
});

it('ignores the fold state while searching and shows no fold buttons',()=>{
 const view=outlineView(state(new Map([['丁',true]]),chain,'戊'),'doc-1',null);
 // 命中项在收起的分支里，仍然可见。
 expect(texts(view)).toEqual(['戊']);
 expect(view.rows[0]!.foldable).toBe(false);
 expect(view.rows[0]!.collapsed).toBe(false);
 expect(view.empty).toBe(null);
});

it('leaves the branch of the active heading alone and marks its collapsed ancestor',()=>{
 const view=outlineView(state(new Map([['丁',true]])),'doc-1','heading_9_戊');
 // 高亮落在收起的分支里：它不在可见行里。
 expect(texts(view)).toContain('丁');
 expect(texts(view)).not.toContain('戊');
 // 收起的祖先带标记。
 expect(view.rows.find(row=>row.item.text==='丁')!.marked).toBe(true);
 // 没有高亮时没有标记。
 const plain=outlineView(state(new Map([['丁',true]])),'doc-1',null);
 expect(plain.rows.find(row=>row.item.text==='丁')!.marked).toBe(false);
});

it('treats the overrides of another document as empty',()=>{
 const mine=state(new Map([['丙',true]]));
 // 状态属于别的文档：覆盖不适用，等同默认状态（「丁」按深度默认收起）。
 const other=outlineView(mine,'doc-2',null);
 expect(texts(other)).toEqual(['甲','乙','丙','丁']);
 expect(other.rows.find(row=>row.item.text==='丁')!.collapsed).toBe(true);
 // 同一文档时覆盖生效：「丙」的子树隐藏。
 const own=outlineView(mine,'doc-1',null);
 expect(texts(own)).toEqual(['甲','乙','丙']);
});

it('reports whether everything is expanded and why the list is empty',()=>{
 expect(outlineView(state(),'doc-1',null).allExpanded).toBe(false);
 expect(outlineView(state(new Map([['丁',false]])),'doc-1',null).allExpanded).toBe(true);
 expect(outlineView(state(new Map(),[]),'doc-1',null).empty).toBe('none');
 expect(outlineView(state(new Map(),chain,'没有这个标题'),'doc-1',null).empty).toBe('no-match');
 expect(outlineView(state(),'doc-1',null).empty).toBe(null);
});

// —— R2：状态机 ——

const reduce=(current:OutlineState,action:OutlineAction)=>outlineReducer(current,action);
/** 树上所有节点的稳定键，按文档顺序。测试不写死键的格式。 */
const allKeys=(items:readonly HeadingItem[]):string[]=>{
 const out:string[]=[];
 const walk=(nodes:readonly OutlineNode[])=>{for(const node of nodes){out.push(node.key);walk(node.children);}};
 walk(buildOutlineTree(items));
 return out;
};

it('clears the choices when the document changes and keeps them cleared when coming back',()=>{
 const first=reduce(state(new Map([['丁',true]])),{type:'sync',docId:'doc-1',items:chain});
 expect(first.overrides.get('丁')).toBe(true);
 const second=reduce(first,{type:'sync',docId:'doc-2',items:chain});
 expect(second.overrides.size).toBe(0);
 const back=reduce(second,{type:'sync',docId:'doc-1',items:chain});
 expect(back.overrides.size).toBe(0);
 // 视图上是默认状态。
 expect(texts(outlineView(back,'doc-1',null))).toEqual(['甲','乙','丙','丁']);
});

it('drops the choices of a heading that became ambiguous and never moves them to another one',()=>{
 const one=[h(1,'概述',1),h(2,'结论',3)];
 const two=[h(1,'概述',1),h(2,'概述',3),h(2,'结论',5)];
 const single=reduce(state(new Map([['概述',true]])),{type:'sync',docId:'doc-1',items:one});
 expect(single.overrides.get('概述')).toBe(true);
 // 一个变两个：覆盖被清掉。
 const ambiguous=reduce(single,{type:'sync',docId:'doc-1',items:two});
 expect(ambiguous.overrides.size).toBe(0);
 // 两个变一个：上一修订里同名，覆盖也被清掉，不会落到新的那一个上。
 const pair=reduce(state(),{type:'sync',docId:'doc-1',items:two});
 const pairKeys=allKeys(two);
 const withChoice=reduce(pair,{type:'toggle',key:pairKeys[0]!});
 expect(withChoice.overrides.get(pairKeys[0]!)).toBe(true);
 const singleAgain=reduce(withChoice,{type:'sync',docId:'doc-1',items:one});
 expect(singleAgain.overrides.size).toBe(0);
 expect(singleAgain.overrides.has('概述')).toBe(false);
});

it('keeps the choice of a unique heading when the text above it changes',()=>{
 const before=reduce(state(new Map([['丁',true]])),{type:'sync',docId:'doc-1',items:chain});
 const shifted=[h(1,'甲',1),h(2,'乙',3),h(3,'丙',5),h(4,'丁',99),h(5,'戊',101)];
 const after=reduce(before,{type:'sync',docId:'doc-1',items:shifted});
 expect(after.overrides.get('丁')).toBe(true);
});

it('writes the choices so that the view agrees with them',()=>{
 // 默认收起的「丁」点一下就展开，再点一下就收起。
 const opened=reduce(state(),{type:'toggle',key:'丁'});
 expect(opened.overrides.get('丁')).toBe(false);
 expect(texts(outlineView(opened,'doc-1',null))).toEqual(['甲','乙','丙','丁','戊']);
 const closed=reduce(opened,{type:'toggle',key:'丁'});
 expect(closed.overrides.get('丁')).toBe(true);
 expect(texts(outlineView(closed,'doc-1',null))).toEqual(['甲','乙','丙','丁']);
 // 全部展开 / 全部折叠：按钮在两态之间切换。
 const expanded=reduce(state(),{type:'toggle-all'});
 expect(outlineView(expanded,'doc-1',null).allExpanded).toBe(true);
 expect(texts(outlineView(expanded,'doc-1',null))).toEqual(['甲','乙','丙','丁','戊']);
 const collapsed=reduce(expanded,{type:'toggle-all'});
 expect(outlineView(collapsed,'doc-1',null).allExpanded).toBe(false);
 expect(texts(outlineView(collapsed,'doc-1',null))).toEqual(['甲']);
});

it('opens the path of the heading it jumps to',()=>{
 const closed=reduce(state(new Map([['丙',true],['丁',true]])),{type:'sync',docId:'doc-1',items:chain});
 expect(texts(outlineView(closed,'doc-1',null))).toEqual(['甲','乙','丙']);
 const jumped=reduce(closed,{type:'jump',itemId:'heading_9_戊'});
 expect(jumped.overrides.get('丙')).toBe(false);
 expect(jumped.overrides.get('丁')).toBe(false);
 expect(texts(outlineView(jumped,'doc-1',null))).toEqual(['甲','乙','丙','丁','戊']);
});
