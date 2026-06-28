'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  XCircle,
  Loader2,
  Monitor,
  Play,
  RefreshCw,
} from 'lucide-react';
import { api, type SwarmRunSummary } from '@/lib/api';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { useRouter } from 'next/navigation';
import { SectionSearchBar } from '@/components/ui/SectionSearchBar';
import { cn } from '@/lib/utils';

const RUNNING = new Set(['pending', 'planning', 'building', 'reviewing', 'testing', 'verifying']);
const FAILED = new Set(['failed', 'error']);
const BROWSER_KEYWORDS = /scrape|browser|automate|crawl|research|web search/i;

function isBrowserRun(prompt: string) {
  return BROWSER_KEYWORDS.test(prompt);
}

function StatusBadge({ status }: { status: string }) {
  if (RUNNING.has(status)) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">
        <Loader2 className="w-3 h-3 animate-spin" /> Running
      </span>
    );
  }
  if (FAILED.has(status)) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">
        <XCircle className="w-3 h-3" /> Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">
      <CheckCircle2 className="w-3 h-3" /> Done
    </span>
  );
}

export function AutomationView() {
  const [runs, setRuns] = useState<SwarmRunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'running' | 'failed' | 'browser'>('all');
  const [query, setQuery] = useState('');
  const { setPrompt } = useTerminalChat();
  const router = useRouter();

  async function load() {
    setLoading(true);
    try {
      const data = await api.swarm.history();
      setRuns(data);
    } catch {
      setRuns([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return runs.filter((r) => {
      if (filter === 'running' && !RUNNING.has(r.status)) return false;
      if (filter === 'failed' && !FAILED.has(r.status)) return false;
      if (filter === 'browser' && !isBrowserRun(r.prompt)) return false;
      if (q && !r.prompt.toLowerCase().includes(q) && !r.status.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [runs, filter, query]);

  const counts = useMemo(
    () => ({
      running: runs.filter((r) => RUNNING.has(r.status)).length,
      failed: runs.filter((r) => FAILED.has(r.status)).length,
      browser: runs.filter((r) => isBrowserRun(r.prompt)).length,
    }),
    [runs]
  );

  function continueRun(prompt: string) {
    setPrompt(prompt);
    router.push('/dashboard');
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="w-7 h-7 text-[var(--accent)]" />
            Automation
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Previous Swarm runs, browser automations, and tasks in progress.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-[var(--card-border)] hover:bg-white/5"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} /> Refresh
        </button>
      </div>

      <SectionSearchBar value={query} onChange={setQuery} placeholder="Search automations…" />

      <div className="grid grid-cols-3 gap-3">
        {[
          { key: 'running' as const, label: 'Running', count: counts.running, color: 'text-amber-400' },
          { key: 'failed' as const, label: 'Failed', count: counts.failed, color: 'text-red-400' },
          { key: 'browser' as const, label: 'Browser', count: counts.browser, color: 'text-[var(--accent)]' },
        ].map(({ key, label, count, color }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(filter === key ? 'all' : key)}
            className={cn(
              'glass-panel rounded-xl p-4 text-left transition-all',
              filter === key && 'ring-1 ring-[var(--accent)]/50'
            )}
          >
            <p className="text-xs text-[var(--muted)]">{label}</p>
            <p className={cn('text-2xl font-bold', color)}>{count}</p>
          </button>
        ))}
      </div>

      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--card-border)] text-sm font-semibold">
          {filter === 'all' ? 'All automations' : `Filtered: ${filter}`}
        </div>
        {loading && runs.length === 0 ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-[var(--muted)] text-center py-12 px-4">
            No automations yet. Run a scrape, automate, or research task from the dashboard terminal.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--card-border)]">
            {filtered.map((run) => (
              <li key={run.id} className="px-4 py-3 flex flex-wrap items-start gap-3 hover:bg-white/[0.02]">
                <div className="shrink-0 mt-0.5">
                  {isBrowserRun(run.prompt) ? (
                    <Monitor className="w-4 h-4 text-[var(--accent)]" />
                  ) : (
                    <Bot className="w-4 h-4 text-[var(--muted)]" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium line-clamp-2">{run.prompt}</p>
                  <p className="text-[10px] text-[var(--muted)] mt-1">
                    {new Date(run.created_at).toLocaleString()} · {run.status} · {run.iteration_count} iterations
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={run.status} />
                  <button
                    type="button"
                    onClick={() => continueRun(run.prompt)}
                    className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-[var(--accent)]/15 text-[var(--accent)] hover:bg-[var(--accent)]/25"
                  >
                    <Play className="w-3 h-3" /> Continue
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
