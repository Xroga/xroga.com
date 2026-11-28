'use client';

import { defineComponent } from '@openuidev/react-lang';
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, ReactFlowProvider, type BuiltInEdge, type Node, type NodeProps } from '@xyflow/react';
import React, { useContext, useId, useLayoutEffect, useRef, useState } from 'react';
import { z } from 'zod/v4';
import { Glyph } from './upstream/components/glyph';
import { DiagramResourceMark } from './Resources';
import { NativeSectionTitle } from './upstream/components/markdown';
import { DIAGRAM_NODE_TONES, hasRenderableDiagramTopology } from '../../../../backend/src/ai/nativeDiagramTopology';
import { nativeReadableTextKey } from '../../../../backend/src/ai/nativeOpenUi';

const diagramNode = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{0,31}$/),
  label: z.string().min(1).max(45),
  level: z.number().int().min(0).max(5),
  detail: z.string().max(66).optional(),
  tone: z.enum(DIAGRAM_NODE_TONES).optional(),
  icon: z.string().max(36).optional(),
});
const diagramLink = z.object({
  from: z.string().max(32),
  to: z.string().max(32),
  label: z.string().max(38).optional(),
});

const diagramProps = z.object({
  title: z.string().min(1).max(120),
  nodes: z.array(diagramNode).min(2).max(12),
  links: z.array(diagramLink).min(1).max(18),
  description: z.string().min(1).max(360),
});

type AnswerNode = Node<{ label: string; detail?: string; icon?: string }, 'answer'>;

function AnswerDiagramNode({ data }: NodeProps<AnswerNode>) {
  return <>
    <Handle type="target" position={Position.Top} />
    <Handle type="target" position={Position.Bottom} id="bottom" />
    <Handle type="target" position={Position.Left} id="left" />
    <Handle type="target" position={Position.Right} id="right" />
    <span className="native-diagram-node-title"><DiagramResourceMark label={data.label} fallback={data.icon && <Glyph name={data.icon} size={16} />} />{data.label}</span>
    {data.detail && <span className="native-diagram-node-detail">{data.detail}</span>}
    <Handle type="source" position={Position.Bottom} />
    <Handle type="source" position={Position.Top} id="top" />
    <Handle type="source" position={Position.Left} id="left" />
    <Handle type="source" position={Position.Right} id="right" />
  </>;
}

const nodeTypes = { answer: AnswerDiagramNode };

