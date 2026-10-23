/**
 * MarkFlow (墨流) Graphviz DOT 渲染器
 * 将 DOT 语言转换为自包含、高保真 SVG 矢量图
 * 无需安装系统级 graphviz dot 工具，纯前端离线解析
 */

export interface DotNode {
  id: string;
  label: string;
  shape?: string;
  fillcolor?: string;
  color?: string;
}

export interface DotEdge {
  from: string;
  to: string;
  label?: string;
  color?: string;
}

export interface DotGraph {
  title?: string;
  rankdir: 'TB' | 'LR' | 'BT' | 'RL';
  nodes: Map<string, DotNode>;
  edges: DotEdge[];
}

export function parseDotToGraph(dotSource: string): DotGraph {
  const graph: DotGraph = {
    rankdir: 'TB',
    nodes: new Map(),
    edges: [],
  };

  const lines = dotSource.split('\n');

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//') || line.startsWith('#') || line.startsWith('/*')) {
      continue;
    }

    // 检测 rankdir
    const rankMatch = line.match(/rankdir\s*=\s*(LR|TB|BT|RL)/i);
    if (rankMatch) {
      graph.rankdir = rankMatch[1].toUpperCase() as 'TB' | 'LR' | 'BT' | 'RL';
    }

    // 检测边关系: NodeA -> NodeB [label="..."]
    const edgeMatch = line.match(/([a-zA-Z0-9_]+)\s*->\s*([a-zA-Z0-9_]+)(?:\s*\[(.*?)\])?/);
    if (edgeMatch) {
      const from = edgeMatch[1];
      const to = edgeMatch[2];
      const attrsStr = edgeMatch[3] || '';
      const labelMatch = attrsStr.match(/label\s*=\s*["'](.*?)["']/);
      const colorMatch = attrsStr.match(/color\s*=\s*["'](.*?)["']/);

      graph.edges.push({
        from,
        to,
        label: labelMatch ? labelMatch[1].replace(/\\n/g, ' ') : undefined,
        color: colorMatch ? colorMatch[1] : undefined,
      });

      if (!graph.nodes.has(from)) {
        graph.nodes.set(from, { id: from, label: from });
      }
      if (!graph.nodes.has(to)) {
        graph.nodes.set(to, { id: to, label: to });
      }
      continue;
    }

    // 检测节点定义: NodeA [label="...", fillcolor="...", color="..."]
    const nodeMatch = line.match(/^([a-zA-Z0-9_]+)\s*\[(.*?)\]/);
    if (nodeMatch) {
      const id = nodeMatch[1];
      const attrsStr = nodeMatch[2];
      const labelMatch = attrsStr.match(/label\s*=\s*["'](.*?)["']/);
      const fillMatch = attrsStr.match(/fillcolor\s*=\s*["'](.*?)["']/);
      const colorMatch = attrsStr.match(/color\s*=\s*["'](.*?)["']/);
      const shapeMatch = attrsStr.match(/shape\s*=\s*([a-zA-Z]+)/);

      graph.nodes.set(id, {
        id,
        label: labelMatch ? labelMatch[1].replace(/\\n/g, '\n') : id,
        fillcolor: fillMatch ? fillMatch[1] : '#f8fafc',
        color: colorMatch ? colorMatch[1] : '#64748b',
        shape: shapeMatch ? shapeMatch[1] : 'box',
      });
    }
  }

  return graph;
}

/**
 * 将解析后的 DotGraph 布局并输出为美观响应式的 SVG
 */
export function renderDotToSVG(dotSource: string): string {
  try {
    const graph = parseDotToGraph(dotSource);
    const nodeList = Array.from(graph.nodes.values());
    if (nodeList.length === 0) {
      return `<div class="p-3 text-xs text-amber-500 bg-amber-50 rounded">未检测到有效的 DOT 节点定义</div>`;
    }

    const isLR = graph.rankdir === 'LR';
    const nodeWidth = 160;
    const nodeHeight = 54;
    const gapX = isLR ? 100 : 40;
    const gapY = isLR ? 40 : 80;

    // 简单分层拓扑计算
    const levels: Map<string, number> = new Map();
    // 寻找入度为 0 的根节点
    const inDegrees: Map<string, number> = new Map();
    for (const n of nodeList) inDegrees.set(n.id, 0);
    for (const e of graph.edges) {
      inDegrees.set(e.to, (inDegrees.get(e.to) || 0) + 1);
    }

    // BFS 赋层级
    const queue: string[] = [];
    for (const [id, deg] of inDegrees.entries()) {
      if (deg === 0) {
        levels.set(id, 0);
        queue.push(id);
      }
    }
    if (queue.length === 0 && nodeList.length > 0) {
      levels.set(nodeList[0].id, 0);
      queue.push(nodeList[0].id);
    }

    while (queue.length > 0) {
      const curr = queue.shift()!;
      const currLvl = levels.get(curr) || 0;
      for (const e of graph.edges) {
        if (e.from === curr) {
          if (!levels.has(e.to) || levels.get(e.to)! < currLvl + 1) {
            levels.set(e.to, currLvl + 1);
            queue.push(e.to);
          }
        }
      }
    }

    // 兜底补全层级
    for (const n of nodeList) {
      if (!levels.has(n.id)) levels.set(n.id, 0);
    }

    // 分组
    const levelGroups: Map<number, DotNode[]> = new Map();
    for (const n of nodeList) {
      const lvl = levels.get(n.id) || 0;
      if (!levelGroups.has(lvl)) levelGroups.set(lvl, []);
      levelGroups.get(lvl)!.push(n);
    }

    const nodePositions: Map<string, { x: number; y: number }> = new Map();
    const sortedLevels = Array.from(levelGroups.keys()).sort((a, b) => a - b);

    let maxDimX = 0;
    let maxDimY = 0;

    for (const lvl of sortedLevels) {
      const nodesInLvl = levelGroups.get(lvl)!;
      for (let i = 0; i < nodesInLvl.length; i++) {
        const node = nodesInLvl[i];
        let x: number, y: number;
        if (isLR) {
          x = 40 + lvl * (nodeWidth + gapX);
          y = 40 + i * (nodeHeight + gapY);
        } else {
          x = 40 + i * (nodeWidth + gapX);
          y = 40 + lvl * (nodeHeight + gapY);
        }
        nodePositions.set(node.id, { x, y });
        maxDimX = Math.max(maxDimX, x + nodeWidth + 40);
        maxDimY = Math.max(maxDimY, y + nodeHeight + 40);
      }
    }

    // 生成 SVG 内容
    let edgesSvg = '';
    for (const e of graph.edges) {
      const p1 = nodePositions.get(e.from);
      const p2 = nodePositions.get(e.to);
      if (!p1 || !p2) continue;

      let startX: number, startY: number, endX: number, endY: number;
      if (isLR) {
        startX = p1.x + nodeWidth;
        startY = p1.y + nodeHeight / 2;
        endX = p2.x;
        endY = p2.y + nodeHeight / 2;
      } else {
        startX = p1.x + nodeWidth / 2;
        startY = p1.y + nodeHeight;
        endX = p2.x + nodeWidth / 2;
        endY = p2.y;
      }

      const ctrlX1 = isLR ? (startX + endX) / 2 : startX;
      const ctrlY1 = isLR ? startY : (startY + endY) / 2;
      const ctrlX2 = isLR ? (startX + endX) / 2 : endX;
      const ctrlY2 = isLR ? endY : (startY + endY) / 2;

      const pathData = `M ${startX} ${startY} C ${ctrlX1} ${ctrlY1}, ${ctrlX2} ${ctrlY2}, ${endX} ${endY}`;
      const edgeColor = e.color || '#0d9488';

      edgesSvg += `
        <path d="${pathData}" fill="none" stroke="${edgeColor}" stroke-width="2" marker-end="url(#arrowhead)" />
      `;

      if (e.label) {
        const midX = (startX + endX) / 2;
        const midY = (startY + endY) / 2 - 8;
        edgesSvg += `
          <rect x="${midX - e.label.length * 4 - 4}" y="${midY - 10}" width="${e.label.length * 8 + 8}" height="16" fill="white" rx="3" opacity="0.9"/>
          <text x="${midX}" y="${midY + 2}" font-size="11" fill="#475569" text-anchor="middle" font-family="sans-serif">${escapeHtml(e.label)}</text>
        `;
      }
    }

    let nodesSvg = '';
    for (const node of nodeList) {
      const pos = nodePositions.get(node.id)!;
      const strokeColor = node.color || '#0d9488';
      const bgColor = node.fillcolor || '#f0fdfa';
      const lines = node.label.split('\n');

      nodesSvg += `
        <g class="graph-node" transform="translate(${pos.x}, ${pos.y})">
          <rect width="${nodeWidth}" height="${nodeHeight}" rx="6" fill="${bgColor}" stroke="${strokeColor}" stroke-width="1.5" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.05))"/>
          ${lines.map((l, idx) => {
            const yOffset = lines.length === 1 ? nodeHeight / 2 + 4 : (nodeHeight / (lines.length + 1)) * (idx + 1) + 4;
            const isSub = idx > 0;
            return `<text x="${nodeWidth / 2}" y="${yOffset}" font-size="${isSub ? 10 : 12}" font-weight="${isSub ? '400' : '600'}" fill="${isSub ? '#64748b' : '#0f172a'}" text-anchor="middle" font-family="sans-serif">${escapeHtml(l)}</text>`;
          }).join('')}
        </g>
      `;
    }

    return `
      <div class="my-4 overflow-x-auto flex justify-center p-2 rounded-lg bg-neutral-50/50 dark:bg-neutral-800/20 border border-neutral-200 dark:border-neutral-700/50">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${maxDimX} ${maxDimY}" width="${maxDimX}" height="${maxDimY}" style="max-width:100%; height:auto;">
          <defs>
            <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#0d9488" />
            </marker>
          </defs>
          ${edgesSvg}
          ${nodesSvg}
        </svg>
      </div>
    `;
  } catch (err) {
    return `<div class="p-3 text-xs text-red-500 bg-red-50 rounded">Graphviz 解析失败: ${String(err)}</div>`;
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
