'use client';

import { useEffect, useRef, useState } from 'react';
import { Terminal, Sun, Moon } from 'lucide-react';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { useThemeStore } from '@/store/useThemeStore';
import { OutOfActionsModal } from '@/components/billing/OutOfActionsModal';
import { AiResponseLoader } from '@/components/ui/Uiverse';
import { cn } from '@/lib/utils';

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

const AGENT_STYLES: Record<string, string> = {
  architect: 'text-[var(--primary)]',
  builder: 'text-[var(--accent)]',
  reviewer: 'text-[var(--warning)]',
  qa: 'text-[var(--muted)]',
  truth_council: 'text-[var(--foreground)]',
  complete: 'text-[var(--foreground)]',
};

interface SwarmMessageLogProps {
  compact?: boolean;
}

export function SwarmMessageLog({ compact }: SwarmMessageLogProps) {
  const { messages, loading, animatingId, outOfActionsOpen, setOutOfActionsOpen } = useTerminalChat();
  const theme = useThemeStore((s) => s.theme);
  const terminalColorMode = useThemeStore((s) => s.terminalColorMode);
  const toggleTerminalColorMode = useThemeStore((s) => s.toggleTerminalColorMode);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const isDay = terminalColorMode === 'day';

  return (
    <>
      <div
        className={cn(
          'terminal-log rounded-xl relative overflow-hidden scanlines',
          isDay ? 'terminal-log-day' : 'terminal-log-night',
          theme === 'white' && isDay && 'terminal-log-white',
          theme === 'image' && 'terminal-log-image',
          compact ? '' : 'w-full'
        )}
      >
        <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--card-border)]/30">
          <Terminal className="w-4 h-4 opacity-70" />
          <h3 className="font-terminal text-sm opacity-80 flex-1">xroga@swarm ~ terminal</h3>
          <button
            type="button"
            onClick={toggleTerminalColorMode}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            title={isDay ? 'Switch to night terminal' : 'Switch to day terminal'}
            aria-label={isDay ? 'Night mode' : 'Day mode'}
          >
            {isDay ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
          </button>
        </div>

        <div className="px-4 py-3 space-y-2 font-terminal text-[13px]">
          {messages.length === 0 && !loading && (
            <p className="text-[var(--muted)] text-center py-6">
              <span className="opacity-70">&gt;</span> Ask Xroga to build anything…
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
                <span className="inline-block px-3 py-1.5 rounded-lg bg-white/10">
                  <span className="opacity-60 mr-2">&gt;</span>
                  {msg.content}
                </span>
              ) : msg.role === 'system' ? (
                <p className="py-0.5">{msg.content}</p>
              ) : (
                <p className="py-1 whitespace-pre-wrap">
                  <TypewriterMessage
                    content={msg.content}
                    animate={msg.id === animatingId && loading}
                  />
                </p>
              )}
            </div>
          ))}
          {loading && messages[messages.length - 1]?.role !== 'assistant' && (
            <div className="flex justify-center py-4">
              <AiResponseLoader word="Generating" />
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>
      <OutOfActionsModal open={outOfActionsOpen} onClose={() => setOutOfActionsOpen(false)} />
    </>
  );
}