export function layoutDiagram(props: z.infer<typeof diagramProps>, compact: boolean) {
  if (!hasRenderableDiagramTopology(props.nodes, props.links)) return null;
  const byId = new Map(props.nodes.map(node => [node.id, node]));
  const levels = [...new Set(props.nodes.map(node => node.level))].sort((a, b) => a - b);
  const groups = levels.map(level => props.nodes.filter(node => node.level === level));

  const rows = compact ? groups.flatMap(group => group.length === 3 ? [group.slice(0, 2), group.slice(2)] : [group]) : groups;
  // Branching edges can share the same routing lane. Keep all connections and
  // move their labels into a readable key rather than painting overlapping text.
  const separateRelationships = compact || groups.some(group => group.length > 1) || props.links.length > rows.length - 1;
  const width = compact ? 138 : 190;
  const rowSpacing = compact ? 145 : 132;
  const nodes: AnswerNode[] = rows.flatMap((group, y) => group.map((node, x) => ({
    id: node.id,
    position: { x: (x - (group.length - 1) / 2) * (compact ? 156 : 234), y: y * rowSpacing },
    style: { width },
    type: 'answer',
    className: 'native-diagram-node native-diagram-node-' + (node.tone ?? 'neutral'),
    data: { label: node.label, detail: node.detail, icon: node.icon },
  })));
  const positions = new Map(nodes.map(node => [node.id, node.position]));
  const rowSides = rows.map(row => ({ left: row[0].id, right: row[row.length - 1].id }));
  const minX = Math.min(...nodes.map(node => node.position.x));
  const maxX = Math.max(...nodes.map(node => node.position.x));
  const edges = props.links.map((link, index) => {
    const from = positions.get(link.from)!;
    const to = positions.get(link.to)!;
    const lateral = from.y === to.y;
    const rightward = from.x < to.x;
    const upward = to.y < from.y;
    // A bypass can leave a row horizontally only at its outermost node.
    // Use an outside lane when both endpoints have a clear exit on that side.
    const sides = upward ? ['right', 'left'] as const : ['left', 'right'] as const;
    const lane = Math.abs(from.y - to.y) > rowSpacing ? sides.find(side =>
      rowSides[from.y / rowSpacing][side] === link.from && rowSides[to.y / rowSpacing][side] === link.to) : undefined;
    const offset = lane === 'left' ? Math.min(from.x, to.x) - minX + 18 : maxX - Math.max(from.x, to.x) + 18;
    return {
      id: 'edge-' + index,
      source: link.from,
      target: link.to,
      sourceHandle: lane ?? (lateral ? (rightward ? 'right' : 'left') : upward ? 'top' : null),
      targetHandle: lane ?? (lateral ? (rightward ? 'left' : 'right') : upward ? 'bottom' : null),
      ...(lane && { pathOptions: { offset } }),
      label: separateRelationships ? undefined : link.label,
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: 'var(--iui-muted)' },
    } satisfies BuiltInEdge;
  });
  return { nodes, edges, byId, rowCount: rows.length, outsideLanes: edges.some(edge => edge.pathOptions) };
}

/** Rows of blocks joined downwards: every link goes from one row to the next. Anything with a bypass, a
 * return path or a link inside a row needs routed edges and keeps the graph canvas. */
export function stackedDiagramRows(props: z.infer<typeof diagramProps>) {
  if (!hasRenderableDiagramTopology(props.nodes, props.links)) return null;
  const levels = [...new Set(props.nodes.map(node => node.level))].sort((a, b) => a - b);
  const row = new Map(props.nodes.map(node => [node.id, levels.indexOf(node.level)]));
  if (props.links.some(link => row.get(link.to)! - row.get(link.from)! !== 1)) return null;
  return levels.map((level, index) => ({
    nodes: props.nodes.filter(node => node.level === level),
    // What travels into this row. Repeated wording is shown once.
    incoming: [...new Set(props.links.filter(link => row.get(link.to) === index).flatMap(link => link.label ? [link.label] : []))],
  }));
}

