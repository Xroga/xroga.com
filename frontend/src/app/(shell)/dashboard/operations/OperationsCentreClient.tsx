'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, ArrowLeft, CheckCircle2, Clock3, Database, LockKeyhole, RefreshCw, Search, Server, ShieldAlert } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';

type Product = {
  id: string; name: string; type: string; repository: string | null; primaryEnvironment: string | null;
  currentRelease: string | null; runningCommit: string | null; status: string; statusReason: string;
  deploymentState: string; applicationHealth: string; databaseState: string; domainState: string;
  criticalWorkflowState: string; incidentCount: number; alertCount: number; pendingApprovals: number;
  backupState: string; lastVerification: string | null; stale: boolean; requiredAction: string | null;
};

type Resource = {
  id: string; version: number; projectId: string; environmentId: string | null; kind: string; provider: string; name: string;
  status: string; statusReason: string | null; evidenceReference: string | null;
  freshness: { source: string; observedAt: string | null; verifiedAt: string | null; staleAfter: string | null; reconciliationState: string; stale: boolean };
  availableActions: string[];
};

type Row = Record<string, unknown> & { id?: string; status?: string; name?: string; created_at?: string; evidence_reference?: string };
type ProductDetail = {
  project: { id: string; name: string; type: string; github_repo_name?: string | null };
  role: string; permissions: string[]; environments: Row[]; resources: Resource[]; releases: Row[];
  deployments: Row[]; incidents: Row[]; alerts: Row[]; actions: Row[]; approvals: Row[];
  jobs: Row[]; webhooks: Row[]; maintenance: Row[];
};

const PORTFOLIO_ATTEMPT_TIMEOUT_MS = 7_000;

async function fetchPortfolio(path: string, externalSignal?: AbortSignal): Promise<{ products: Product[] }> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const abortForNavigation = () => controller.abort();
    externalSignal?.addEventListener('abort', abortForNavigation, { once: true });
    const timeout = window.setTimeout(() => controller.abort(), PORTFOLIO_ATTEMPT_TIMEOUT_MS);
    try {
      return await apiFetch<{ products: Product[] }>(path, { signal: controller.signal });
    } catch (cause) {
      if (externalSignal?.aborted) throw cause;
      if (!(cause instanceof ApiError) || cause.status !== 0 || attempt === 1) throw cause;
    } finally {
      window.clearTimeout(timeout);
      externalSignal?.removeEventListener('abort', abortForNavigation);
    }
  }
  throw new ApiError('Operations portfolio is unavailable', 0);
}

const GROUPS: Array<{ label: string; kinds: string[] }> = [
  { label: 'Services & health', kinds: ['service','dependency','health_check','workflow_check'] },
  { label: 'Workers, jobs & queues', kinds: ['worker','job','queue'] },
  { label: 'Webhooks & integrations', kinds: ['webhook','integration','provider_status'] },
  { label: 'Database, migrations & backups', kinds: ['migration','schema_drift','backup','restore_test'] },
  { label: 'Domains & TLS', kinds: ['domain','certificate'] },
  { label: 'Capacity & observability', kinds: ['capacity','log_source','metric_source','trace_source','error_source'] },
];

const GOOD = new Set(['healthy','verified','ready','matched','succeeded','connected','resolved']);

function statusClass(status?: string) {
  if (status && GOOD.has(status)) return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  if (status && ['failed','blocked','incident','degraded','inconsistent','unavailable'].includes(status)) return 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300';
  return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
}

