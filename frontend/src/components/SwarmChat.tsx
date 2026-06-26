'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { streamSwarmExecute, ApiError } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';
import toast from 'react-hot-toast';
import { Send, Loader2, Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { OutOfActionsModal } from '@/components/billing/OutOfActionsModal';

type MessageRole = 'user' | 'assistant' | 'system';

interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  agent?: string;
}

const AGENT_STYLES: Record<string, string> = {
  architect: 'text-[var(--primary)]',
  builder: 'text-[var(--accent)]',
  reviewer: 'text-[var(--warning)]',
  qa: 'text-amber-300',
  truth_council: 'text-emerald-400',
  complete: 'text-white',
};

const AGENT_ICONS: Record<string, string> = {
  architect: '🧠',
  builder: '⚙️',
  reviewer: '🔍',
  qa: '🧪',
  truth_council: '✅',
  complete: '🎉',
};

function useTypewriter(text: string, active: boolean, speed = 12) {
  const [displayed, setDisplayed] = useState('');

  useEffect(() => {
    if (!active) {
      setDisplayed(text);
      return;
    }
    setDisplayed('');
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) clearInterval(timer);
    }, speed);
    return () => clearInterval(timer);
  }, [text, active, speed]);

  return displayed;
}

function TypewriterMessage({ content, animate }: { content: string; animate: boolean }) {
  const displayed = useTypewriter(content, animate);
  return (
    <span>
      {displayed}
      {animate && displayed.length < content.length && (
        <span className="cursor-blink" />
      )}
    </span>
  );
}

interface SwarmChatProps {
  projectId?: string;
}

export function SwarmChat({ projectId }: SwarmChatProps) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [outOfActionsOpen, setOutOfActionsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [animatingId, setAnimatingId] = useState<string | null>(null);
  const chatPrefill = useAppStore((s) => s.chatPrefill);
  const setChatPrefill = useAppStore((s) => s.setChatPrefill);
  const setSwarmRunning = useAppStore((s) => s.setSwarmRunning);
  const bottomRef = useRef<HTMLDivElement>(null);

  const addProgress = useCallback((agent: string, message: string) => {
    const key = agent.toLowerCase().replace(/\s/g, '_');
    const icon = AGENT_ICONS[key] ?? '•';
    setMessages((m) => [
      ...m,
      {
        id: crypto.randomUUID(),
        role: 'system',
        agent: key,
        content: `${icon} ${agent.charAt(0).toUpperCase() + agent.slice(1)}: ${message}`,
      },
    ]);
  }, []);

  useEffect(() => {
    if (chatPrefill) {
      setPrompt(chatPrefill);
      setChatPrefill('');
    }
  }, [chatPrefill, setChatPrefill]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = prompt.trim();
    if (!text || loading) return;

    setMessages((m) => [...m, { id: crypto.randomUUID(), role: 'user', content: text }]);
    setPrompt('');
    setLoading(true);
    setSwarmRunning(true);

    const assistantId = crypto.randomUUID();

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Please sign in to chat.');

      addProgress('architect', 'Swarm engaged — planning...');

      setMessages((m) => [...m, { id: assistantId, role: 'assistant', content: '' }]);
      setAnimatingId(assistantId);

      let fullReply = '';

      await streamSwarmExecute(text, {
        projectId,
        onProgress: (event) => {
          const label = event.message ?? event.status ?? 'working';
          if (event.agent) {
            addProgress(event.agent, label);
          }
        },
        onDelta: (delta) => {
          fullReply += delta;
          setMessages((m) =>
            m.map((msg) =>
              msg.id === assistantId ? { ...msg, content: msg.content + delta } : msg
            )
          );
        },
      });

      if (fullReply) {
        addProgress('complete', fullReply.slice(0, 80) + (fullReply.length > 80 ? '…' : ''));
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setOutOfActionsOpen(true);
        setMessages((m) => m.filter((msg) => msg.id !== assistantId || msg.content.length > 0));
        return;
      }
      const message = (err as Error).message;
      toast.error(message);
      setMessages((m) => [
        ...m.filter((msg) => msg.id !== assistantId || msg.content.length > 0),
        { id: crypto.randomUUID(), role: 'assistant', content: `⚠️ ${message}` },
      ]);
    } finally {
      setLoading(false);
      setSwarmRunning(false);
      setAnimatingId(null);
    }
  }

  return (
    <>
      <div className="glass-panel-strong rounded-xl flex flex-col relative overflow-hidden scanlines min-h-[420px]">
        <div className="flex items-center gap-2 px-5 pt-4 pb-2 border-b border-[var(--card-border)]">
          <Terminal className="w-4 h-4 text-[var(--accent)]" />
          <h3 className="font-terminal text-sm text-[var(--accent)]">xroga@swarm ~ terminal</h3>
          <span className="ml-auto text-xs text-[var(--muted)] font-terminal">1 action / command</span>
        </div>

        <div className="flex-1 min-h-[280px] max-h-[480px] overflow-y-auto px-5 py-4 space-y-2 font-terminal text-[13px]">
          {messages.length === 0 && !loading && (
            <p className="text-[var(--muted)] text-center py-12">
              <span className="text-[var(--accent)]">&gt;</span> Ask Xroga to build anything…
            </p>
          )}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                msg.role === 'user' && 'text-right',
                msg.role === 'system' && (AGENT_STYLES[msg.agent ?? ''] ?? 'text-[var(--muted)]')
              )}
            >
              {msg.role === 'user' ? (
                <span className="inline-block px-3 py-1.5 rounded-lg bg-[var(--primary)]/25 border border-[var(--primary)]/30">
                  <span className="text-[var(--accent)] mr-2">&gt;</span>
                  {msg.content}
                </span>
              ) : msg.role === 'system' ? (
                <p className="py-0.5">{msg.content}</p>
              ) : (
                <p className="py-1 whitespace-pre-wrap text-[var(--foreground)]">
                  <TypewriterMessage
                    content={msg.content}
                    animate={msg.id === animatingId && loading}
                  />
                </p>
              )}
            </div>
          ))}
          {loading && messages[messages.length - 1]?.role !== 'assistant' && (
            <p className="text-[var(--accent)] flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              Swarm processing…
            </p>
          )}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2 p-4 border-t border-[var(--card-border)] font-terminal">
          <div className="flex-1 relative flex items-center">
            <span className="absolute left-3 text-[var(--accent)]">&gt;</span>
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ask Xroga to do anything..."
              disabled={loading}
              className={cn(
                'w-full pl-8 pr-4 py-3 rounded-lg glass-panel focus:border-[var(--accent)]/50 focus:outline-none text-sm font-terminal',
                !loading && !prompt && 'cursor-blink'
              )}
            />
          </div>
          <button
            type="submit"
            disabled={loading || !prompt.trim()}
            className="px-4 py-3 rounded-lg bg-[var(--accent)] text-black hover:opacity-90 disabled:opacity-50 font-semibold"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </form>
      </div>
      <OutOfActionsModal open={outOfActionsOpen} onClose={() => setOutOfActionsOpen(false)} />
    </>
  );
}
