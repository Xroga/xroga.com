'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { apiFetch } from '@/lib/utils';
import { Send, Loader2 } from 'lucide-react';

interface SwarmChatProps {
  projectId?: string;
}

export function SwarmChat({ projectId }: SwarmChatProps) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const data = await apiFetch('/api/swarm/execute', {
        method: 'POST',
        body: JSON.stringify({ prompt, projectId }),
      }, session.access_token);

      const swarmResult = data.result;
      setResult(
        swarmResult.success
          ? `✅ Zero Defects confirmed after ${swarmResult.iterations} iteration(s). ${swarmResult.defectsFound} defects resolved.`
          : `⚠️ Task incomplete after ${swarmResult.iterations} iteration(s).`
      );
      setPrompt('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5">
      <h3 className="font-semibold mb-1">Natural Language Command</h3>
      <p className="text-xs text-[var(--muted)] mb-4">
        Describe any task – the 5-agent Swarm will plan, build, review, test, and verify.
      </p>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Build a landing page for my startup..."
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

      {loading && (
        <div className="mt-4 space-y-2">
          {['Architect', 'Builder', 'Reviewer', 'QA Tester', 'Truth Council'].map((agent, i) => (
            <div key={agent} className="flex items-center gap-2 text-xs text-[var(--muted)]">
              <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" style={{ animationDelay: `${i * 200}ms` }} />
              {agent} working...
            </div>
          ))}
        </div>
      )}

      {result && <p className="mt-4 text-sm text-emerald-400">{result}</p>}
      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
    </div>
  );
}