function Status({ value }: { value?: string | null }) {
  const truth = value || 'unknown';
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusClass(truth)}`}>{truth.replaceAll('_', ' ')}</span>;
}

function when(value: unknown): string {
  if (typeof value !== 'string' || !value) return 'not recorded';
  const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function safeText(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'unavailable';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function Empty({ children }: { children: string }) {
  return <div className="rounded-xl border border-dashed border-[var(--card-border)] p-5 text-sm text-[var(--muted)]">{children}</div>;
}

export default function OperationsCentreClient() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProductDetail | null>(null);
  const [configuration, setConfiguration] = useState<Row[]>([]);
  const [slo, setSlo] = useState<Row[]>([]);
  const [audit, setAudit] = useState<Row[]>([]);
  const [evidence, setEvidence] = useState<Row[]>([]);
  const [automation, setAutomation] = useState<{ rules: Row[]; runs: Row[] }>({ rules: [], runs: [] });
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [maintenanceForm, setMaintenanceForm] = useState({ startsAt: '', endsAt: '', reason: '' });
  const [automationForm, setAutomationForm] = useState({ ruleKey: '', name: '', triggerType: 'provider_failure', actionType: 'prepare_repair' });

  const loadPortfolio = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ limit: '100', offset: '0' });
      if (appliedQuery) params.set('search', appliedQuery);
      if (statusFilter) params.set('status', statusFilter);
      const data = await fetchPortfolio(`/api/operations/portfolio?${params}`, signal);
      setProducts(data.products ?? []);
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof ApiError ? cause.message : 'Operations portfolio is unavailable');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [appliedQuery, statusFilter]);

  const loadDetail = useCallback(async (projectId: string) => {
    setLoading(true); setError(null);
    try {
      const encoded = encodeURIComponent(projectId);
      const [product, config, objectives, auditData, evidenceData, automationData] = await Promise.all([
        apiFetch<ProductDetail>(`/api/operations/products/${encoded}`),
        apiFetch<{ configuration: Row[] }>(`/api/operations/configuration?projectId=${encoded}`),
        apiFetch<{ snapshots: Row[] }>(`/api/operations/slo?projectId=${encoded}`),
        apiFetch<{ events: Row[] }>(`/api/operations/audit?projectId=${encoded}&limit=100`),
        apiFetch<{ evidence: Row[] }>(`/api/operations/evidence?projectId=${encoded}&limit=100`),
        apiFetch<{ rules: Row[]; runs: Row[] }>(`/api/operations/automation?projectId=${encoded}`),
      ]);
      setDetail(product); setConfiguration(config.configuration ?? []); setSlo(objectives.snapshots ?? []);
      setAudit(auditData.events ?? []); setEvidence(evidenceData.evidence ?? []); setAutomation(automationData);
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : 'Product operations are unavailable'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadPortfolio(controller.signal);
    return () => controller.abort();
  }, [loadPortfolio]);
  useEffect(() => { if (selectedId) void loadDetail(selectedId); }, [selectedId, loadDetail]);

  const visibleProducts = useMemo(() => products.slice().sort((a, b) => b.incidentCount - a.incidentCount || a.name.localeCompare(b.name)), [products]);

  async function runAction(actionType: string, targetType: string, targetId: string, targetVersion = 1, confirmed = false, parameters?: Record<string, unknown>) {
    if (!selectedId) return;
    if (confirmed && !window.confirm(`Confirm ${actionType.replaceAll('_', ' ')} for this exact target state?`)) return;
    setActionBusy(`${actionType}:${targetId}`); setError(null);
    try {
      await apiFetch('/api/operations/actions', { method: 'POST', body: JSON.stringify({ projectId: selectedId, actionType, targetType, targetId, targetVersion, idempotencyKey: crypto.randomUUID(), confirmed, parameters }) });
      await loadDetail(selectedId);
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : 'Operational action failed'); }
    finally { setActionBusy(null); }
  }

  async function createAutomationRule() {
    if (!selectedId) return;
    setActionBusy('automation:create'); setError(null);
    try {
      await apiFetch('/api/operations/automation/rules', { method: 'POST', body: JSON.stringify({ projectId: selectedId, ...automationForm, riskLevel: 'medium', conditions: {}, exclusions: {}, maxRuns: 3, windowSeconds: 3600, enabled: false }) });
      setAutomationForm({ ruleKey: '', name: '', triggerType: 'provider_failure', actionType: 'prepare_repair' });
      await loadDetail(selectedId);
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : 'Automation rule could not be created'); }
    finally { setActionBusy(null); }
  }

  if (!selectedId) {
    return (
      <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
        <header className="space-y-2">
          <div className="flex items-center gap-2 text-[var(--primary)]"><Activity className="h-5 w-5" /><span className="text-sm font-semibold">Live operational state</span></div>
          <h1 className="text-2xl font-bold sm:text-3xl">Product Operations Centre</h1>
          <p className="max-w-3xl text-sm text-[var(--muted)]">Tenant-scoped releases, health, incidents, configuration posture, automation and evidence. Unknown or stale data stays visible and is never treated as healthy.</p>
        </header>
        <form className="flex flex-col gap-3 sm:flex-row" onSubmit={(event) => { event.preventDefault(); const nextQuery = query.trim(); if (nextQuery === appliedQuery) void loadPortfolio(); else setAppliedQuery(nextQuery); }}>
          <label className="relative flex-1"><span className="sr-only">Search products</span><Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--muted)]" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--card)] py-2 pl-9 pr-3 text-sm" placeholder="Search products" /></label>
          <label><span className="sr-only">Filter by operational status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-sm sm:w-48"><option value="">All states</option><option value="healthy">Healthy</option><option value="incident">Incident</option><option value="degraded">Degraded</option><option value="blocked">Blocked</option><option value="verification_required">Verification required</option><option value="unknown">Unknown</option></select></label>
          <button type="submit" className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white">Refresh</button>
        </form>
        {error && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">{error}</div>}
        {loading ? <div aria-live="polite" className="rounded-xl border border-[var(--card-border)] p-8 text-center text-[var(--muted)]">Loading operational state…</div> : visibleProducts.length === 0 ? <Empty>No products match this view. Operational data is not fabricated when no source has reported it.</Empty> : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visibleProducts.map((product) => <button key={product.id} type="button" onClick={() => setSelectedId(product.id)} className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 text-left transition hover:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]">
            <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold">{product.name}</h2><p className="text-xs text-[var(--muted)]">{product.repository ?? product.type}</p></div><Status value={product.status} /></div>
            <p className="mt-4 min-h-10 text-sm text-[var(--muted)]">{product.statusReason}</p>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><dt className="text-[var(--muted)]">Deployment</dt><dd><Status value={product.deploymentState} /></dd></div><div><dt className="text-[var(--muted)]">Health</dt><dd><Status value={product.applicationHealth} /></dd></div><div><dt className="text-[var(--muted)]">Incidents</dt><dd>{product.incidentCount}</dd></div><div><dt className="text-[var(--muted)]">Approvals</dt><dd>{product.pendingApprovals}</dd></div></dl>
            <p className="mt-4 text-xs text-[var(--muted)]">Verified: {when(product.lastVerification)}</p>
          </button>)}</div>
        )}
      </main>
    );
  }

  const selected = products.find((product) => product.id === selectedId);
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <button type="button" onClick={() => { setSelectedId(null); setDetail(null); }} className="inline-flex items-center gap-2 text-sm text-[var(--primary)]"><ArrowLeft className="h-4 w-4" />Portfolio</button>
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><h1 className="text-2xl font-bold">{detail?.project.name ?? selected?.name ?? 'Product operations'}</h1><p className="text-sm text-[var(--muted)]">Role: {detail?.role ?? 'checking'} · backend-enforced permissions</p></div><button type="button" onClick={() => void loadDetail(selectedId)} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--card-border)] px-3 py-2 text-sm disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh state</button></header>
      {error && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">{error}</div>}
      {loading && !detail ? <div className="p-8 text-center text-[var(--muted)]">Loading product operations…</div> : detail && <>
        <section aria-labelledby="overview-heading" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <h2 id="overview-heading" className="sr-only">Overview</h2>
          {[['Environment', safeText(detail.environments[0]?.environment_key)], ['Release', safeText(detail.releases[0]?.commit_sha)], ['Incidents', detail.incidents.filter((row) => !['resolved','closed','cancelled'].includes(String(row.status))).length], ['Pending approvals', detail.approvals.filter((row) => row.decision === 'pending').length]].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4"><p className="text-xs text-[var(--muted)]">{label}</p><p className="mt-1 break-all font-medium">{String(value)}</p></div>)}
        </section>

        <section className="space-y-3"><div className="flex items-center gap-2"><Server className="h-5 w-5" /><h2 className="text-lg font-semibold">Operational inventory</h2></div>
          {GROUPS.map((group) => { const rows = detail.resources.filter((item) => group.kinds.includes(item.kind)); return <div key={group.label} className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4"><h3 className="mb-3 font-medium">{group.label}</h3>{rows.length === 0 ? <p className="text-sm text-[var(--muted)]">No source has reported this subsystem. State: unavailable.</p> : <div className="space-y-3">{rows.map((item) => <div key={item.id} className="flex flex-col justify-between gap-3 border-t border-[var(--card-border)] pt-3 first:border-0 first:pt-0 sm:flex-row sm:items-center"><div><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{item.name}</span><Status value={item.freshness.stale ? 'stale' : item.status} />{item.freshness.reconciliationState === 'inconsistent' && <Status value="inconsistent" />}</div><p className="mt-1 text-xs text-[var(--muted)]">Source: {item.freshness.source} · observed {when(item.freshness.observedAt)} · verified {when(item.freshness.verifiedAt)}</p>{item.statusReason && <p className="mt-1 text-sm text-[var(--muted)]">{item.statusReason}</p>}</div><div className="flex flex-wrap gap-2">{item.availableActions.map((action) => <button key={action} type="button" disabled={Boolean(actionBusy)} onClick={() => void runAction(action, item.kind, item.id, item.version, ['retry_job','retry_webhook'].includes(action))} className="rounded-lg border border-[var(--card-border)] px-3 py-1.5 text-xs disabled:opacity-50">{actionBusy === `${action}:${item.id}` ? 'Running…' : action.replaceAll('_', ' ')}</button>)}</div></div>)}</div>}</div>; })}
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4"><h2 className="mb-3 font-semibold">Jobs & webhook deliveries</h2>
            {detail.jobs.length + detail.webhooks.length === 0 ? <Empty>No job or webhook activity has been recorded for this product.</Empty> : <div className="space-y-3">
              {detail.jobs.map((job) => <div key={String(job.id)} className="flex items-center justify-between gap-3 border-t border-[var(--card-border)] pt-3 first:border-0"><div><p className="text-sm">Job {safeText(job.feature_category ?? job.id)}</p><p className="text-xs text-[var(--muted)]">Attempt {safeText(job.attempt_count)} · {when(job.updated_at ?? job.created_at)}</p></div><div className="flex items-center gap-2"><Status value={job.status} />{job.status === 'failed' && <button type="button" disabled={Boolean(actionBusy)} onClick={() => void runAction('retry_job','job',String(job.id),Number(job.attempt_count ?? 0),true)} className="rounded border border-[var(--card-border)] px-2 py-1 text-xs">Retry</button>}</div></div>)}
              {detail.webhooks.map((hook) => <div key={String(hook.id)} className="flex items-center justify-between gap-3 border-t border-[var(--card-border)] pt-3"><div><p className="text-sm">{safeText(hook.provider)} · {safeText(hook.event_type)}</p><p className="text-xs text-[var(--muted)]">Signature: {hook.signature_verified === true ? 'verified' : hook.signature_verified === false ? 'failed' : 'unknown'} · attempt {safeText(hook.attempt_count)}</p></div><div className="flex items-center gap-2"><Status value={hook.status} />{hook.status === 'failed' && <button type="button" disabled={Boolean(actionBusy)} onClick={() => void runAction('retry_webhook','webhook',String(hook.delivery_id),Number(hook.attempt_count ?? 1),true)} className="rounded border border-[var(--card-border)] px-2 py-1 text-xs">Retry</button>}</div></div>)}
            </div>}
          </div>
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4"><h2 className="mb-3 font-semibold">Maintenance windows & freezes</h2>
            {detail.maintenance.length === 0 ? <p className="mb-3 text-sm text-[var(--muted)]">No maintenance window is scheduled.</p> : <div className="mb-4 space-y-3">{detail.maintenance.map((window) => <div key={String(window.id)} className="border-t border-[var(--card-border)] pt-3 first:border-0"><div className="flex items-center justify-between gap-2"><span className="text-sm">{safeText(window.reason)}</span><Status value={window.status} /></div><p className="text-xs text-[var(--muted)]">{when(window.starts_at)} — {when(window.ends_at)}</p>{['scheduled','active'].includes(String(window.status)) && <button type="button" disabled={Boolean(actionBusy)} onClick={() => void runAction('cancel_maintenance','maintenance',String(window.id),Number(window.version ?? 1),true)} className="mt-2 rounded border border-[var(--card-border)] px-2 py-1 text-xs">Cancel window</button>}</div>)}</div>}
            {detail.permissions.includes('manage_automation') && detail.environments[0]?.id ? <form className="grid gap-2" onSubmit={(event) => { event.preventDefault(); const environment = detail.environments[0]; void runAction('schedule_maintenance','environment',String(environment.id),Number(environment.version ?? 1),true,{ startsAt: new Date(maintenanceForm.startsAt).toISOString(), endsAt: new Date(maintenanceForm.endsAt).toISOString(), reason: maintenanceForm.reason }); }}>
              <label className="text-xs text-[var(--muted)]">Starts<input required type="datetime-local" value={maintenanceForm.startsAt} onChange={(event) => setMaintenanceForm((value) => ({ ...value, startsAt: event.target.value }))} className="mt-1 w-full rounded border border-[var(--card-border)] bg-transparent px-2 py-1.5 text-sm text-[var(--foreground)]" /></label>
              <label className="text-xs text-[var(--muted)]">Ends<input required type="datetime-local" value={maintenanceForm.endsAt} onChange={(event) => setMaintenanceForm((value) => ({ ...value, endsAt: event.target.value }))} className="mt-1 w-full rounded border border-[var(--card-border)] bg-transparent px-2 py-1.5 text-sm text-[var(--foreground)]" /></label>
              <label className="text-xs text-[var(--muted)]">Reason<input required minLength={3} maxLength={500} value={maintenanceForm.reason} onChange={(event) => setMaintenanceForm((value) => ({ ...value, reason: event.target.value }))} className="mt-1 w-full rounded border border-[var(--card-border)] bg-transparent px-2 py-1.5 text-sm text-[var(--foreground)]" /></label>
              <button type="submit" disabled={Boolean(actionBusy)} className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Schedule maintenance</button>
            </form> : <p className="text-xs text-[var(--muted)]">Scheduling is unavailable without an environment and manage-automation permission.</p>}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2"><div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4"><div className="mb-3 flex items-center gap-2"><LockKeyhole className="h-5 w-5" /><h2 className="font-semibold">Configuration posture</h2></div>{configuration.length === 0 ? <Empty>No configuration verification has been recorded. Values are never exposed.</Empty> : <div className="space-y-2">{configuration.map((row) => <div key={String(row.id)} className="flex items-center justify-between gap-3 border-t border-[var(--card-border)] py-2 first:border-0"><div><p className="font-mono text-sm">{safeText(row.variable_name)}</p><p className="text-xs text-[var(--muted)]">{safeText(row.provider)} · verified {when(row.verified_at)}</p></div><Status value={row.present === true ? String(row.validation_status ?? 'present') : 'not_configured'} /></div>)}</div>}</div>
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4"><div className="mb-3 flex items-center gap-2"><Activity className="h-5 w-5" /><h2 className="font-semibold">SLOs, error budget & capacity</h2></div>{slo.length === 0 ? <Empty>No SLO objective is configured. State: not configured; health is not inferred.</Empty> : <div className="space-y-2">{slo.map((row) => <div key={String(row.id)} className="border-t border-[var(--card-border)] py-2 first:border-0"><div className="flex justify-between gap-3"><span>{safeText(row.objective_key)}</span><Status value={String(row.status ?? 'insufficient_data')} /></div><p className="text-xs text-[var(--muted)]">Window: {safeText(row.observation_window)} · samples: {safeText(row.sample_count)} · source {safeText(row.source)}</p></div>)}</div>}</div></section>

        <section className="grid gap-4 lg:grid-cols-2"><div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4"><div className="mb-3 flex items-center gap-2"><ShieldAlert className="h-5 w-5" /><h2 className="font-semibold">Incidents & alerts</h2></div>{detail.incidents.length + detail.alerts.length === 0 ? <Empty>No incidents or alerts have been recorded.</Empty> : <div className="space-y-3">{detail.incidents.map((incident) => <div key={String(incident.id)} className="border-t border-[var(--card-border)] pt-3 first:border-0"><div className="flex flex-wrap items-center justify-between gap-2"><span>{safeText(incident.title ?? incident.summary ?? incident.id)}</span><Status value={incident.status} /></div><div className="mt-2 flex gap-2">{['detected','open'].includes(String(incident.status)) && <button type="button" disabled={Boolean(actionBusy)} onClick={() => void runAction('acknowledge_incident','incident',String(incident.id),Number(incident.version ?? 1))} className="rounded border border-[var(--card-border)] px-2 py-1 text-xs">Acknowledge</button>}</div></div>)}{detail.alerts.map((alert) => <div key={String(alert.id)} className="border-t border-[var(--card-border)] pt-3"><span>{safeText(alert.rule_key ?? alert.id)}</span> <Status value={alert.status} /></div>)}</div>}</div>
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4"><div className="mb-3 flex items-center gap-2"><Clock3 className="h-5 w-5" /><h2 className="font-semibold">Automation & approvals</h2></div>{automation.rules.length === 0 && detail.approvals.length === 0 ? <Empty>No automation policy or approval request is configured.</Empty> : <div className="space-y-3">{automation.rules.map((rule) => <div key={String(rule.id)} className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--card-border)] pt-2 first:border-0"><div><span>{safeText(rule.name)}</span> <Status value={rule.emergency_stopped ? 'blocked' : rule.enabled ? 'enabled' : 'disabled'} /></div><button type="button" disabled={Boolean(actionBusy)} onClick={() => void runAction(rule.emergency_stopped ? 'resume_automation' : rule.enabled ? 'emergency_stop' : 'enable_automation','automation',String(rule.id),Number(rule.version ?? 1),true)} className="rounded border border-[var(--card-border)] px-2 py-1 text-xs">{rule.emergency_stopped ? 'Request resume' : rule.enabled ? 'Emergency stop' : 'Enable rule'}</button></div>)}{detail.approvals.map((approval) => <div key={String(approval.id)} className="border-t border-[var(--card-border)] pt-2"><span>{safeText(approval.required_role)}</span> <Status value={String(approval.decision)} /><p className="text-xs text-[var(--muted)]">Expires {when(approval.expires_at)}</p></div>)}</div>}{detail.permissions.includes('manage_automation') && <form className="mt-4 grid gap-2 border-t border-[var(--card-border)] pt-3" onSubmit={(event) => { event.preventDefault(); void createAutomationRule(); }}><p className="text-xs font-medium">Create disabled rule for review</p><input required pattern="[a-z0-9][a-z0-9_.-]{2,79}" placeholder="rule.key" value={automationForm.ruleKey} onChange={(event) => setAutomationForm((value) => ({ ...value, ruleKey: event.target.value }))} className="rounded border border-[var(--card-border)] bg-transparent px-2 py-1.5 text-sm" /><input required minLength={3} placeholder="Rule name" value={automationForm.name} onChange={(event) => setAutomationForm((value) => ({ ...value, name: event.target.value }))} className="rounded border border-[var(--card-border)] bg-transparent px-2 py-1.5 text-sm" /><button type="submit" disabled={Boolean(actionBusy)} className="rounded border border-[var(--card-border)] px-2 py-1.5 text-xs">Create rule</button></form>}</div></section>

        <section className="grid gap-4 lg:grid-cols-2"><div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4"><div className="mb-3 flex items-center gap-2"><CheckCircle2 className="h-5 w-5" /><h2 className="font-semibold">Evidence</h2></div>{evidence.length === 0 ? <Empty>No operational evidence has been recorded.</Empty> : <div className="max-h-80 space-y-2 overflow-auto">{evidence.map((row) => <div key={String(row.id)} className="border-t border-[var(--card-border)] py-2 first:border-0"><div className="flex justify-between gap-2"><span>{safeText(row.kind)}</span><Status value={row.status} /></div><p className="text-xs text-[var(--muted)]">{safeText(row.summary)} · {when(row.observed_at)}</p></div>)}</div>}</div>
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4"><div className="mb-3 flex items-center gap-2"><Database className="h-5 w-5" /><h2 className="font-semibold">Immutable audit history</h2></div>{audit.length === 0 ? <Empty>No operational action has produced an audit event.</Empty> : <div className="max-h-80 space-y-2 overflow-auto">{audit.map((row) => <div key={String(row.id)} className="border-t border-[var(--card-border)] py-2 first:border-0"><p className="text-sm">{safeText(row.action)}</p><p className="text-xs text-[var(--muted)]">{safeText(row.outcome)} · {when(row.created_at)}</p></div>)}</div>}</div></section>

        <p className="flex items-center gap-2 text-xs text-[var(--muted)]"><AlertTriangle className="h-4 w-4" />Unsupported or externally unconfigured provider actions remain unavailable. Production promotion, rollback, migration, backup restore, queue purge and integration removal are never executed without a working adapter, current approval and post-action verification.</p>
      </>}
    </main>
  );
}
