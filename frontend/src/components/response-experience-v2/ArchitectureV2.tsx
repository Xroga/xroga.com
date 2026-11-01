'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ReactFlow, MarkerType, Position, BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { ResponseNodeV2 } from './document';
import { graphCanvasV2 } from './graphLayout';
import { leadingEntityV2 } from './entityRegistry';
import { SourceMarkV2 } from './SourceV2';
import styles from './response-v2.module.css';

function LabeledConnectionV2(props: EdgeProps) {
  const lane = props.data?.lane;
  const middle = (props.sourceY + props.targetY) / 2;
  const [direct, labelX, labelY] = getSmoothStepPath({ ...props, centerY: middle });
  // Skip-level and return connections travel outside all node columns. A direct
  // center path would run through intervening nodes and hide its meaning.
  const path = typeof lane === 'number'
    ? `M ${props.sourceX} ${props.sourceY} V ${props.sourceY + 24} H ${lane} V ${props.targetY - 24} H ${props.targetX} V ${props.targetY}`
    : direct;
  const x = typeof lane === 'number' ? lane : labelX;
  const y = typeof lane === 'number' ? middle : labelY;
  return <><BaseEdge path={path} markerEnd={props.markerEnd} style={props.style} />
    {props.label && <EdgeLabelRenderer><div aria-hidden="true" className={styles.graphEdgeLabel} style={{ transform: `translate(-50%, -50%) translate(${x}px,${y}px)` }}>{props.label}</div></EdgeLabelRenderer>}</>;
}
const edgeTypes = { responseConnection: LabeledConnectionV2 };

/** Data-only graph. No executable actions, remote layout or model calls. */
export default function ArchitectureV2({ node }: { node: Extract<ResponseNodeV2, { kind: 'graph' }> }) {
  const [compact, setCompact] = useState(false);
  const [containerWidth, setContainerWidth] = useState(880);
  const fullWidth = useMemo(() => graphCanvasV2(node).width, [node]);
  const layout = useMemo(() => graphCanvasV2(node, compact, containerWidth), [node, compact, containerWidth]);
  const canvas = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const resize = new ResizeObserver(entries => {
      const width = entries[0].contentRect.width;
      if (width > 0) { setContainerWidth(width); setCompact(width < fullWidth); }
    });
    resize.observe(element);
    return () => resize.disconnect();
  }, [fullWidth]);
  useEffect(() => {
    // Start on the first reading-level node instead of a blank routing lane.
    // Preserve user scrolling until the diagram itself changes.
    const first = layout.positions[0];
    if (canvas.current && first) canvas.current.scrollLeft = compact ? 0 : Math.max(0, first.x + layout.nodeWidth / 2 - canvas.current.clientWidth / 2);
  }, [layout, compact]);
  const positions = useMemo(() => new Map(layout.positions.map(p => [p.id, p])), [layout]);
  const nodes = useMemo(() => node.nodes.map(item => ({
    id: item.id, position: positions.get(item.id)!,
    data: { label: <><strong>{leadingEntityV2(item.label) && <SourceMarkV2 url={leadingEntityV2(item.label)!.url} />}{item.label}</strong>{item.detail && <span>{item.detail}</span>}</> },
    sourcePosition: Position.Bottom, targetPosition: Position.Top,
    style: { width: layout.nodeWidth, minHeight: layout.nodeHeight, padding: 16, borderRadius: 12, background: 'var(--background, #fff)', color: 'var(--v2-ink)', border: '1px solid var(--v2-line)', fontSize: 14, lineHeight: 1.5, overflowWrap: 'anywhere' as const },
  })), [node, positions, layout]);
  const edges = useMemo(() => node.edges.map((edge, index) => ({
    id: `${node.id}-edge-${index}`, source: edge.source, target: edge.target, label: String(index + 1),
    type: 'responseConnection', data: { lane: layout.edgeLanes[index] }, markerEnd: { type: MarkerType.ArrowClosed, color: '#7890b3' },
    style: { stroke: '#7890b3', strokeWidth: 1.5 },
    labelStyle: { fill: 'var(--v2-ink)', fontSize: 12 },
    labelBgStyle: { fill: 'var(--background, #fff)' }, labelBgPadding: [8, 5] as [number, number],
  })), [node, layout]);
  return <figure className={styles.architecture}>
    {node.title && <figcaption>{node.title}</figcaption>}
    {node.description && <p>{node.description}</p>}
    <div ref={canvas} className={styles.architectureCanvas} role="region" tabIndex={0} aria-label={`${node.title || 'Architecture diagram'}. ${compact ? 'Vertical layout.' : 'Connected layout.'} All numbered connections are listed below.`}>
      <div style={{ width: layout.width, height: layout.height, marginInline: 'auto' }}>
        <ReactFlow nodes={nodes} edges={edges} edgeTypes={edgeTypes} defaultViewport={{ x: 0, y: 0, zoom: 1 }} minZoom={1} maxZoom={1}
          nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} zoomOnScroll={false} zoomOnPinch={false} zoomOnDoubleClick={false} panOnDrag={false} panOnScroll={false}
          preventScrolling={false} />
      </div>
    </div>
    <ol className={styles.diagramConnections} aria-label="Diagram connections">{node.edges.map((edge, index) => <li key={index}>{node.nodes.find(n => n.id === edge.source)?.label} → {node.nodes.find(n => n.id === edge.target)?.label}{edge.label ? `: ${edge.label}` : ''}</li>)}</ol>
  </figure>;
}
