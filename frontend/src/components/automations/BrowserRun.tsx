"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import styles from "./automations.module.css";

interface Postcondition { index: number; kind: string; passed: boolean; detail: string }
interface RunState {
  runId: string;
  status: string;
  attempts: number;
  running: boolean;
  blocker: string | null;
  output: { outcomeVerified?: boolean; postconditions?: Postcondition[]; artifacts?: Array<{ name: string; id: string; reused: boolean }>; summary?: string; failure?: { code: string; safeReasons: string[] } } | null;
  evidence: Array<{ id: string; kind: string; summary: string; identifier?: string }>;
}

const TERMINAL = new Set(["completed", "failed", "blocked", "cancelled"]);

/** Deterministic default: read the page title and capture a screenshot, verified by postconditions. Needs no model. */
function capturePlan() {
  return {
    steps: [{ op: "extractText", selector: "title", name: "pageTitle" }, { op: "screenshot", name: "page.png", fullPage: true }],
    expect: [{ kind: "artifact", name: "page.png", mediaType: "image/png" }, { kind: "noConsequentialAction" }],
  };
}

/** Runs a real browser task on Xroga's own browser worker and shows its live status, verified outcome and evidence. */
export function BrowserRun({ goal }: { goal: string }) {
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<"capture" | "plan">("capture");
  const [run, setRun] = useState<RunState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const poll = useCallback(async (runId: string) => {
    try {
      const state = await apiFetch<RunState>(`/api/browser/runs/${runId}`);
      setRun(state);
      if (state.running || !TERMINAL.has(state.status)) timer.current = setTimeout(() => poll(runId), 2000);
    } catch {
      timer.current = setTimeout(() => poll(runId), 4000);
    }
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function start() {
    setError("");
    let origin: string;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:") throw new Error();
      origin = parsed.origin;
    } catch {
      setError("Enter an HTTPS website address.");
      return;
    }
    setBusy(true);
    try {
      const body = { goal, startUrl: url, allowedOrigins: [origin], ...(mode === "capture" ? { plan: capturePlan() } : {}) };
      const { runId } = await apiFetch<{ runId: string }>("/api/browser/runs", { method: "POST", body: JSON.stringify(body) });
      setRun({ runId, status: "pending", attempts: 0, running: true, blocker: null, output: null, evidence: [] });
      poll(runId);
    } catch (e) {
      const code = e instanceof ApiError ? String((e.data as { code?: unknown } | undefined)?.code ?? "") : "";
      setError(code === "BROWSER_WORKER_NOT_CONFIGURED" ? "Browser automation is not enabled on this deployment yet."
        : e instanceof Error && e.message ? e.message : "The browser task could not be started.");
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!run) return;
    try { await apiFetch(`/api/browser/runs/${run.runId}`, { method: "DELETE" }); } catch { /* the next poll shows the real state */ }
  }

  const post = run?.output?.postconditions ?? [];
  return (
    <section className={styles.section} aria-labelledby="browser-run-title">
      <div className={styles.sectionHead}>
        <div>
          <h2 id="browser-run-title">Run it now</h2>
          <p>Xroga runs the task in an isolated browser, checks the result against the expected outcome, and keeps private evidence.</p>
        </div>
      </div>
      <form className={styles.toolbar} onSubmit={(e) => { e.preventDefault(); start(); }}>
        <label>
          Website
          <input required type="url" placeholder="https://your-website.com" value={url} onChange={(e) => setUrl(e.target.value)} />
        </label>
        <label>
          Mode
          <select value={mode} onChange={(e) => setMode(e.target.value as "capture" | "plan")}>
            <option value="capture">Capture page (no AI)</option>
            <option value="plan">Plan from the task description</option>
          </select>
        </label>
        <button className={styles.primary} disabled={busy || (!!run && run.running)}>{busy ? "Starting" : "Run browser task"}</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {run && (
        <div className={styles.panel} aria-live="polite">
          <h3>Status: {run.status}{run.running ? " (running)" : ""}</h3>
          {run.running && <button onClick={cancel}>Cancel</button>}
          {run.output?.outcomeVerified !== undefined && (
            <p>{run.output.outcomeVerified ? "Outcome verified." : "The expected outcome was not verified, so the task is not complete."}</p>
          )}
          {run.output?.failure && <p role="alert">{run.output.failure.safeReasons.join(" ")}</p>}
          {post.length > 0 && (
            <ul>{post.map((p) => <li key={p.index}>{p.passed ? "Passed" : "Failed"}: {p.kind} ({p.detail})</li>)}</ul>
          )}
          {(run.output?.artifacts ?? []).length > 0 && (
            <>
              <h4>Private evidence</h4>
              <ul>{run.output!.artifacts!.map((a) => <li key={a.id}>{a.name} <code>drive://{a.id}</code>{a.reused ? " (kept from an earlier attempt)" : ""}</li>)}</ul>
            </>
          )}
          {run.evidence.length > 0 && (
            <details>
              <summary>Execution record</summary>
              <ul>{run.evidence.map((e) => <li key={e.id}>{e.kind}: {e.summary}</li>)}</ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
