'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { streamSwarmExecute, ApiError } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';
import toast from 'react-hot-toast';
import { Send, Loader2, Bot, User, Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { OutOfActionsModal } from '@/components/billing/OutOfActionsModal';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface SwarmChatProps {
  projectId?: string;
}

export function SwarmChat({ projectId }: SwarmChatProps) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [swarmStatus, setSwarmStatus] = useState<string | null>(null);
  const [outOfActionsOpen, setOutOfActionsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const chatPrefill = useAppStore((s) => s.chatPrefill);
  const setChatPrefill = useAppStore((s) => s.setChatPrefill);
  const setSwarmRunning = useAppStore((s) => s.setSwarmRunning);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatPrefill) {
      setPrompt(chatPrefill);
      setChatPrefill('');
    }
  }, [chatPrefill, setChatPrefill]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, swarmStatus]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = prompt.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text };
    const assistantId = crypto.randomUUID();
    setMessages((m) => [...m, userMsg]);
    setPrompt('');
    setLoading(true);
    setSwarmRunning(true);
    setSwarmStatus('Swarm engaged...');

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Please sign in to chat.');

      setMessages((m) => [...m, { id: assistantId, role: 'assistant', content: '' }]);

      await streamSwarmExecute(text, {
        projectId,
        onProgress: (event) => {
          const agent = event.agent ? event.agent.replace(/_/g, ' ') : 'Swarm';
          const label = event.message ?? event.status ?? 'working';
          setSwarmStatus(`${agent}: ${label}`);
        },
        onDelta: (delta) => {
          setMessages((m) =>
            m.map((msg) =>
              msg.id === assistantId ? { ...msg, content: msg.content + delta } : msg
            )
          );
        },
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setOutOfActionsOpen(true);
        setMessages((m) => {
          const withoutEmpty = m.filter((msg) => msg.id !== assistantId || msg.content.length > 0);
          return withoutEmpty;
        });
        return;
      }
      const message = (err as Error).message;
      toast.error(message);
      setMessages((m) => {
        const withoutEmpty = m.filter((msg) => msg.id !== assistantId || msg.content.length > 0);
        return [
          ...withoutEmpty,
          { id: crypto.randomUUID(), role: 'assistant', content: `⚠️ ${message}` },
        ];
      });
    } finally {
      setLoading(false);
      setSwarmRunning(false);
      setSwarmStatus(null);
    }
  }

  return (
    <>
    <div className="glass-panel-strong rounded-xl p-5 flex flex-col relative overflow-hidden scanlines">
      <div className="flex items-center gap-2 mb-1">
        <Terminal className="w-4 h-4 text-[var(--accent)]" />
        <h3 className="font-semibold font-terminal">xroga@swarm ~ command</h3>
      </div>
      <p className="text-xs text-[var(--muted)] mb-4 font-terminal">
        &gt; Natural language in, flawless output out. 1 action per command.
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
                'max-w-[85%] px-3 py-2 rounded-lg whitespace-pre-wrap font-terminal text-[13px]',
                msg.role === 'user'
                  ? 'bg-[var(--primary)]/30 border border-[var(--primary)]/40 text-white'
                  : 'glass-panel border-[var(--accent)]/20'
              )}
            >
              {msg.content || (loading && msg.role === 'assistant' ? (
                <span className="inline-flex items-center gap-1 text-violet-300">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Thinking...
                </span>
              ) : null)}
            </div>
            {msg.role === 'user' && (
              <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                <User className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}
        {loading && swarmStatus && (
          <p className="text-xs text-violet-300/80 text-center">{swarmStatus}</p>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 font-terminal">
        <div className="flex-1 relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--accent)] text-sm">&gt;</span>
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ask Xroga to do anything..."
            disabled={loading}
            className="w-full pl-7 pr-4 py-2.5 rounded-lg glass-panel focus:border-[var(--accent)]/50 focus:outline-none text-sm font-terminal"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !prompt.trim()}
          className="px-4 py-2.5 rounded-lg bg-[var(--accent)] text-black hover:opacity-90 disabled:opacity-50 transition-colors font-semibold"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </form>
    </div>
    <OutOfActionsModal open={outOfActionsOpen} onClose={() => setOutOfActionsOpen(false)} />
    </>
  );
}
