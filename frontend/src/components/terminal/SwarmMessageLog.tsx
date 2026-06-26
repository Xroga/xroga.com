'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Terminal } from 'lucide-react';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { OutOfActionsModal } from '@/components/billing/OutOfActionsModal';
import { cn } from '@/lib/utils';

const AGENT_STYLES: Record<string, string> = {
  architect: 'text-[var(--primary)]',
  builder: 'text-[var(--accent)]',
  reviewer: 'text-[var(--warning)]',
  qa: 'text-[var(--muted)]',
  truth_council: 'text-[var(--foreground)]',
  complete: 'text-[var(--foreground)]',
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
      {animate && displayed.length < content.length && <span className="cursor-blink" />}
    </span>
  );
}

interface SwarmMessageLogProps {
  compact?: boolean;
}

export function SwarmMessageLog({ compact }: SwarmMessageLogProps) {
  const { messages, loading, animatingId, outOfActionsOpen, setOutOfActionsOpen } = useTerminalChat();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  return (
    <>
      <div
        className={cn(
          'glass-panel-strong rounded-xl flex flex-col relative overflow-hidden scanlines',
          compact ? 'min-h-[200px]' : 'min-h-[320px] flex-1'
        )}
      >
        <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-[var(--card-border)] shrink-0">
          <Terminal className="w-4 h-4 text-[var(--accent)]" />
          <h3 className="font-terminal text-sm text-[var(--accent)]">xroga@swarm ~ terminal</h3>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 font-terminal text-[13px] min-h-[180px]">
          {messages.length === 0 && !loading && (
            <p className="text-[var(--muted)] text-center py-10">
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
              Swarm is thinking...
            </p>
          )}
          <div ref={bottomRef} />
        </div>
      </div>
      <OutOfActionsModal open={outOfActionsOpen} onClose={() => setOutOfActionsOpen(false)} />
    </>
  );
}
