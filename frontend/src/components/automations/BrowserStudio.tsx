"use client";
import { useState } from "react";
import Link from "next/link";
import type { SwarmRunSummary } from "@/lib/api";
import { Status } from "./Activity";
import styles from "./automations.module.css";
const templates = [
  [
    "Research Websites",
    "Collect cited evidence and compare information from authorized public websites.",
  ],
  [
    "Test an Application",
    "Test user journeys, forms and interactions on my authorized application.",
  ],
  [
    "Repeat Browser Tasks",
    "Review a routine browser task and carry out only permitted actions.",
  ],
  [
    "Review Web Journeys",
    "Inspect navigation, accessibility and user journeys, with reproduction steps.",
  ],
];
const steps = [
  "Open an authorized URL",
  "Inspect visible content",
  "Exercise the permitted interaction",
  "Capture evidence",
  "Verify the outcome",
];
export function BrowserStudio({
  runs,
  onSelect,
}: {
  runs: SwarmRunSummary[];
  onSelect: (text: string, label: string) => void;
}) {
  const [task, setTask] = useState(templates[0]);
  const [url, setUrl] = useState("");
  const [step, setStep] = useState(0);
  const [panel, setPanel] = useState(true);
  const [error, setError] = useState("");
  function prepare() {
    try {
      const parsed = new URL(url);
      if (!["https:", "http:"].includes(parsed.protocol)) throw new Error();
      setError("");
      onSelect(
        `${task[1]}\nTarget: ${parsed.href}\nCollect screenshots, action records and verification evidence where supported. Ask before login, sending data, purchases or destructive actions.`,
        task[0],
      );
    } catch {
      setError("Enter a valid HTTP or HTTPS website URL.");
    }
  }
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <div>
          <h2>Across the web. With evidence.</h2>
          <p>
            Prepare a browser assignment, inspect the proposed journey, then
            continue in the real workspace.
          </p>
        </div>
        <span className={styles.badge}>Session viewer preview</span>
      </div>
      <div className={styles.grid}>
        {templates.map((t) => (
          <button
            key={t[0]}
            className={styles.card}
            aria-pressed={task[0] === t[0]}
            onClick={() => setTask(t)}
          >
            <h3>{t[0]}</h3>
            <p>{t[1]}</p>
          </button>
        ))}
      </div>
      <form
        className={styles.toolbar}
        onSubmit={(e) => {
          e.preventDefault();
          prepare();
        }}
      >
        <label>
          Authorized website
          <input
            required
            type="url"
            placeholder="https://your-website.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>
        <button className={styles.primary}>Add browser task to chatbar</button>
      </form>
      {error && <p role="alert">{error}</p>}
      <div className={styles.browserGrid} data-evidence={panel}>
        <aside className={styles.panel}>
          <h3>Task / status</h3>
          <p>{task[0]}</p>
          <span className={styles.badge}>
            Illustrative · no session started
          </span>
          <p>
            Streaming, recording and takeover controls need a real authorized
            session.
          </p>
          <button disabled>Take over — unavailable</button>
          <button disabled>Pause session — unavailable</button>
        </aside>
        <div className={styles.browserViewport}>
          <header>
            <span>○ ○ ○</span>
            <span>{url || "https://example.com"}</span>
            <button onClick={() => setPanel(!panel)} aria-expanded={panel}>
              Evidence
            </button>
          </header>
          <div>
            <div className={styles.browserGlyph}>◎</div>
            <span className={styles.eyebrow}>Interactive trace preview</span>
            <h3>{steps[step]}</h3>
            <p>This is an illustration, not a live browser or screenshot.</p>
            <div className={styles.toolbar}>
              <button disabled={!step} onClick={() => setStep((s) => s - 1)}>
                Previous step
              </button>
              <button
                disabled={step === steps.length - 1}
                onClick={() => setStep((s) => s + 1)}
              >
                Next step
              </button>
            </div>
          </div>
        </div>
        {panel && (
          <aside className={styles.panel}>
            <h3>Action timeline</h3>
            {steps.map((s, i) => (
              <button
                className={styles.row}
                key={s}
                aria-current={step === i ? "step" : undefined}
                onClick={() => setStep(i)}
              >
                {i + 1}. {s}
              </button>
            ))}
            <details>
              <summary>Evidence expectations</summary>
              <p>
                Timestamp, authorized target, observed state, action, screenshot
                when available, and final verification. No evidence has been
                collected in this preview.
              </p>
            </details>
          </aside>
        )}
      </div>
      <h3>Recorded browser-related runs</h3>
      {runs
        .filter((r) => /browser|scrape|crawl|web research/i.test(r.prompt))
        .map((r) => (
          <Link
            className={styles.row}
            key={r.id}
            href={`#run-history/${encodeURIComponent(r.id)}`}
          >
            <span>{r.prompt.slice(0, 100)}</span>
            <Status status={r.status} />
          </Link>
        ))}
      <Link href="#run-history">Inspect all recorded evidence →</Link>
    </section>
  );
}
