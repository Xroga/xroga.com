'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type SwarmRunSummary } from '@/lib/api';
import { swarmOutputToText } from '@/lib/swarm';
import { formatDistanceToNow } from 'date-fns';
import { Bot, Loader2 } from 'lucide-react';

export function SwarmRunHistory() {
  const [runs, setRuns] = useState<SwarmRunSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.swarm.history()
      .then(setRuns)
      .catch(() => setRuns([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="glass-panel rounded-xl p-8 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" />
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="p-10 text-center">
        <Bot className="w-12 h-12 mx-auto text-[var(--accent)]/40 mb-4" />
        <p className="font-medium mb-1">No Swarm runs yet</p>
        <p className="text-sm text-[var(--muted)] mb-6">Send a command from the dashboard terminal to see history here.</p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--background)] text-sm font-semibold"
        >
          Open Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {runs.map((run) => {
        const output = run.output as { output?: unknown } | null;
        const text = swarmOutputToText(output?.output ?? output);
        return (
          <div key={run.id} className="glass-panel rounded-xl p-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-[var(--accent)]/20 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-[var(--accent)]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{run.prompt}</p>
                <p className="text-xs text-[var(--muted)] mt-1 line-clamp-2">{text}</p>
                <div className="flex items-center gap-3 mt-2 text-xs text-[var(--muted)]">
                  <span className={run.status === 'completed' ? 'text-[var(--accent)]' : ''}>
                    {run.status}
                  </span>
                  <span>{formatDistanceToNow(new Date(run.created_at), { addSuffix: true })}</span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
      <Link href="/dashboard" className="block text-center text-sm text-[var(--accent)] hover:underline">
        Run a new command →
      </Link>
    </div>
  );
}
