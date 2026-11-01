import type { ResponseNodeV2 } from './document';

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
