"use client";

import { useCallback, useEffect, useState } from "react";
import {connectReviewUrl,type XrogaConnectPending} from "@/lib/xrogaConnect";
import { apiFetch } from "@/lib/api";

interface Rule {
  id: string;
  name: string;
  request: string;
  schedule_kind: "interval" | "trigger";
  interval_seconds: number | null;
  enabled: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
}
interface RunEvent {
  id: string;
  rule_id: string;
  status: string;
  workflow_run_id: string | null;
  created_at: string;
}
interface TriggerType { slug: string; name: string; description?: string }

export function ConnectedAppAutomations() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [name, setName] = useState("");
  const [request, setRequest] = useState("");
  const [kind, setKind] = useState<"interval" | "trigger">("interval");
  const [hours, setHours] = useState(24);
  const [toolkit, setToolkit] = useState("");
  const [triggerSlug, setTriggerSlug] = useState("");
  const [triggerConfig, setTriggerConfig] = useState("{}");
  const [triggers, setTriggers] = useState<TriggerType[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [review,setReview]=useState<string|null>(null);

  const load = useCallback(async () => {
    try {
      const result = await apiFetch<{ automations: Rule[] }>("/api/phase1/business-automations");
      setRules(result.automations);
      const history = await apiFetch<{ events: RunEvent[] }>("/api/phase1/business-automations/events");
      setEvents(history.events);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Connected-app automations could not be loaded.");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (kind !== "trigger" || !/^[a-z0-9][a-z0-9_-]{1,79}$/i.test(toolkit.trim())) { setTriggers([]); return; }
    let active = true;
    void apiFetch<{ triggers: TriggerType[] }>(`/api/phase1/business-automations/triggers?toolkit=${encodeURIComponent(toolkit.trim().toLowerCase())}`)
      .then((result) => { if (active) setTriggers(result.triggers); })
      .catch(() => { if (active) setTriggers([]); });
    return () => { active = false; };
  }, [kind, toolkit]);

  async function create() {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const config: unknown = JSON.parse(triggerConfig);
      if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error("Trigger configuration must be a JSON object.");
      const schedule = kind === "interval"
        ? { kind, intervalSeconds: Math.round(hours * 3600) }
        : { kind, toolkit: toolkit.trim(), triggerSlug: triggerSlug.trim(), triggerConfig: config };
      const result=await apiFetch<XrogaConnectPending|{automation:Rule}>("/api/phase1/business-automations", { method: "POST", body: JSON.stringify({ name, request, schedule }) });
      if('needsConfirmation' in result){setReview(connectReviewUrl(result));setNotice('Review the exact event subscription before it is created. The workflow stays paused.');return;}
      setReview(null);
      setName(""); setRequest(""); setNotice("Saved as a paused draft. Review it, then enable it below.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Automation could not be saved.");
    } finally { setBusy(false); }
  }

  async function change(rule: Rule) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await apiFetch(`/api/phase1/business-automations/${encodeURIComponent(rule.id)}`, {
        method: "PATCH", body: JSON.stringify({ enabled: !rule.enabled }),
      });
      setNotice(rule.enabled ? "Automation paused." : "Automation enabled. App actions still require your approval.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Automation could not be changed.");
    } finally { setBusy(false); }
  }

  return <section className="mt-8 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5 text-[var(--text-primary)]">
    <h2 className="text-xl font-semibold">Live connected-app rules</h2>
    <p className="mt-2 text-sm text-[var(--text-secondary)]">Create a two-to-four-step workflow across your connected apps. Private reads and external writes wait for exact review. Event rules require a configured Composio webhook.</p>
    <form className="mt-5 grid gap-3" onSubmit={(event) => { event.preventDefault(); void create(); }}>
      <label className="grid gap-1 text-sm">Name<input className="rounded-lg border border-[var(--border-subtle)] bg-transparent p-2" required minLength={3} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label className="grid gap-1 text-sm">Workflow request<textarea className="min-h-24 rounded-lg border border-[var(--border-subtle)] bg-transparent p-2" required minLength={8} maxLength={1500} placeholder="Find new contacts in my CRM, add them to my sheet, and draft an email with the results" value={request} onChange={(event) => setRequest(event.target.value)} /></label>
      <label className="grid gap-1 text-sm">When to run<select className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-2" value={kind} onChange={(event) => setKind(event.target.value as "interval" | "trigger")}><option value="interval">At an interval</option><option value="trigger">On a connected-app event</option></select></label>
      {kind === "interval" ? <label className="grid gap-1 text-sm">Every N hours (1–720)<input className="rounded-lg border border-[var(--border-subtle)] bg-transparent p-2" type="number" min={1} max={720} step={1} value={hours} onChange={(event) => setHours(Number(event.target.value))} /></label> : <>
        <label className="grid gap-1 text-sm">Connected app slug<input className="rounded-lg border border-[var(--border-subtle)] bg-transparent p-2" required placeholder="gmail" value={toolkit} onChange={(event) => setToolkit(event.target.value)} /></label>
        <label className="grid gap-1 text-sm">Composio trigger slug<input className="rounded-lg border border-[var(--border-subtle)] bg-transparent p-2" required placeholder="GMAIL_NEW_GMAIL_MESSAGE" value={triggerSlug} onChange={(event) => setTriggerSlug(event.target.value)} /></label>
        {triggers.length ? <label className="grid gap-1 text-sm">Available events<select className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-2" value={triggers.some((item) => item.slug === triggerSlug) ? triggerSlug : ""} onChange={(event) => setTriggerSlug(event.target.value)}><option value="">Choose an app event</option>{triggers.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select></label> : null}
        <label className="grid gap-1 text-sm">Trigger configuration (JSON)<textarea className="rounded-lg border border-[var(--border-subtle)] bg-transparent p-2 font-mono text-xs" value={triggerConfig} onChange={(event) => setTriggerConfig(event.target.value)} /></label>
      </>}
      <button disabled={busy} className="w-fit rounded-lg bg-[var(--accent)] px-4 py-2 font-semibold text-white disabled:opacity-50">Save paused rule</button>
    </form>
    {error ? <p role="alert" className="mt-3 text-sm text-red-500">{error}</p> : null}
    {review?<a href={review} className="block mt-3 underline">Review event subscription</a>:null}
    {notice ? <p role="status" className="mt-3 text-sm text-[var(--text-secondary)]">{notice}</p> : null}
    <div className="mt-6 grid gap-3">{rules.map((rule) => <article key={rule.id} className="rounded-xl border border-[var(--border-subtle)] p-4">
      <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">{rule.name}</h3><span className="text-xs text-[var(--text-secondary)]">{rule.enabled ? "Enabled" : "Paused"}</span></div>
      <p className="mt-2 text-sm">{rule.request}</p>
      <p className="mt-2 text-xs text-[var(--text-secondary)]">{rule.schedule_kind === "interval" ? `Every ${(rule.interval_seconds ?? 0) / 3600} hours` : "App event"}{rule.next_run_at ? ` · Next: ${new Date(rule.next_run_at).toLocaleString()}` : ""}</p>
      <button type="button" disabled={busy} onClick={() => { void change(rule); }} className="mt-3 rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-sm disabled:opacity-50">{rule.enabled ? "Pause" : "Enable"}</button>
    </article>)}</div>
    <div className="mt-8"><h3 className="font-semibold">Recent runs</h3><div className="mt-3 grid gap-2">{events.length ? events.map((event) => <div key={event.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] p-3 text-sm"><span>{rules.find((rule) => rule.id === event.rule_id)?.name ?? 'App rule'} · {new Date(event.created_at).toLocaleString()} · {event.status}</span>{event.workflow_run_id ? <a className="underline" href={`/dashboard/workflows/${encodeURIComponent(event.workflow_run_id)}`}>Review workflow</a> : null}</div>) : <p className="text-sm text-[var(--text-secondary)]">No runs yet.</p>}</div></div>
  </section>;
}
