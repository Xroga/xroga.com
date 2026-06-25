'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { API_URL } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';
import toast from 'react-hot-toast';
import { Send, Loader2, Bot, User } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface SwarmChatProps {
  projectId?: string;
}

function extractChatContent(output: unknown): string | null {
  if (!output || typeof output !== 'object') return null;
  const o = output as Record<string, unknown>;
  if (o.type === 'chat' && typeof o.content === 'string') return o.content;
  if (typeof o.content === 'string') return o.content;
  if (typeof o.message === 'string') return o.message;
  return null;
}

export function SwarmChat({ projectId }: SwarmChatProps) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const chatPrefill = useAppStore((s) => s.chatPrefill);
  const setChatPrefill = useAppStore((s) => s.setChatPrefill);
  const setSwarmRunning = useAppStore((s) => s.setSwarmRunning);
  const setActions = useAppStore((s) => s.setActions);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatPrefill) {
      setPrompt(chatPrefill);
      setChatPrefill('');
    }
  }, [chatPrefill, setChatPrefill]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, status]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = prompt.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text };
    setMessages((m) => [...m, userMsg]);
    setPrompt('');
    setLoading(true);
    setStatus('Connecting to Swarm...');
    setSwarmRunning(true);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    try {
      const supabase = createClient();
      const { data: { session: initial } } = await supabase.auth.getSession();
      let session = initial;
      if (session?.expires_at && session.expires_at * 1000 < Date.now() + 60_000) {
        const { data: { session: refreshed } } = await supabase.auth.refreshSession();
        session = refreshed ?? session;
      }
      if (!session) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Please sign in to use the Swarm.');
        const { data: { session: s2 } } = await supabase.auth.getSession();
        session = s2;
      }
      if (!session?.access_token) throw new Error('Please sign in to use the Swarm.');

      const res = await fetch(`${API_URL}/api/swarm/execute?stream=true`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({ prompt: text, projectId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        if (res.status === 402) {
          throw new Error('Out of Actions — subscribe at /pricing to continue.');
        }
        throw new Error(typeof err.error === 'string' ? err.error : 'Request failed');
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let buffer = '';
      let assistantContent = '';
      let currentEvent = 'message';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
            continue;
          }
          if (!line.startsWith('data: ')) continue;

          try {
            const data = JSON.parse(line.slice(6)) as Record<string, unknown>;

            if (currentEvent === 'error' || data.code === 'OUT_OF_ACTIONS') {
              throw new Error(String(data.error ?? 'Swarm error'));
            }

            if (currentEvent === 'start') {
              setStatus('Swarm initialized...');
            }

            if (currentEvent === 'progress' && data.agent && data.status) {
              setStatus(`${String(data.agent)}: ${String(data.message ?? data.status)}`);
            }

            if (currentEvent === 'complete') {
              const fromOutput = extractChatContent(data.output);
              if (fromOutput) {
                assistantContent = fromOutput;
              } else if (data.success) {
                assistantContent = `Task completed (${String(data.featureCategory ?? 'task')}).`;
              } else {
                assistantContent = 'Task could not be completed. Please try again.';
              }
            }

            // Legacy flat SSE format
            if (!currentEvent || currentEvent === 'message') {
              if (data.agent && data.status) {
                setStatus(`${String(data.agent)}: ${String(data.message ?? data.status)}`);
              }
              const legacy = extractChatContent(data.output);
              if (legacy) assistantContent = legacy;
              if (data.success !== undefined && !assistantContent) {
                assistantContent = data.success
                  ? `Done (${String(data.featureCategory ?? 'task')}).`
                  : 'Task incomplete.';
              }
            }
          } catch (parseErr) {
            if (parseErr instanceof Error && parseErr.message !== 'Unexpected end of JSON input') {
              throw parseErr;
            }
          }
        }
      }

      if (assistantContent) {
        setMessages((m) => [
          ...m,
          { id: crypto.randomUUID(), role: 'assistant', content: assistantContent },
        ]);
      } else {
        setMessages((m) => [
          ...m,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: 'I processed your request but no text response was returned. Please try again.',
          },
        ]);
      }

      try {
        const balance = await import('@/lib/api').then((mod) => mod.api.actions.balance());
        setActions(balance);
      } catch {
        // non-fatal
      }
    } catch (err) {
      const message = (err as Error).name === 'AbortError'
        ? 'Request timed out — the API may be waking up. Try again in a few seconds.'
        : (err as Error).message;
      toast.error(message);
      setMessages((m) => [
        ...m,
        { id: crypto.randomUUID(), role: 'assistant', content: `⚠️ ${message}` },
      ]);
    } finally {
      clearTimeout(timeout);
      setLoading(false);
      setSwarmRunning(false);
      setStatus('');
    }
  }

  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 flex flex-col">
      <h3 className="font-semibold mb-1">Natural Language Command</h3>
      <p className="text-xs text-[var(--muted)] mb-4">
        Say hello or describe any task — the Swarm responds in seconds.
      </p>

      <div className="flex-1 min-h-[200px] max-h-[400px] overflow-y-auto space-y-3 mb-4 pr-1">
        {messages.length === 0 && !loading && (
          <p className="text-sm text-[var(--muted)] text-center py-8">
            Try &quot;Hello&quot; or &quot;Build a landing page for my startup&quot;
          </p>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              'flex gap-2 text-sm',
              msg.role === 'user' ? 'justify-end' : 'justify-start'
            )}
          >
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 rounded-full bg-violet-600/30 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-violet-300" />
              </div>
            )}
            <div
              className={cn(
                'max-w-[85%] px-3 py-2 rounded-lg whitespace-pre-wrap',
                msg.role === 'user'
                  ? 'bg-violet-600 text-white'
                  : 'bg-white/5 border border-[var(--card-border)]'
              )}
            >
              {msg.content}
            </div>
            {msg.role === 'user' && (
              <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                <User className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-xs text-violet-300">
            <Loader2 className="w-4 h-4 animate-spin" />
            {status || 'Thinking...'}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Say hello or describe a task..."
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
    </div>
  );
}
