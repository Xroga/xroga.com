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

export default function AdminPageClient() {
  const [errors, setErrors] = useState<SystemError[]>([]);
  const [filter, setFilter] = useState('');
  const [severity, setSeverity] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const params = new URLSearchParams({ limit: '100' });
      if (severity) params.set('severity', severity);
      if (filter) params.set('api', filter);

      const res = await fetch(`${API_URL}/api/admin/errors?${params}`, {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      const data = (await res.json()) as { errors: SystemError[] };
      setErrors(data.errors ?? []);
    } catch {
      setErrors([]);
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
                    No errors logged yet — system healthy
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
