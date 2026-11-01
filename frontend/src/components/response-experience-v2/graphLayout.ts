import type { ResponseNodeV2 } from './document';

/** A reading order is not a dependency. Only draw a continuous flow when each
 * supplied edge proves that exact sequence. Branches/cycles keep their edges. */
export function isLinearFlowV2(node: Extract<ResponseNodeV2, { kind: 'graph' }>): boolean {
  return node.nodes.length > 1 && node.edges.length === node.nodes.length - 1 &&
    node.nodes.slice(0, -1).every((item, index) =>
      node.edges.some(edge => edge.source === item.id && edge.target === node.nodes[index + 1].id));
}
