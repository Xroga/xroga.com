'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { API_URL } from '@/lib/api';

interface SystemError {
  id: string;
  timestamp: string;
  api: string | null;
  error_message: string;
  fallback_used: string | null;
  severity: string;
}

interface OperationsReadiness {
  status: 'verified' | 'degraded' | 'blocked' | 'unknown';
  checks: Array<{ id: string; status: string; required: boolean; blocker?: string }>;
  blockers: string[];
  evaluatedAt: string;
}

export default function AdminPageClient() {
  const [errors, setErrors] = useState<SystemError[]>([]);
  const [filter, setFilter] = useState('');
  const [severity, setSeverity] = useState('');
  const [loading, setLoading] = useState(true);
  const [readiness, setReadiness] = useState<OperationsReadiness | null>(null);
  const [readinessError, setReadinessError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const params = new URLSearchParams({ limit: '100' });
      if (severity) params.set('severity', severity);
      if (filter) params.set('api', filter);

      const headers: Record<string, string> = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {};
      const [res, readinessRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/errors?${params}`, { headers }),
        fetch(`${API_URL}/api/operations/readiness`, { headers }),
      ]);
      const data = (await res.json()) as { errors: SystemError[] };
      setErrors(data.errors ?? []);
      const readinessData = (await readinessRes.json()) as { readiness?: OperationsReadiness; blocker?: string };
      setReadiness(readinessData.readiness ?? null);
      setReadinessError(readinessRes.ok ? null : readinessData.blocker ?? 'Readiness evidence unavailable');
    } catch {
      setErrors([]);
      setReadiness(null);
      setReadinessError('Readiness request failed');
    } finally {
      setLoading(false);
    }
  }, [filter, severity]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = errors.filter((e) => {
    const q = filter.toLowerCase();
    if (!q) return true;
    return (
      (e.api ?? '').toLowerCase().includes(q) ||
      e.error_message.toLowerCase().includes(q) ||
      (e.fallback_used ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">XROGA Admin</h1>
        <p className="text-sm text-[var(--muted)]">Internal system errors — never shown to end users</p>
      </div>

      <section className="rounded-xl border border-[var(--card-border)] p-4 space-y-3" aria-live="polite">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">Production readiness</h2>
          <span className="font-mono text-sm">{loading ? 'loading' : readiness?.status ?? 'unknown'}</span>
        </div>
        {readinessError && <p className="text-sm text-red-400">{readinessError}</p>}
        {readiness?.blockers.map((blocker) => (
          <p key={blocker} className="text-sm text-yellow-400">Blocked: {blocker}</p>
        ))}
        {readiness && (
          <p className="text-xs text-[var(--muted)]">
            {readiness.checks.filter((check) => check.status === 'verified').length}/{readiness.checks.length} checks verified · evaluated {new Date(readiness.evaluatedAt).toLocaleString()}
          </p>
        )}
      </section>

      <div className="flex flex-wrap gap-3">
        <input
          type="search"
          placeholder="Filter by API or message…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-[var(--card-border)] bg-[var(--card)] text-sm"
        />
        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
          className="px-3 py-2 rounded-lg border border-[var(--card-border)] bg-[var(--card)] text-sm"
        >
          <option value="">All severities</option>
          <option value="info">info</option>
          <option value="warning">warning</option>
          <option value="error">error</option>
          <option value="critical">critical</option>
        </select>
        <button
          type="button"
          onClick={() => void load()}
          className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium"
        >
          View logs
        </button>
      </div>

      {loading ? (
        <p className="text-[var(--muted)]">Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--card-border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--card)] border-b border-[var(--card-border)]">
              <tr>
                <th className="text-left p-3 font-medium">Timestamp</th>
                <th className="text-left p-3 font-medium">API</th>
                <th className="text-left p-3 font-medium">Severity</th>
                <th className="text-left p-3 font-medium">Error</th>
                <th className="text-left p-3 font-medium">Fallback</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id} className="border-b border-[var(--card-border)]/50 hover:bg-white/5">
                  <td className="p-3 whitespace-nowrap text-[var(--muted)] text-xs">
                    {new Date(e.timestamp).toLocaleString()}
                  </td>
                  <td className="p-3 font-mono text-xs">{e.api ?? '—'}</td>
                  <td className="p-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        e.severity === 'error' || e.severity === 'critical'
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-yellow-500/20 text-yellow-400'
                      }`}
                    >
                      {e.severity}
                    </span>
                  </td>
                  <td className="p-3 max-w-md truncate" title={e.error_message}>
                    {e.error_message}
                  </td>
                  <td className="p-3 text-[var(--muted)] text-xs">{e.fallback_used ?? '—'}</td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-[var(--muted)]">
                    No matching error records. This does not prove system health; see readiness evidence above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
