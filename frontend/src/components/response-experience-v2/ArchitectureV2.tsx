'use client';
import { useMemo, useRef, useState, useEffect } from 'react';
import { ReactFlow, Controls, MarkerType, Position } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { ResponseNodeV2 } from './document';
import { graphPositionsV2 } from './graphLayout';
import styles from './response-v2.module.css';

/** Data-only graph. No executable actions, remote layout or model calls. */
export default function ArchitectureV2({ node }: { node: Extract<ResponseNodeV2, { kind: 'graph' }> }) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  useEffect(() => {
    if (!container.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => { if (entry.contentRect.width > 0) setWidth(entry.contentRect.width); });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const compact = width < 560;
  const nodeWidth = compact ? Math.max(150, width - 100) : 210;
  const rowHeight = Math.max(210, ...node.nodes.map(item => 100 + Math.ceil(((item.detail?.length ?? 0) + item.label.length) / Math.max(16, (nodeWidth - 32) / 7)) * 21));
  const positions = useMemo(() => new Map(graphPositionsV2(node, compact, rowHeight).map(p => [p.id, p])), [node, compact, rowHeight]);
  const nodes = useMemo(() => node.nodes.map(item => ({
    id: item.id, position: positions.get(item.id)!,
    data: { label: <><strong>{item.label}</strong>{item.detail && <span>{item.detail}</span>}</> },
    sourcePosition: compact ? Position.Right : Position.Bottom, targetPosition: compact ? Position.Left : Position.Top,
    style: { width: nodeWidth, padding: 16, borderRadius: 12, background: 'var(--background, #fff)', color: 'var(--v2-ink)', border: '1px solid var(--v2-line)', fontSize: 14, lineHeight: 1.5, overflowWrap: 'anywhere' as const },
  })), [node, positions, compact, nodeWidth]);
  const edges = useMemo(() => node.edges.map((edge, index) => ({
    id: `${node.id}-edge-${index}`, source: edge.source, target: edge.target, label: edge.label,
    type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed, color: '#7890b3' },
    style: { stroke: '#7890b3', strokeWidth: 1.5 },
    labelStyle: { fill: 'var(--v2-ink)', fontSize: 12 },
    labelBgStyle: { fill: 'var(--background, #fff)' }, labelBgPadding: [8, 5] as [number, number],
  })), [node]);
  return <figure className={styles.architecture}>
    {node.title && <figcaption>{node.title}</figcaption>}
    {node.description && <p>{node.description}</p>}
    <div ref={container} className={styles.architectureCanvas} style={compact ? { height: node.nodes.length * rowHeight + 40 } : undefined} role="group" aria-label={node.title || 'Architecture diagram'}>
      <ReactFlow key={compact ? 'vertical' : 'wide'} nodes={nodes} edges={edges} fitView fitViewOptions={{ padding: .1, minZoom: compact ? .85 : .5, maxZoom: 1 }} minZoom={compact ? .85 : .5} maxZoom={1.5}
        nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} zoomOnScroll={false} panOnScroll={false}
        preventScrolling={false} ariaLabelConfig={{ 'controls.zoomIn.ariaLabel': 'Zoom diagram in', 'controls.zoomOut.ariaLabel': 'Zoom diagram out', 'controls.fitView.ariaLabel': 'Fit diagram' }}>
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
    <ul className={styles.visuallyHidden} aria-label="Diagram connections">{node.edges.map((edge, index) => <li key={index}>{node.nodes.find(n => n.id === edge.source)?.label} → {node.nodes.find(n => n.id === edge.target)?.label}{edge.label ? `: ${edge.label}` : ''}</li>)}</ul>
  </figure>;
}
