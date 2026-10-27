"use client";
import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { xrogaConnect, type XrogaConnectTool } from "@/lib/xrogaConnect";
import { combinations, packs, packPrompt } from "./catalog";
import styles from "./automations.module.css";
const Integrations = dynamic(
  () =>
    import("@/components/integrations/IntegrationsPanel").then(
      (m) => m.IntegrationsPanel,
    ),
  { loading: () => <p role="status">Loading app connections…</p> },
);
const Mcp = dynamic(
  () =>
    import("@/components/integrations/CustomMcpManager").then(
      (m) => m.CustomMcpManager,
    ),
  { loading: () => <p role="status">Loading MCP servers…</p> },
);
export function Connections({
  onSelect,
}: {
  onSelect: (text: string, label: string) => void;
}) {
  const [view, setView] = useState("Apps");
  const [query, setQuery] = useState("");
  const [tools, setTools] = useState<XrogaConnectTool[]>([]);
  const [detail, setDetail] = useState<unknown>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function search() {
    setBusy(true);
    setError("");
    try {
      setTools((await xrogaConnect.search(query)).tools);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tool discovery failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <div>
          <h2>Your tools, working together.</h2>
          <p>
            Managed app discovery and connections use Xroga’s existing
            Composio-backed plugin runtime.
          </p>
        </div>
        <span className={styles.badge}>Existing integration APIs</span>
      </div>
      <div className={styles.toolbar}>
        {["Apps", "Custom MCP", "Combinations", "Tool Explorer"].map((s) => (
          <button key={s} aria-pressed={view === s} onClick={() => setView(s)}>
            {s}
          </button>
        ))}
      </div>
      {view === "Apps" && <Integrations />}
      {view === "Custom MCP" && (
        <>
          <p className={styles.notice}>
            Remote HTTPS MCP servers only. Local STDIO requires a compatible
            local bridge; this cloud interface does not provide one. Review the
            server source and permissions before connecting.
          </p>
          <Mcp />
        </>
      )}
      {view === "Combinations" && (
        <div className={styles.grid}>
          {combinations.map((c) => (
            <article className={styles.card} key={c.name}>
              <span className={styles.eyebrow}>
                Outcome setup · not a connected group
              </span>
              <h3>{c.name}</h3>
              <p>{c.apps.join(" → ")}</p>
              {c.apps.map((app) => (
                <Link key={app} href={`/dashboard/integrations/${app}`}>
                  {app} ↗
                </Link>
              ))}
              <button
                onClick={() => {
                  const p = packs.find((p) => p.id === c.pack)!;
                  onSelect(packPrompt(p, {}), c.name);
                }}
              >
                Use combination in chatbar
              </button>
              <Link href={`#work-packs/${c.pack}`}>Guided setup →</Link>
            </article>
          ))}
        </div>
      )}
      {view === "Tool Explorer" && (
        <>
          <form
            className={styles.toolbar}
            onSubmit={(e) => {
              e.preventDefault();
              void search();
            }}
          >
            <input
              required
              aria-label="Search tool capabilities"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find actions by outcome…"
            />
            <button disabled={busy}>
              {busy ? "Searching…" : "Search tools"}
            </button>
          </form>
          {error && <p role="alert">{error}</p>}
          <p>
            Catalog presence is not authorization. This inspector does not
            execute tool calls.
          </p>
          <div className={styles.two}>
            <div>
              {tools.map((tool) => (
                <button
                  className={styles.run}
                  key={tool.slug}
                  onClick={async () => {
                    setError("");
                    try {
                      setDetail(
                        (await xrogaConnect.toolDetails(tool.slug)).tool,
                      );
                    } catch (e) {
                      setError(
                        e instanceof Error
                          ? e.message
                          : "Tool details unavailable",
                      );
                    }
                  }}
                >
                  <span>
                    <strong>{tool.name || tool.slug}</strong>
                    <small>{tool.description}</small>
                  </span>
                  <span className={styles.badge}>
                    {tool.risk || "Unverified"}
                  </span>
                </button>
              ))}
            </div>
            <div className={styles.panel}>
              <h3>Tool schema & permissions</h3>
              <pre>
                {detail
                  ? JSON.stringify(detail, null, 2)
                  : "Select a tool to inspect input/output schemas, scopes and confirmation requirements."}
              </pre>
              <button
                disabled
                title="This read-only inspector cannot execute tools"
              >
                Execute sample call — unavailable
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
