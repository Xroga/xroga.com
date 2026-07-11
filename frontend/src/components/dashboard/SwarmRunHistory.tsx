'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, type SwarmRunSummary } from '@/lib/api';
import { swarmOutputToText } from '@/lib/swarm';
import { messagesFromSwarmRun } from '@/lib/swarmRunRestore';
import { Bot, Loader2 } from 'lucide-react';
import { UiverseTableCard } from '@/components/ui/UiverseTableCard';
import { SectionRowActions, copyText, downloadText } from '@/components/ui/SectionRowActions';
import { chatTableRows } from '@/lib/tableRows';
import { getItemMeta, markItemDeleted, markItemSeen } from '@/lib/itemMeta';
import { resumeToDashboard } from '@/lib/workspacePersistence';
import { useTerminalChat } from '@/context/TerminalChatContext';
import toast from 'react-hot-toast';

export function SwarmRunHistory({ search = '' }: { search?: string }) {
  const [runs, setRuns] = useState<SwarmRunSummary[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const router = useRouter();
  const { setPrompt } = useTerminalChat();

  useEffect(() => {
    api.swarm.history()
      .then(setRuns)
      .catch(() => setRuns([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return runs.filter((run) => {
      if (hidden.has(run.id)) return false;
      if (!q) return true;
      const output = run.output as { output?: unknown } | null;
      const text = swarmOutputToText(output?.output ?? output);
      return (
        run.prompt.toLowerCase().includes(q) ||
        text.toLowerCase().includes(q) ||
        run.status.toLowerCase().includes(q)
      );
    });
  }, [runs, search, hidden]);

  async function openInDashboard(run: SwarmRunSummary) {
    markItemSeen(run.id);
    setSelectedId(run.id);
    setOpeningId(run.id);
    try {
      let fullRun = run;
      try {
        fullRun = await api.swarm.getRun(run.id);
      } catch {
        /* use list payload */
      }
      const messages = messagesFromSwarmRun(fullRun);
      setPrompt(run.prompt);
      resumeToDashboard({
        prompt: run.prompt,
        messages,
        selectedId: run.id,
        selectedLabel: run.prompt.slice(0, 40),
        source: 'chats',
      });
      router.push('/dashboard');
      toast.success('Conversation restored');
    } finally {
      setOpeningId(null);
    }
  }

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

  if (filtered.length === 0) {
    return (
      <div className="p-10 text-center">
        <p className="text-sm text-[var(--muted)]">No results for &ldquo;{search}&rdquo;</p>
      </div>
    );
  }

  return (
    <div className="grid sm:grid-cols-2 gap-4 p-4">
      {filtered.map((run) => {
        const output = run.output as { output?: unknown } | null;
        const text = swarmOutputToText(output?.output ?? output);
        const meta = getItemMeta(run.id);
        return (
          <div key={run.id} className="space-y-2">
            <UiverseTableCard
              title={run.prompt.slice(0, 36) || 'chat'}
              rows={chatTableRows(run, meta)}
              selected={selectedId === run.id}
              onClick={() => void openInDashboard(run)}
            />
            <SectionRowActions
              onEdit={() => void openInDashboard(run)}
              onCopy={() => void copyText(run.prompt, 'Prompt copied')}
              onDownload={() =>
                downloadText(`xroga-chat-${run.id}.txt`, `${run.prompt}\n\n---\n\n${text}`)
              }
              onDelete={() => {
                markItemDeleted(run.id);
                setHidden((h) => new Set(h).add(run.id));
                toast.success('Removed from list');
              }}
            />
            {openingId === run.id && (
              <p className="text-[10px] text-[var(--muted)] flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Restoring conversation…
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
