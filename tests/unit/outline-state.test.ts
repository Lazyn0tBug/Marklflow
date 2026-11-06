import {expect,it} from 'vitest';
import {outlineView,type OutlineState} from '../../src/application/workspace/outlineState';
import type {HeadingItem} from '../../src/core/parse/markdown';

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

it('gives every row the four marks the render needs',()=>{
 const view=outlineView(state(new Map([['丁',true]])),'doc-1','heading_9_戊');
 const row=view.rows.find(candidate=>candidate.item.text==='丁')!;
 expect(row.foldable).toBe(true);
 expect(row.collapsed).toBe(true);
 // 高亮在「戊」，它在「丁」的子树里 ⇒ 「丁」被标记。
 expect(row.marked).toBe(true);
 expect(view.rows.every(candidate=>candidate.key.length>0)).toBe(true);
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
