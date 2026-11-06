import {expect,it} from 'vitest';
import {
  ancestorKeys,
  buildOutlineTree,
  collapsibleKeys,
  collapsedAncestors,
  collapsedEntrance,
  duplicateHeadingTexts,
  effectiveCollapsed,
  outlineRows,
  pruneOverrides,
} from '../../src/core/parse/outlineTree';
import type {HeadingItem} from '../../src/core/parse/markdown';

/** 稳定键里的分隔符，与实现一致。 */
const SEP='\u0000';

const h=(level:number,text:string,line:number):HeadingItem=>({id:`heading_${line}_${text}`,level,text,line});
const keys=(items:readonly HeadingItem[])=>items.map(item=>item.text);
const rowsOf=(items:readonly HeadingItem[],collapsed:ReadonlySet<string>=new Set())=>outlineRows(buildOutlineTree(items),collapsed);

it('nests a flat heading list by level and tolerates skipped levels',()=>{
 const tree=buildOutlineTree([h(1,'甲',1),h(3,'乙',3),h(2,'丙',5)]);
 expect(tree).toHaveLength(1);
 expect(keys(tree[0]!.children.map(child=>child.item))).toEqual(['乙','丙']);
 expect(tree[0]!.children[0]!.children).toEqual([]);
 expect(tree[0]!.children[1]!.children).toEqual([]);
});

it('reports only the headings that have children as collapsible',()=>{
 const tree=buildOutlineTree([h(1,'甲',1),h(2,'乙',3),h(2,'丙',5)]);
 expect(collapsibleKeys(tree)).toEqual(['甲']);
 expect(rowsOf([h(1,'甲',1),h(2,'乙',3),h(2,'丙',5)]).map(row=>row.hasChildren)).toEqual([true,false,false]);
});

it('hides the descendants of a collapsed heading and leaves the siblings alone',()=>{
 const items=[h(1,'甲',1),h(2,'乙',3),h(3,'丙',5),h(1,'丁',7)];
 const collapsed=new Set(['甲']);
 expect(keys(rowsOf(items,collapsed).map(row=>row.item))).toEqual(['甲','丁']);
 expect(rowsOf(items,collapsed)[0]!.collapsed).toBe(true);
 expect(rowsOf(items,collapsed)[1]!.collapsed).toBe(false);
});

it('collapses by depth unless the user chose otherwise',()=>{
 const items=[h(1,'甲',1),h(2,'乙',3),h(3,'丙',5),h(4,'丁',7),h(5,'戊',9)];
 const tree=buildOutlineTree(items);
 // 甲=0 乙=1 丙=2 丁=3 戊=4：深度 3 起默认收起，只有有子节点的标题可折叠。
 expect([...effectiveCollapsed(tree,new Map(),3)]).toEqual(['丁']);
 expect([...effectiveCollapsed(tree,new Map([['丁',false]]),3)]).toEqual([]);
 expect([...effectiveCollapsed(tree,new Map([['甲',true]]),3)]).toEqual(['甲','丁']);
});

it('drops the overrides of a heading that became ambiguous and never moves them to another section',()=>{
 const single=new Map([['概述',true]]);
 const two=new Map([['概述'+SEP+'1',true],['概述'+SEP+'2',false]]);
 const unique=new Map([['结论',true]]);
 // 一个变两个：覆盖随键失效而丢弃。
 expect(pruneOverrides(single,new Set(['概述']),new Set()).size).toBe(0);
 // 两个变一个：上一修订里同名，同样丢弃。
 expect(pruneOverrides(two,new Set(),new Set(['概述'])).size).toBe(0);
 // 唯一标题不受影响。
 expect(pruneOverrides(unique,new Set(['概述']),new Set(['概述'])).get('结论')).toBe(true);
 // 没有要清理的覆盖时原样返回，调用方据此省掉一次渲染。
 const untouched=new Map([['结论',true]]);
 expect(pruneOverrides(untouched,new Set(),new Set())).toBe(untouched);
 expect(pruneOverrides(unique,new Set(['概述']),new Set(['概述']))).toBe(unique);
});

it('keeps the key of a unique heading when the text above it changes',()=>{
 const before=[h(1,'甲',1),h(2,'乙',10)];
 const after=[h(1,'甲',1),h(2,'乙',42)];
 expect(buildOutlineTree(before)[0]!.children[0]!.key).toBe(buildOutlineTree(after)[0]!.children[0]!.key);
 expect(buildOutlineTree(before)[0]!.key).toBe('甲');
 expect(pruneOverrides(new Map([['乙',true]]),new Set(),new Set()).get('乙')).toBe(true);
});

it('separates the headings that share a text by their order',()=>{
 const tree=buildOutlineTree([h(1,'概述',1),h(2,'概述',3),h(1,'结论',5)]);
 expect(tree[0]!.key).toBe('概述'+SEP+'1');
 expect(tree[0]!.children[0]!.key).toBe('概述'+SEP+'2');
 expect(tree[1]!.key).toBe('结论');
 expect([...duplicateHeadingTexts([h(1,'概述',1),h(2,'概述',3),h(1,'结论',5)])]).toEqual(['概述']);
});

it('finds the collapsed ancestors that hold the active heading',()=>{
 const items=[h(1,'甲',1),h(2,'乙',3),h(3,'丙',5)];
 const tree=buildOutlineTree(items);
 const collapsed=new Set(['甲','乙']);
 expect([...collapsedAncestors(tree,'heading_5_丙',collapsed)]).toEqual(['甲','乙']);
 expect([...collapsedAncestors(tree,'heading_1_甲',collapsed)]).toEqual([]);
 expect([...collapsedAncestors(tree,null,collapsed)]).toEqual([]);
});

it('lists the ancestors of a heading from the top down',()=>{
 const tree=buildOutlineTree([h(1,'甲',1),h(2,'乙',3),h(3,'丙',5)]);
 expect(ancestorKeys(tree,'heading_5_丙')).toEqual(['甲','乙']);
 expect(ancestorKeys(tree,'heading_1_甲')).toEqual([]);
});

it('points at the outermost collapsed ancestor that still holds the active heading',()=>{
 const items=[h(1,'甲',1),h(2,'乙',3),h(3,'丙',5),h(4,'丁',7),h(5,'戊',9)];
 const tree=buildOutlineTree(items);
 // 「丙」和「丁」都收起：挡住「戊」的收起祖先有两个，但「丙」的行被更外层挡住时看不见，
 // 能指路的只有仍然可见的那一个。
 expect(collapsedEntrance(tree,'heading_9_戊',new Set(['丙','丁']))).toBe('丙');
 // 只有一层收起时就是那一层。
 expect(collapsedEntrance(tree,'heading_9_戊',new Set(['丁']))).toBe('丁');
 // 收起的那一行自己仍然可见（收起只藏后代），高亮在它身上时没有入口。
 expect(collapsedEntrance(tree,'heading_5_丙',new Set(['丙','丁']))).toBe(null);
 // 但它被外层的收起挡住时，就有入口了。
 expect(collapsedEntrance(tree,'heading_7_丁',new Set(['丙','丁']))).toBe('丙');
 expect(collapsedEntrance(tree,null,new Set(['丙','丁']))).toBe(null);
});
