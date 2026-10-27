"use client";
import { useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useDrafts } from "./useDrafts";
import { packs } from "./catalog";
import styles from "./automations.module.css";

type Graph = { name: string; nodes: Node[]; edges: Edge[] };
const types = [
  "Trigger",
  "AI Employee",
  "Action",
  "Condition",
  "Verification",
  "Approval",
  "Result",
];
function template(steps: string[], name: string): Graph {
  return {
    name,
    nodes: steps.map((label, index) => ({
      id: String(index),
      position: { x: (index % 3) * 230, y: Math.floor(index / 3) * 140 },
      data: {
        label,
        instructions: "",
        kind:
          index === 0
            ? "Trigger"
            : index === steps.length - 1
              ? "Result"
              : /approv/i.test(label)
                ? "Approval"
                : "Action",
      },
    })),
    edges: steps.slice(1).map((_, i) => ({
      id: `e${i}`,
      source: String(i),
      target: String(i + 1),
      type: "smoothstep",
    })),
  };
}
const initial = template(
  [
    "Manual trigger",
    "Research specialist",
    "Draft article",
    "Verify claims",
    "Human approval",
    "Deliver result",
  ],
  "Content research workflow",
);
function valid(value: unknown): value is Graph {
  if (!value || typeof value !== "object") return false;
  const g = value as Graph;
  return (
    typeof g.name === "string" &&
    Array.isArray(g.nodes) &&
    g.nodes.length < 200 &&
    g.nodes.every(
      (n) =>
        n &&
        typeof n.id === "string" &&
        typeof n.data?.label === "string" &&
        Number.isFinite(n.position?.x) &&
        Number.isFinite(n.position?.y),
    ) &&
    Array.isArray(g.edges) &&
    g.edges.every(
      (e) => e && typeof e.source === "string" && typeof e.target === "string",
    )
  );
}
export default function WorkflowEditor({
  onSelect,
}: {
  onSelect: (text: string, label: string) => void;
}) {
  const drafts = useDrafts("workflow", initial, valid);
  const [editing, setEditing] = useState<Graph | null>(null);
  const graph = editing || drafts.value;
  const [selected, setSelected] = useState("");
  const [past, setPast] = useState<Graph[]>([]);
  const [future, setFuture] = useState<Graph[]>([]);
  const [notice, setNotice] = useState("");
  const node = graph.nodes.find((n) => n.id === selected);
  function change(next: Graph) {
    setPast((p) => [...p.slice(-39), graph]);
    setFuture([]);
    setEditing(next);
    setNotice("Unsaved changes");
  }
  function add(kind: string) {
    change({
      ...graph,
      nodes: [
        ...graph.nodes,
        {
          id: crypto.randomUUID(),
          position: { x: 50, y: graph.nodes.length * 75 },
          data: { label: kind, kind, instructions: "" },
        },
      ],
    });
  }
  function connectTo(target: string) {
    if (target)
      change({
        ...graph,
        edges: addEdge(
          { source: selected, target, sourceHandle: null, targetHandle: null },
          graph.edges,
        ),
      });
  }
  function validateGraph() {
    if (!graph.nodes.length) return "Add at least one node.";
    if (!graph.nodes.some((n) => n.data.kind === "Trigger"))
      return "Add a trigger.";
    if (!graph.nodes.some((n) => n.data.kind === "Result"))
      return "Add a result.";
    if (graph.nodes.some((n) => !String(n.data.label).trim()))
      return "Every node needs a name.";
    if (
      graph.nodes.length > 1 &&
      graph.nodes.some(
        (n) => !graph.edges.some((e) => e.source === n.id || e.target === n.id),
      )
    )
      return "Connect all isolated nodes.";
    return "Draft structure checked. Runtime validation and execution remain backend-dependent.";
  }
  if (!drafts.ready) return <p role="status">Loading your workflow draft…</p>;
  return (
    <section className={styles.section} aria-label="Workflow editor">
      <div className={styles.sectionHead}>
        <div>
          <h2>Design the work.</h2>
          <p>
            Drag nodes, connect handles, or use the accessible step editor.
            Local draft · not deployed.
          </p>
        </div>
        <span className={styles.badge}>Frontend preview</span>
      </div>
      <div className={styles.toolbar}>
        <label>
          Workflow name
          <input
            value={graph.name}
            onChange={(e) => change({ ...graph, name: e.target.value })}
          />
        </label>
        <label>
          Template
          <select
            aria-label="Workflow template"
            defaultValue=""
            onChange={(e) => {
              const p = packs.find((p) => p.id === e.target.value);
              if (p) change(template(p.steps, p.name));
            }}
          >
            <option value="" disabled>
              Choose an outcome
            </option>
            {packs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={!past.length}
          onClick={() => {
            setFuture((f) => [graph, ...f]);
            setEditing(past[past.length - 1]);
            setPast((p) => p.slice(0, -1));
          }}
        >
          Undo
        </button>
        <button
          disabled={!future.length}
          onClick={() => {
            setPast((p) => [...p, graph]);
            setEditing(future[0]);
            setFuture((f) => f.slice(1));
          }}
        >
          Redo
        </button>
        <button
          disabled={!drafts.ready}
          onClick={() => {
            if (drafts.save(graph))
              setNotice(
                "Draft saved on this browser. No automation was activated.",
              );
          }}
        >
          Save draft
        </button>
        <button onClick={() => setNotice(validateGraph())}>Validate</button>
      </div>
      <div className={styles.palette}>
        {types.map((kind) => (
          <button
            key={kind}
            draggable
            onDragStart={(e) =>
              e.dataTransfer.setData("application/xroga-node", kind)
            }
            onClick={() => add(kind)}
          >
            + {kind}
          </button>
        ))}
      </div>
      <div className={styles.editorGrid}>
        <div
          className={styles.canvas}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const kind = e.dataTransfer.getData("application/xroga-node");
            if (types.includes(kind)) add(kind);
          }}
        >
          <ReactFlow
            nodes={graph.nodes}
            edges={graph.edges}
            onNodesChange={(changes) =>
              setEditing((g) => ({
                ...(g || graph),
                nodes: applyNodeChanges(changes, (g || graph).nodes),
              }))
            }
            onEdgesChange={(changes) =>
              change({
                ...graph,
                edges: applyEdgeChanges(changes, graph.edges),
              })
            }
            onConnect={(connection) =>
              change({ ...graph, edges: addEdge(connection, graph.edges) })
            }
            onNodeClick={(_, n) => setSelected(n.id)}
            onNodeDragStart={() => {
              setPast((p) => [...p.slice(-39), graph]);
              setFuture([]);
            }}
            fitView
            colorMode="dark"
            deleteKeyCode={null}
            minZoom={0.15}
          >
            <Background color="#353535" gap={22} />
            <Controls />
            <MiniMap pannable zoomable nodeColor="#777" maskColor="#0008" />
          </ReactFlow>
        </div>
        <aside className={styles.panel}>
          <h3>Step configuration</h3>
          <label>
            Select a step
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">Select a node</option>
              {graph.nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {String(n.data.label)}
                </option>
              ))}
            </select>
          </label>
          {node ? (
            <>
              <label>
                Name
                <input
                  value={String(node.data.label)}
                  onChange={(e) =>
                    change({
                      ...graph,
                      nodes: graph.nodes.map((n) =>
                        n.id === selected
                          ? { ...n, data: { ...n.data, label: e.target.value } }
                          : n,
                      ),
                    })
                  }
                />
              </label>
              <label>
                Instructions / input mapping
                <textarea
                  value={String(node.data.instructions || "")}
                  placeholder="Use the previous step's verified output…"
                  onChange={(e) =>
                    change({
                      ...graph,
                      nodes: graph.nodes.map((n) =>
                        n.id === selected
                          ? {
                              ...n,
                              data: { ...n.data, instructions: e.target.value },
                            }
                          : n,
                      ),
                    })
                  }
                />
              </label>
              <label>
                Connect to
                <select value="" onChange={(e) => connectTo(e.target.value)}>
                  <option value="">Choose next step</option>
                  {graph.nodes
                    .filter((n) => n.id !== selected)
                    .map((n) => (
                      <option key={n.id} value={n.id}>
                        {String(n.data.label)}
                      </option>
                    ))}
                </select>
              </label>
              <button
                onClick={() => {
                  change({
                    ...graph,
                    nodes: graph.nodes.filter((n) => n.id !== selected),
                    edges: graph.edges.filter(
                      (e) => e.source !== selected && e.target !== selected,
                    ),
                  });
                  setSelected("");
                }}
              >
                Remove step
              </button>
            </>
          ) : (
            <p>
              Select a node to edit its inputs, conditions and instructions.
            </p>
          )}
          <details>
            <summary>Connections ({graph.edges.length})</summary>
            {graph.edges.map((e) => (
              <div key={e.id} className={styles.row}>
                <span>
                  {String(
                    graph.nodes.find((n) => n.id === e.source)?.data.label,
                  )}{" "}
                  →{" "}
                  {String(
                    graph.nodes.find((n) => n.id === e.target)?.data.label,
                  )}
                </span>
                <button
                  aria-label={`Remove connection ${e.id}`}
                  onClick={() =>
                    change({
                      ...graph,
                      edges: graph.edges.filter((x) => x.id !== e.id),
                    })
                  }
                >
                  ×
                </button>
              </div>
            ))}
          </details>
        </aside>
      </div>
      <p role="status">{drafts.error || notice}</p>
      <details className={styles.panel}>
        <summary>
          Read-only example journey · illustrative, not an execution
        </summary>
        <ol className={styles.timeline}>
          {graph.nodes.map((n) => (
            <li key={n.id}>
              <strong>{String(n.data.label)}</strong>
              <p>
                {String(
                  n.data.instructions ||
                    "Provide the required input, check authorized capabilities, then verify the result before continuing.",
                )}
              </p>
              <small>
                {n.data.kind === "Approval"
                  ? "Would pause for an explicit approval decision."
                  : "Example step only — no work has run."}
              </small>
            </li>
          ))}
        </ol>
        <p>
          Connection status is not inferred from a node.{" "}
          <a href="#apps-mcp">Review connected accounts and permissions →</a>
        </p>
      </details>
      <button
        className={styles.primary}
        onClick={() =>
          onSelect(
            `Review and carry out this proposed workflow where supported: ${graph.name}.\n${graph.nodes.map((n) => `[${n.id}] ${n.data.kind} — ${n.data.label}: ${n.data.instructions || ""}`).join("\n")}\nConnections: ${graph.edges.map((e) => `${e.source} → ${e.target}`).join(", ")}\nCheck capabilities first. Ask before publishing, paid, destructive or production actions.`,
            graph.name,
          )
        }
      >
        Use in chatbar
      </button>
      <button
        disabled
        title="No workflow deployment API is exposed by this frontend"
      >
        Deploy workflow — unavailable
      </button>
    </section>
  );
}
