"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  ArrowUp,
  Workflow,
  Users,
  Globe2,
  Blocks,
  Package,
  CalendarDays,
  Search,
  X,
} from "lucide-react";
import { useTerminalChat } from "@/context/TerminalChatContext";
import { useWorkspaceIdentity } from "@/components/layout/WorkspaceIdentityContext";
import { sections, packs, type Section } from "./catalog";
import { Activity, ActivityStrip, useRuns } from "./Activity";
import { People, WorkPacks } from "./PeopleAndPacks";
import { Schedules } from "./Schedules";
import { ConnectedAppAutomations } from "./ConnectedAppAutomations";
import { BrowserStudio } from "./BrowserStudio";
import { Connections } from "./Connections";
import { DraftSummary } from "./DraftSummary";
import styles from "./automations.module.css";
const WorkflowEditor = dynamic(() => import("./WorkflowEditor"), {
  ssr: false,
  loading: () => <p role="status">Loading workflow canvas…</p>,
});
const cards = [
  {
    id: "workflows",
    label: "Workflows",
    text: "From an idea to a clear, connected plan.",
    icon: Workflow,
    prompt: "Help me design a workflow for ",
  },
  {
    id: "ai-employees",
    label: "AI Employees",
    text: "Give the right specialist a meaningful responsibility.",
    icon: Users,
    prompt: "Help me assign an AI specialist to ",
  },
  {
    id: "browser-automation",
    label: "Browser Automation",
    text: "Research, interact and verify across the web.",
    icon: Globe2,
    prompt: "Use browser automation to ",
  },
  {
    id: "apps-mcp",
    label: "Apps & MCP",
    text: "Your authorized tools. One connected workspace.",
    icon: Blocks,
    prompt: "Use my authorized apps to ",
  },
  {
    id: "work-packs",
    label: "Work Packs",
    text: "Complete solutions assembled around your outcome.",
    icon: Package,
    prompt: "Help me choose and configure a work pack to ",
  },
  {
    id: "scheduled-tasks",
    label: "Scheduled Tasks",
    text: "Plan what happens next, and when.",
    icon: CalendarDays,
    prompt: "Help me plan a recurring task to ",
  },
] as const;
function readHash(): { section: Section; detail?: string } {
  let value = window.location.hash.slice(1);
  try {
    value = decodeURIComponent(value);
  } catch {
    /* Treat malformed fragments as unknown. */
  }
  const [raw, detail] = value.split("/");
  const section =
    raw === "live-activity"
      ? "activity"
      : raw === "apps" || raw === "connections"
        ? "apps-mcp"
        : raw;
  return {
    section: sections.some(([id]) => id === section)
      ? (section as Section)
      : "overview",
    detail,
  };
}
export function AutomationsWorkspace() {
  const identity = useWorkspaceIdentity();
  return <Workspace key={identity.userId || "guest"} />;
}
function Workspace() {
  const router = useRouter();
  const chat = useTerminalChat();
  const data = useRuns();
  const [route, setRoute] = useState<{ section: Section; detail?: string }>({
    section: "overview",
  });
  const [draft, setDraft] = useState("");
  const [selection, setSelection] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const launcher = useRef<HTMLTextAreaElement>(null);
  const launching = useRef(false);
  useEffect(() => {
    const sync = () => setRoute(readHash());
    sync();
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);
  function select(text: string, label: string) {
    setDraft(text);
    setSelection(label);
    setError("");
    requestAnimationFrame(() => {
      launcher.current?.focus();
      launcher.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }
  function navigate(section: Section) {
    window.location.hash = section;
  }
  function launch() {
    if (!draft.trim() || launching.current) {
      launcher.current?.focus();
      return;
    }
    launching.current = true;
    // Reuse the application provider: no alternate orchestrator, fake run or hidden auto-submit effect.
    const text = draft.trim();
    chat.setPrompt(text);
    router.push("/workspace");
    void chat
      .submit(text)
      .catch((e) =>
        setError(
          e instanceof Error
            ? e.message
            : "Could not start work. Your draft is retained.",
        ),
      )
      .finally(() => {
        launching.current = false;
      });
  }
  return (
    <main className={styles.root} data-testid="automations-workspace">
      <header className={styles.topline}>
        <span>XROGA / AUTOMATIONS</span>
        <a href="#activity">Activity & evidence ↗</a>
      </header>
      <div className={styles.hero}>
        <span className={styles.eyebrow}>Automations & AI Workforce</span>
        <h1>Super Intelligence</h1>
        <p>
          One AI workspace for every kind of <em>automation.</em>
        </p>
      </div>
      <form
        className={styles.launcher}
        onSubmit={(e) => {
          e.preventDefault();
          launch();
        }}
      >
        {selection && (
          <div className={styles.selection}>
            <strong>{selection}</strong>
            <button
              type="button"
              aria-label="Clear selected capability"
              onClick={() => setSelection("")}
            >
              <X size={13} />
            </button>
          </div>
        )}
        <textarea
          ref={launcher}
          aria-label="Automation outcome"
          placeholder="Describe what you’d like to automate…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              launch();
            }
          }}
          rows={draft.length > 200 ? 4 : 2}
        />
        <div className={styles.launchTools}>
          <div>
            <span className={styles.model}>Black Hole V∞ · Auto</span>
            <button type="button" onClick={() => navigate("apps-mcp")}>
              <Blocks size={14} /> Apps
            </button>
            <button type="button" onClick={() => navigate("work-packs")}>
              <Package size={14} /> Work Packs
            </button>
          </div>
          <button
            className={styles.send}
            aria-label="Start in workspace"
            disabled={!draft.trim()}
          >
            <ArrowUp size={22} />
          </button>
        </div>
      </form>
      <p className={styles.caption}>
        Describe the outcome. Xroga checks the tools, permissions and approvals
        in your workspace.
      </p>
      {error && <p role="alert">{error}</p>}
      <nav className={styles.tabs} aria-label="Automation sections">
        {sections.map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            aria-current={route.section === id ? "page" : undefined}
          >
            {label}
          </a>
        ))}
      </nav>
      {route.section === "overview" && (
        <>
          {data.runs.length > 0 && <ActivityStrip data={data} />}
          <div className={styles.sectionHead}>
            <h2>What will you put in motion?</h2>
            <label className={styles.search}>
              <Search size={16} />
              <input
                aria-label="Explore outcomes"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Find an outcome…"
              />
            </label>
          </div>
          <div className={styles.capabilities}>
            {cards
              .filter((c) =>
                `${c.label} ${c.text}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map(({ id, label, text, icon: Icon, prompt }, i) => (
                <article className={styles.capability} key={id} data-visual={i}>
                  <Icon size={22} strokeWidth={1.4} />
                  <div className={styles.visual} aria-hidden="true">
                    <Icon />
                  </div>
                  <h2>{label}</h2>
                  <p>{text}</p>
                  <div className={styles.toolbar}>
                    <button onClick={() => select(prompt, label)}>
                      Use in chatbar ↗
                    </button>
                    <a href={`#${id}`}>Explore →</a>
                  </div>
                </article>
              ))}
          </div>
          <div className={styles.sectionHead}>
            <div>
              <span className={styles.eyebrow}>Ready-made solutions</span>
              <h2>A little setup. A bigger outcome.</h2>
            </div>
            <a href="#work-packs">All Work Packs →</a>
          </div>
          <div className={styles.grid}>
            {packs
              .filter((p) =>
                `${p.name} ${p.outcome}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .slice(0, 3)
              .map((p) => (
                <a
                  key={p.id}
                  className={styles.card}
                  href={`#work-packs/${p.id}`}
                >
                  <span className={styles.eyebrow}>
                    {p.category} · Setup preview
                  </span>
                  <h3>{p.name}</h3>
                  <p>{p.outcome}</p>
                  <span>{p.employees.length} specialists · Guided setup →</span>
                </a>
              ))}
          </div>
          {!data.runs.length && <ActivityStrip data={data} />}
          <DraftSummary />
          <div className={styles.notice}>
            Your setup, your control. Drafts are saved only on this browser and
            account. App connections and execution records use existing Xroga
            APIs. A preview never means work ran.
          </div>
        </>
      )}
      {route.section === "workflows" && <WorkflowEditor onSelect={select} />}
      {route.section === "scheduled-tasks" && <><ConnectedAppAutomations /><Schedules onSelect={select} /></>}
      {route.section === "ai-employees" && <People onSelect={select} />}
      {route.section === "work-packs" && (
        <WorkPacks
          key={route.detail || "catalog"}
          initialId={route.detail}
          onSelect={select}
        />
      )}
      {route.section === "browser-automation" && (
        <BrowserStudio runs={data.runs} onSelect={select} />
      )}
      {route.section === "apps-mcp" && <Connections onSelect={select} />}
      {(route.section === "activity" || route.section === "run-history") && (
        <Activity
          key={route.section}
          data={data}
          live={route.section === "activity"}
          initialId={route.detail}
        />
      )}
      <footer className={styles.footer}>
        Built for outcomes. Designed for oversight.
        <span>Production actions remain approval-gated.</span>
      </footer>
    </main>
  );
}
