/**
 * 大纲的状态与视图。
 *
 * 状态（OutlineState）是唯一的所有者：文档、标题、搜索词、显式覆盖，以及判断
 * 同名组所需的当前与上一修订的重复标题。视图（outlineView）是纯函数：给它状态、
 * 当前文档与高亮标题，它给出要渲染的行。组件只渲染，不判断（见设计 §3）。
 */
import type {HeadingItem} from '../../core/parse/markdown';
import {
  buildOutlineTree,
  collapsedAncestors,
  collapsibleKeys,
  effectiveCollapsed,
  outlineRows,
} from '../../core/parse/outlineTree';

/** 深度 ≥ 3 的分支默认收起（根的深度是 0）。 */
export const DEFAULT_COLLAPSED_DEPTH=3;

const EMPTY_SET:ReadonlySet<string>=new Set();
const EMPTY_MAP:ReadonlyMap<string,boolean>=new Map();

export interface OutlineState {
  /** 状态属于哪个文档。换文档后覆盖不再适用。 */
  docId:string;
  /** 标题提取的结果。 */
  items:readonly HeadingItem[];
  /** 搜索词。非空时搜索忽略折叠。 */
  filter:string;
  /** 显式覆盖：稳定键 → 是否收起。未出现的键按默认深度取值。 */
  overrides:ReadonlyMap<string,boolean>;
  /** 当前修订里出现至少两次的标题文本。 */
  duplicates:ReadonlySet<string>;
  /** 上一修订里出现至少两次的标题文本。 */
  previousDuplicates:ReadonlySet<string>;
}

/** 一行。四个标记由视图给出，渲染不再自己判断。 */
export interface OutlineRow {
  item:HeadingItem;
  key:string;
  /** 有子标题。 */
  hasChildren:boolean;
  /** 是否渲染折叠按钮：叶子或搜索态为 false。 */
  foldable:boolean;
  /** 收起中。 */
  collapsed:boolean;
  /** 收起的、且其子树包含当前高亮标题。 */
  marked:boolean;
}

export interface OutlineView {
  rows:OutlineRow[];
  /** 全部可折叠节点都展开着。工具按钮据此在"全部展开"与"全部折叠"之间切换。 */
  allExpanded:boolean;
  /** 没有标题 / 有标题但没有命中 / 有内容。 */
  empty:'none'|'no-match'|null;
}

/**
 * 状态 → 视图。纯函数：同样的输入给同样的输出。
 *
 * - 状态属于别的文档时，覆盖视为空 ⇒ 换文档的第一帧不显示旧文档的折叠。
 * - 搜索时忽略折叠：命中的标题全部可见，且不渲染折叠按钮。
 * - 收起只隐藏后代，标题行与折叠按钮保留。
 */
export function outlineView(
  state:OutlineState,
  currentDocId:string,
  activeHeadingId:string|null|undefined,
):OutlineView{
  const needle=state.filter.trim().toLowerCase();
  const searching=needle.length>0;
  const overrides=state.docId===currentDocId?state.overrides:EMPTY_MAP;
  const tree=buildOutlineTree(state.items);
  const collapsed=effectiveCollapsed(tree,overrides,DEFAULT_COLLAPSED_DEPTH);
  const marked=collapsedAncestors(tree,activeHeadingId??null,collapsed);
  const visible=outlineRows(tree,searching?EMPTY_SET:collapsed);
  const rows=searching
    ?visible.filter(row=>row.item.text.toLowerCase().includes(needle))
    :visible;
  return {
    rows:rows.map(row=>({
      item:row.item,
      key:row.key,
      hasChildren:row.hasChildren,
      foldable:row.hasChildren&&!searching,
      collapsed:row.collapsed,
      marked:marked.has(row.key),
    })),
    allExpanded:collapsibleKeys(tree).every(key=>!collapsed.has(key)),
    empty:state.items.length===0?'none':rows.length===0?'no-match':null,
  };
}
