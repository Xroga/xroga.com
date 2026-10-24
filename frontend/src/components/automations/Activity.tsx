"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useTerminalChat,
  type ChatMessage,
} from "@/context/TerminalChatContext";
import { api, type SwarmRunSummary } from "@/lib/api";
import { statusGroup } from "./catalog";
import { evidenceLinks } from "./evidence";
import styles from "./automations.module.css";

export function Status({ status }: { status: string }) {
  return (
    <span className={styles.status} data-status={statusGroup(status)}>
      <i aria-hidden="true" />
      {status.replace(/_/g, " ")}
    </span>
  );
}
export function useRuns() {
  const [runs, setRuns] = useState<SwarmRunSummary[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const latest = useRef(0);
  const invalidateRequests = useCallback(() => { latest.current++; }, []);
  const refresh = useCallback(async () => {
    const requestId = ++latest.current;
    setLoading(true);
    try {
      const data = await api.swarm.history();
      if (requestId !== latest.current) return;
      setRuns(Array.isArray(data) ? data : []);
      setError("");
    } catch (e) {
      if (requestId !== latest.current) return;
      setError(
        e instanceof Error ? e.message : "Run history could not be loaded.",
      );
    } finally {
      if (requestId === latest.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 30000);
    return () => {
      invalidateRequests();
      clearInterval(timer);
    };
  }, [refresh, invalidateRequests]);
  return { runs, error, loading, refresh };
}
type RunState = ReturnType<typeof useRuns>;
export function Activity({
  data,
  live = false,
  initialId,
}: {
  data: RunState;
  live?: boolean;
  initialId?: string;
}) {
  const router = useRouter();
  const chat = useTerminalChat();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<SwarmRunSummary | null>(null);
  const [detailError, setDetailError] = useState("");
  const [busy, setBusy] = useState(false);
  const recordedMessages =
    selected && "messages" in selected && Array.isArray(selected.messages)
      ? selected.messages.filter((message): message is ChatMessage =>
          Boolean(
            message &&
              typeof message.id === "string" &&
              ["user", "assistant"].includes(message.role) &&
              typeof message.content === "string",
          ),
        )
      : [];
  const request = useRef(0);
  const load = useCallback(async (id: string) => {
    const sequence = ++request.current;
    setBusy(true);
    setDetailError("");
    try {
      const result = await api.swarm.getRun(id);
      if (sequence === request.current) setSelected(result);
    } catch (e) {
      if (sequence === request.current)
        setDetailError(
          e instanceof Error ? e.message : "Run details unavailable.",
        );
    } finally {
      if (sequence === request.current) setBusy(false);
    }
  }, []);
  useEffect(() => {
    if (initialId) void load(initialId);
    else {
      request.current++;
      setSelected(null);
      setBusy(false);
    }
  }, [initialId, load]);
  const rows = data.runs.filter(
    (r) =>
      (!live || !["completed", "failed"].includes(statusGroup(r.status))) &&
      (filter === "all" || statusGroup(r.status) === filter) &&
      `${r.prompt} ${r.id}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <div>
          <h2>{live ? "Work in motion." : "An honest record of work."}</h2>
          <p>
            Real Xroga runs. Status, timestamps and evidence come from the
            existing execution API.
          </p>
        </div>
        <button onClick={() => void data.refresh()} disabled={data.loading}>
          {data.loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      <div className={styles.toolbar}>
        <input
          aria-label="Search runs"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search outcomes or run IDs…"
        />
        <select
          aria-label="Run status"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          {[
            "all",
            "running",
            "queued",
            "paused",
            "approval-needed",
            "completed",
            "failed",
            "unknown",
          ].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      {data.error && (
        <p role="alert" className={styles.notice}>
          Could not verify current activity: {data.error}{" "}
          <button onClick={() => void data.refresh()}>Retry</button>
        </p>
      )}
      {!rows.length && !data.loading && (
        <div className={styles.empty}>
          {data.error
            ? "Activity is unavailable. No sample runs are presented as live."
            : "No matching runs. Start an outcome in the chatbar to create real work."}
        </div>
      )}
      <div className={styles.runList}>
        {rows.map((r) => (
          <button
            key={r.id}
            className={styles.run}
            onClick={() => {
              window.location.hash = `${live ? "activity" : "run-history"}/${encodeURIComponent(r.id)}`;
              setSelected(r);
            }}
          >
            <span>
              <strong>{r.prompt || "Untitled run"}</strong>
              <small>
                {new Date(r.created_at).toLocaleString()} · {r.id}
              </small>
            </span>
            <Status status={r.status} />
            <span>Inspect →</span>
          </button>
        ))}
      </div>
      {busy && <p role="status">Loading verified run details…</p>}
      {detailError && <p role="alert">{detailError}</p>}
      {selected && (
        <div className={styles.workbench} aria-label="Run details">
          <div className={styles.sectionHead}>
            <h3>{selected.prompt || selected.id}</h3>
            <button
              aria-label="Close run details"
              onClick={() => {
                request.current++;
                setSelected(null);
                setBusy(false);
                window.location.hash = live ? "activity" : "run-history";
              }}
            >
              ×
            </button>
          </div>
          <Status status={selected.status} />
          <div className={styles.toolbar}>
            <button
              disabled={!recordedMessages.length || busy}
              title="Restore recorded messages without starting a new execution"
              onClick={async () => {
                setBusy(true);
                try {
                  await chat.restoreTerminalSession({
                    sessionId: selected.id,
                    prompt: selected.prompt,
                    messages: recordedMessages,
                    selectedId: selected.id,
                    selectedLabel: selected.prompt,
                    source: "automation",
                  });
                  router.push("/workspace");
                } catch (e) {
                  setDetailError(
                    e instanceof Error
                      ? e.message
                      : "Recorded conversation could not be restored.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              Open recorded conversation
            </button>
            <button onClick={() => void load(selected.id)}>
              Refresh details
            </button>
            <Link href="/dashboard/projects?tab=conversations">
              Find saved conversation ↗
            </Link>
            <button
              disabled={
                busy ||
                !["running", "queued"].includes(statusGroup(selected.status))
              }
              onClick={async () => {
                if (
                  !window.confirm(
                    "Cancel this active run? Already completed actions cannot be undone.",
                  )
                )
                  return;
                setBusy(true);
                try {
                  await api.swarm.cancelRun(selected.id);
                  await load(selected.id);
                  await data.refresh();
                } catch (e) {
                  setDetailError(
                    e instanceof Error ? e.message : "Cancellation failed",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              Cancel run
            </button>
          </div>
          <div className={styles.two}>
            <div className={styles.panel}>
              <h3>Execution timeline</h3>
              {selected.events?.length ? (
                <ol className={styles.timeline}>
                  {selected.events.map((event) => (
                    <li key={event.sequence}>
                      <small>
                        #{event.sequence} ·{" "}
                        {new Date(event.createdAt).toLocaleTimeString()}
                      </small>
                      <p>
                        {String(
                          event.data.message ||
                            event.data.label ||
                            event.data.phase ||
                            event.type,
                        )}
                      </p>
                      <details>
                        <summary>Inputs / outputs / action record</summary>
                        <pre>{JSON.stringify(event.data, null, 2)}</pre>
                      </details>
                    </li>
                  ))}
                </ol>
              ) : (
                <p>No step evidence was returned for this run.</p>
              )}
            </div>
            <div className={styles.panel}>
              <h3>Outputs & artifacts</h3>
              {evidenceLinks(selected.output).map((url) => (
                <p key={url}>
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    {url} ↗
                  </a>
                </p>
              ))}
              <pre>
                {selected.output
                  ? JSON.stringify(selected.output, null, 2)
                  : "No verified outputs returned."}
              </pre>
              <h4>Usage</h4>
              <pre>
                {selected.tokenUsage
                  ? JSON.stringify(selected.tokenUsage, null, 2)
                  : "Usage unavailable for this run."}
              </pre>
              <h4>Approval decisions</h4>
              <p>
                Only recorded decisions in the execution timeline are evidence
                of approval. Use the originating workspace to review pending
                actions.
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
export function ActivityStrip({ data }: { data: RunState }) {
  return (
    <section className={styles.activityStrip}>
      <div className={styles.sectionHead}>
        <h3>Workspace activity</h3>
        <Link href="#activity">View all →</Link>
      </div>
      <div className={styles.stats}>
        {["running", "queued", "paused", "approval-needed", "completed"].map(
          (s) => (
            <Link
              key={s}
              href={s === "completed" ? "#run-history" : "#activity"}
            >
              <strong>
                {data.error
                  ? "—"
                  : data.runs.filter((r) => statusGroup(r.status) === s).length}
              </strong>
              <small>{s.replace("-", " ")}</small>
            </Link>
          ),
        )}
      </div>
      {data.error ? (
        <p>
          Live activity unavailable.{" "}
          <button onClick={() => void data.refresh()}>Retry</button>
        </p>
      ) : (
        data.runs.slice(0, 3).map((r) => (
          <Link
            key={r.id}
            href={`#run-history/${encodeURIComponent(r.id)}`}
            className={styles.row}
          >
            <span>{r.prompt.slice(0, 100)}</span>
            <Status status={r.status} />
          </Link>
        ))
      )}
    </section>
  );
}
