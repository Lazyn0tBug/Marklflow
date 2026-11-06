/**
 * 大纲的状态与视图。
 *
 * 状态（OutlineState）是唯一的所有者：文档、标题、搜索词、显式覆盖，以及判断
 * 同名组所需的当前与上一修订的重复标题。视图（outlineView）是纯函数：给它状态、
 * 当前文档与高亮标题，它给出要渲染的行。组件只渲染，不判断（见设计 §3）。
 */
import type {HeadingItem} from '../../core/parse/markdown';
import {
  ancestorKeys,
  buildOutlineTree,
  collapsedAncestors,
  collapsedLocation,
  collapsibleKeys,
  duplicateHeadingTexts,
  effectiveCollapsed,
  outlineRows,
  pruneOverrides,
} from '../../core/parse/outlineTree';

/** 深度 ≥ 3 的分支默认收起（根的深度是 0）。 */
const DEFAULT_COLLAPSED_DEPTH=3;

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

/** 一行。五个标记由视图给出，渲染不再自己判断。 */
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
  /** 高亮被收起挡住时的入口行：挡住它的那个收起祖先。 */
  entry:boolean;
}

export interface OutlineView {
  rows:OutlineRow[];
  /** 全部可折叠节点都展开着。工具按钮据此在"全部展开"与"全部折叠"之间切换。 */
  allExpanded:boolean;
  /** 没有标题 / 有标题但没有命中 / 有内容。 */
  empty:'none'|'no-match'|null;
  /**
   * 高亮被收起挡住时的位置：入口行的键与从根到它的标题路径。
   * 高亮可见时为 null。搜索期间忽略折叠，所以也是 null。
   */
  location:{key:string; path:string[]}|null;
}

/** 动作。外部世界对组件只有"我变了"这一件事，所以只有一条 `sync`。 */
export type OutlineAction =
  | {type:'sync'; docId:string; items:readonly HeadingItem[]}
  | {type:'filter'; value:string}
  | {type:'toggle'; key:string}
  | {type:'toggle-all'}
  | {type:'jump'; itemId:string};

/**
 * 状态机。纯函数：动作 → 新状态。
 *
 * - `sync`：换文档 ⇒ 覆盖清零；同一文档的修订变化 ⇒ 丢弃同名组的覆盖（用当前 ∪ 上一修订的同名文本判定）。
 * - `toggle` / `toggle-all`：按"当前生效值的反面"写覆盖，生效值由深度默认与已有覆盖算出。
 * - `jump`：把该标题的祖先键写为展开。
 */
export function outlineReducer(state:OutlineState,action:OutlineAction):OutlineState{
  switch(action.type){
    case 'filter':{
      return state.filter===action.value?state:{...state,filter:action.value};
    }
    case 'sync':{
      const duplicates=duplicateHeadingTexts(action.items);
      if(action.docId!==state.docId){
        // 换文档：覆盖清零，搜索词保留（与今天一致），同名组以新文档的当前修订为基线。
        return {...state,docId:action.docId,items:action.items,overrides:new Map(),duplicates,previousDuplicates:duplicates};
      }
      const overrides=pruneOverrides(state.overrides,duplicates,state.duplicates);
      return {...state,docId:action.docId,items:action.items,overrides,duplicates,previousDuplicates:state.duplicates};
    }
    case 'toggle':{
      const tree=buildOutlineTree(state.items);
      const collapsed=effectiveCollapsed(tree,state.overrides,DEFAULT_COLLAPSED_DEPTH);
      const overrides=new Map(state.overrides);
      overrides.set(action.key,!collapsed.has(action.key));
      return {...state,overrides};
    }
    case 'toggle-all':{
      const tree=buildOutlineTree(state.items);
      const collapsed=effectiveCollapsed(tree,state.overrides,DEFAULT_COLLAPSED_DEPTH);
      const keys=collapsibleKeys(tree);
      const allExpanded=keys.every(key=>!collapsed.has(key));
      const overrides=new Map(state.overrides);
      for(const key of keys)overrides.set(key,allExpanded);
      return {...state,overrides};
    }
    case 'jump':{
      const tree=buildOutlineTree(state.items);
      const keys=ancestorKeys(tree,action.itemId);
      if(!keys.length)return state;
      const overrides=new Map(state.overrides);
      for(const key of keys)overrides.set(key,false);
      return {...state,overrides};
    }
  }
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
  // 搜索期间忽略折叠，高亮是否被挡住与折叠无关，所以不给位置。
  const location=searching?null:collapsedLocation(tree,activeHeadingId??null,collapsed);
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
      entry:location?.key===row.key,
    })),
    allExpanded:collapsibleKeys(tree).every(key=>!collapsed.has(key)),
    empty:state.items.length===0?'none':rows.length===0?'no-match':null,
    location,
  };
}
