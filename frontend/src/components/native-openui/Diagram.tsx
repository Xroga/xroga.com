'use client';

import { defineComponent } from '@openuidev/react-lang';
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, ReactFlowProvider, type Edge, type Node, type NodeProps } from '@xyflow/react';
import { useEffect, useId, useRef, useState } from 'react';
import { z } from 'zod/v4';
import { Glyph } from './upstream/components/glyph';

const diagramNode = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{0,31}$/),
  label: z.string().min(1).max(45),
  level: z.number().int().min(0).max(5),
  detail: z.string().max(66).optional(),
  tone: z.enum(['neutral', 'info', 'success', 'purple', 'warning']).optional(),
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
    <span className="native-diagram-node-title">{data.icon && <Glyph name={data.icon} size={16} />}{data.label}</span>
    {data.detail && <span className="native-diagram-node-detail">{data.detail}</span>}
    <Handle type="source" position={Position.Bottom} />
    <Handle type="source" position={Position.Top} id="top" />
    <Handle type="source" position={Position.Left} id="left" />
    <Handle type="source" position={Position.Right} id="right" />
  </>;
}

const nodeTypes = { answer: AnswerDiagramNode };

function layout(props: z.infer<typeof diagramProps>, compact: boolean) {
  const byId = new Map(props.nodes.map(node => [node.id, node]));
  if (byId.size !== props.nodes.length || props.links.some(link => link.from === link.to || !byId.has(link.from) || !byId.has(link.to))) return null;
  const levels = [...new Set(props.nodes.map(node => node.level))].sort((a, b) => a - b);
  const groups = levels.map(level => props.nodes.filter(node => node.level === level));
  if (groups.some(group => group.length > 3)) return null;

  const rows = compact ? groups.flatMap(group => group.length === 3 ? [group.slice(0, 2), group.slice(2)] : [group]) : groups;
  const width = compact ? 138 : 190;
  const nodes: AnswerNode[] = rows.flatMap((group, y) => group.map((node, x) => ({
    id: node.id,
    position: { x: (x - (group.length - 1) / 2) * (compact ? 156 : 234), y: y * (compact ? 145 : 132) },
    style: { width },
    type: 'answer',
    className: 'native-diagram-node native-diagram-node-' + (node.tone ?? 'neutral'),
    data: { label: node.label, detail: node.detail, icon: node.icon },
  })));
  const positions = new Map(nodes.map(node => [node.id, node.position]));
  const edges: Edge[] = props.links.map((link, index) => {
    const from = positions.get(link.from)!;
    const to = positions.get(link.to)!;
    const lateral = from.y === to.y;
    const rightward = from.x < to.x;
    const upward = to.y < from.y;
    return {
      id: 'edge-' + index,
      source: link.from,
      target: link.to,
      sourceHandle: lateral ? (rightward ? 'right' : 'left') : upward ? 'top' : null,
      targetHandle: lateral ? (rightward ? 'left' : 'right') : upward ? 'bottom' : null,
      label: link.label,
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: 'var(--iui-muted)' },
    };
  });
  return { nodes, edges, byId, rowCount: rows.length };
}

export const Diagram = defineComponent({
  name: 'Diagram',
  props: diagramProps,
  description: 'Connected technical diagram with labeled relationships and a concise text equivalent. Group peers on the same level (up to three per level); use increasing levels for downstream components. Choose role-specific tones and meaningful links, not a duplicate list.',
  component: function DiagramView({ props }) {
    const title = useId();
    const canvas = useRef<HTMLDivElement>(null);
    const [compact, setCompact] = useState(false);
    useEffect(() => {
      const element = canvas.current;
      if (!element) return;
      const measure = () => setCompact(element.clientWidth < 460);
      measure();
      const resize = new ResizeObserver(measure);
      resize.observe(element);
      return () => resize.disconnect();
    }, [compact]);
    const result = layout(props, compact);
    if (!result) return <p role="status">The diagram relationships could not be rendered. {props.description}</p>;
    return (
      <figure className="native-diagram" aria-labelledby={title}>
        <figcaption>
          <strong id={title}>{props.title}</strong>
          <p>{props.description}</p>
        </figcaption>
        <ReactFlowProvider key={compact ? 'compact' : 'wide'}>
        <div ref={canvas} className="native-diagram-canvas"
          style={{ height: compact ? Math.min(900, Math.max(260, result.rowCount * 145 + 24)) : Math.min(540, Math.max(260, result.rowCount * 96 + 44)) }}>
          <ReactFlow
            nodeTypes={nodeTypes}
            nodes={result.nodes}
            edges={result.edges}
            fitView
            fitViewOptions={{ padding: compact ? 0.08 : 0.14, maxZoom: 1.1 }}
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
          <Controls showInteractive={false} orientation="horizontal" aria-label="Diagram zoom controls" />
        </div>
        </ReactFlowProvider>
        <details>
          <summary>Diagram relationships</summary>
          <ul>
            {props.links.map((link, index) => <li key={index}>
              {result.byId.get(link.from)?.label} → {result.byId.get(link.to)?.label}{link.label && ' · ' + link.label}
            </li>)}
          </ul>
        </details>
      </figure>
    );
  },
});
