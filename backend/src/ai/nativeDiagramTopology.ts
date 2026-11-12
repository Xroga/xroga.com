export const DIAGRAM_NODE_TONES = ['neutral', 'info', 'success', 'purple', 'warning'] as const;

/** Relationship and layout constraints shared by Workspace admission and the renderer. */
export function hasRenderableDiagramTopology(nodes: unknown, links: unknown): boolean {
  if (!Array.isArray(nodes) || nodes.length < 2 || nodes.length > 12 ||
      !Array.isArray(links) || links.length < 1 || links.length > 18) return false;
  const ids = new Set<string>();
  const peers = new Map<number, number>();
  for (const node of nodes) {
    if (!node || typeof node.id !== 'string' || !/^[a-z][a-z0-9-]{0,31}$/.test(node.id) ||
        ids.has(node.id) || !Number.isInteger(node.level) || node.level < 0 || node.level > 5) return false;
    ids.add(node.id);
    const count = (peers.get(node.level) ?? 0) + 1;
    if (count > 3) return false;
    peers.set(node.level, count);
  }
  return links.every(link => link && link.from !== link.to && ids.has(link.from) && ids.has(link.to));
}
