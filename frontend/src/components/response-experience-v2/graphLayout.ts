import type { ResponseNodeV2 } from './document';

/** Positions are presentation only. Cycles use a neutral grid, never an invented
 * dependency order. Every supplied edge is retained by the diagram renderer. */
export function graphPositionsV2(node: Extract<ResponseNodeV2, { kind: 'graph' }>, compact = false, rowHeight = 210) {
  const layers = graphLayersV2(node);
  const ranks = layers ?? Array.from({ length: Math.ceil(node.nodes.length / 2) }, (_, i) => node.nodes.slice(i * 2, i * 2 + 2).map(n => n.id));
  const columns = Math.max(1, ...ranks.map(layer => layer.length));
  // A narrow canvas reflows nodes, not text size. Edges still carry the supplied
  // topology, including branches and back edges, rather than implying a list.
  if (compact) return ranks.flat().map((id, row) => ({ id, x: 40, y: row * rowHeight }));
  return ranks.flatMap((layer, row) => layer.map((id, column) => ({ id, x: (column + (columns - layer.length) / 2) * 280, y: row * rowHeight })));
}

/** Keep branches spatially distinct at a readable 1:1 scale. Narrow containers
 * scroll the diagram locally instead of shrinking labels or flattening topology. */
export function graphCanvasV2(node: Extract<ResponseNodeV2, { kind: 'graph' }>, compact = false, availableWidth = 336) {
  const nodeWidth = compact ? Math.max(180, Math.min(224, availableWidth - 68)) : 224;
  const charactersPerLine = Math.max(12, Math.floor((nodeWidth - 32) / 8));
  const nodeHeight = Math.max(88, ...node.nodes.map(item =>
    44 + Math.ceil(item.label.length / charactersPerLine) * 21 + (item.detail ? 8 + Math.ceil(item.detail.length / charactersPerLine) * 20 : 0)));
  const rowHeight = nodeHeight + 112;
  const base = graphPositionsV2(node, compact, rowHeight);
  const byId = new Map(base.map(p => [p.id, p]));
  let lanes = 0;
  const edgeLanes = node.edges.map(edge => byId.get(edge.target)!.y - byId.get(edge.source)!.y === rowHeight ? null : lanes++);
  // Edge badges refer to the full connection legend. Routing lanes don't need
  // the width of a sentence, which pushed cyclic diagrams off-screen.
  const positions = base.map(item => ({ ...item, x: compact ? 64 : item.x + 124 + lanes * 24, y: item.y + 32 }));
  return { nodeWidth, nodeHeight, positions, edgeLanes: edgeLanes.map(lane => lane === null ? null : compact ? 16 + (lane % 3) * 12 : 20 + lane * 24),
    width: Math.max(compact ? 248 : 320, ...positions.map(item => item.x + nodeWidth + (compact ? 4 : 48))),
    height: Math.max(240, ...positions.map(item => item.y + nodeHeight + 48)) };
}

/** A reading order is not a dependency. Only draw a continuous flow when each
 * supplied edge proves that exact sequence. Branches/cycles keep their edges. */
export function isLinearFlowV2(node: Extract<ResponseNodeV2, { kind: 'graph' }>): boolean {
  return node.nodes.length > 1 && node.edges.length === node.nodes.length - 1 &&
    node.nodes.slice(0, -1).every((item, index) =>
      node.edges.some(edge => edge.source === item.id && edge.target === node.nodes[index + 1].id));
}

/** Bounded DAG layout. Cycles retain the explicit textual edge representation.
 * Ranking changes spatial placement only, never node wording or edge direction. */
export function graphLayersV2(node: Extract<ResponseNodeV2, { kind: 'graph' }>): string[][] | null {
  const remaining = new Map(node.nodes.map(item => [item.id, 0]));
  const ranks = new Map(node.nodes.map(item => [item.id, 0]));
  for (const edge of node.edges) remaining.set(edge.target, (remaining.get(edge.target) ?? 0) + 1);
  const ready = node.nodes.filter(item => remaining.get(item.id) === 0).map(item => item.id);
  let visited = 0;
  while (ready.length) {
    const id = ready.shift()!; visited++;
    for (const edge of node.edges.filter(item => item.source === id)) {
      ranks.set(edge.target, Math.max(ranks.get(edge.target) ?? 0, (ranks.get(id) ?? 0) + 1));
      remaining.set(edge.target, remaining.get(edge.target)! - 1);
      if (remaining.get(edge.target) === 0) ready.push(edge.target);
    }
  }
  if (visited !== node.nodes.length) return null;
  const layers: string[][] = [];
  for (const item of node.nodes) (layers[ranks.get(item.id)!] ??= []).push(item.id);
  return layers;
}
