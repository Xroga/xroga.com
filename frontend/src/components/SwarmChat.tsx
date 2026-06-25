'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { API_URL } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Send, Loader2 } from 'lucide-react';

interface SwarmChatProps {
  projectId?: string;
}

export function SwarmChat({ projectId }: SwarmChatProps) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);
  const chatPrefill = useAppStore((s) => s.chatPrefill);
  const setChatPrefill = useAppStore((s) => s.setChatPrefill);
  const setSwarmRunning = useAppStore((s) => s.setSwarmRunning);
  const setActions = useAppStore((s) => s.setActions);
  const router = useRouter();

  useEffect(() => {
    if (chatPrefill) {
      setPrompt(chatPrefill);
      setChatPrefill('');
    }
  }, [chatPrefill, setChatPrefill]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || loading) return;

    setLoading(true);
    setProgress([]);
    setSwarmRunning(true);

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await fetch(`${API_URL}/api/swarm/execute?stream=true`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({ prompt, projectId }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Request failed');
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalMessage = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6)) as Record<string, unknown>;
                if (data.agent && data.status) {
                  setProgress((p) => [...p, `${data.agent}: ${data.status}`]);
                }
                if (data.success !== undefined) {
                  finalMessage = data.success
                    ? `✅ Task completed (${String(data.featureCategory ?? 'task')})`
                    : '⚠️ Task incomplete';
                }
              } catch {
                // skip malformed SSE
              }
            }
          }
        }
      }

      toast.success(finalMessage || 'Task submitted');
      setPrompt('');
      try {
        const balance = await import('@/lib/api').then((m) => m.api.actions.balance());
        setActions(balance);
      } catch { /* ignore */ }
      if (!projectId) router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
      setSwarmRunning(false);
      setProgress([]);
    }
  }

  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5">
      <h3 className="font-semibold mb-1">Natural Language Command</h3>
      <p className="text-xs text-[var(--muted)] mb-4">
        Describe any task — the 5-agent Swarm will plan, build, review, test, and verify.
      </p>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Build a fitness coach landing page..."
          disabled={loading}
          className="flex-1 px-4 py-2.5 rounded-lg bg-white/5 border border-[var(--card-border)] focus:border-violet-500 focus:outline-none text-sm"
        />
        <button
          type="submit"
          disabled={loading || !prompt.trim()}
          className="px-4 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 transition-colors"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </form>

      {loading && progress.length > 0 && (
        <div className="mt-4 space-y-1">
          {progress.slice(-5).map((p, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-[var(--muted)]">
              <div className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
              {p}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