export const Diagram = defineComponent({
  name: 'Diagram',
  props: diagramProps,
  description: 'Connected technical diagram with labeled relationships and a concise text equivalent. Group peers on the same level (up to three per level); use increasing levels for downstream components. Choose role-specific tones and meaningful links, not a duplicate list.',
  component: function DiagramView({ props }) {
    const title = useId();
    const sectionTitle = useContext(NativeSectionTitle);
    const diagramId = 'diagram-' + title.replace(/[^a-zA-Z0-9-]/g, '');
    const diagram = useRef<HTMLElement>(null);
    const [compact, setCompact] = useState<boolean>();
    const stack = stackedDiagramRows(props);
    const result = layoutDiagram(props, compact === true);
    // This read-only graph lets React Flow own its measured node state. Replacing
    // controlled nodes on an unrelated parent render discards those measurements.
    // Reinitialize only when the actual graph or responsive layout changes.
    const graphKey = JSON.stringify([compact, props.nodes, props.links]);
    const renderable = result !== null && !stack;
    const widestRow = Math.max(...props.nodes.map(node => props.nodes.filter(peer => peer.level === node.level).length)) * 234 * .95;
    useLayoutEffect(() => {
      const element = diagram.current;
      if (!renderable || !element) return;
      const measure = () => {
        const style = getComputedStyle(element);
        const availableWidth = element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        // Use the narrow layout before the wide one would have to shrink its text.
        setCompact(availableWidth < Math.max(460, widestRow));
      };
      measure();
      const resize = new ResizeObserver(measure);
      resize.observe(element);
      return () => resize.disconnect();
    }, [renderable, widestRow]);
    if (!result) return <p role="status">The diagram relationships could not be rendered. {props.description}</p>;
    const fitViewOptions = { padding: result.outsideLanes ? 0.2 : compact ? 0.08 : 0.14, maxZoom: 1.1 };
    const height = compact
      ? Math.min(900, Math.max(224, result.rowCount * 145 - 24))
      : Math.min(900, Math.max(216, result.rowCount * 150 + 40));
    // Under a heading the caption would say the same thing again, so it stays for assistive technology only.
    const underHeading = sectionTitle !== undefined;
    const relationships = <div className="native-diagram-relationships">
      <strong>Diagram relationships</strong>
      <ul>
        {props.links.map((link, index) => <li key={index}>
          {result.byId.get(link.from)?.label} → {result.byId.get(link.to)?.label}{link.label && ' · ' + link.label}
        </li>)}
      </ul>
    </div>;
    if (stack) return (
      <figure className="native-diagram native-diagram-stack" aria-labelledby={underHeading ? undefined : title}
        aria-label={underHeading ? props.title : undefined}>
        <figcaption>
          {!underHeading && <strong id={title}>{props.title}</strong>}
          <p className={underHeading ? 'native-diagram-spoken' : undefined}>{props.description}</p>
        </figcaption>
        <ol className="native-diagram-rows" aria-hidden="true">
          {stack.map((row, index) => <li key={index}>
            {index > 0 && <div className="native-diagram-arrow"><b>↓</b>
              {row.incoming.length > 0 && <span dir="auto">{row.incoming.join(' · ')}</span>}</div>}
            <div className="native-diagram-row" data-count={row.nodes.length}>
              {row.nodes.map(node => <div key={node.id} className={'native-diagram-block native-diagram-node-' + (node.tone ?? 'neutral')} dir="auto">
                <span className="native-diagram-node-title"><DiagramResourceMark label={node.label} fallback={node.icon && <Glyph name={node.icon} size={16} />} />{node.label}</span>
                {node.detail && <span className="native-diagram-node-detail">{node.detail}</span>}
              </div>)}
            </div>
          </li>)}
        </ol>
        {/* The same blocks and links as text, for screen readers and copying. */}
        {relationships}
      </figure>
    );
    return (
      <figure ref={diagram} className="native-diagram" aria-labelledby={underHeading ? undefined : title}
        aria-label={underHeading ? props.title : undefined}>
        <figcaption>
          {!underHeading && <strong id={title}>{props.title}</strong>}
          <p className={underHeading ? 'native-diagram-spoken' : undefined}>{props.description}</p>
        </figcaption>
        {compact !== undefined && <ReactFlowProvider key={graphKey}>
        <div className="native-diagram-canvas" style={{ height }}>
          <ReactFlow
            id={diagramId}
            nodeTypes={nodeTypes}
            defaultNodes={result.nodes}
            defaultEdges={result.edges}
            fitView
            fitViewOptions={fitViewOptions}
            minZoom={0.2}
            maxZoom={1.65}
            nodesDraggable={false}
            nodesConnectable={false}
            nodesFocusable={false}
            edgesFocusable={false}
            elementsSelectable={false}
            zoomOnScroll={false}
            preventScrolling={false}
            zoomOnDoubleClick={false}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={19} size={1} color="var(--iui-border-strong)" />
          </ReactFlow>
        </div>
        <div className="native-diagram-toolbar">
          <Controls showInteractive={false} orientation="horizontal" aria-label="Diagram zoom controls"
            fitViewOptions={result.outsideLanes ? fitViewOptions : undefined} />
        </div>
        </ReactFlowProvider>}
        {relationships}
      </figure>
    );
  },
});
