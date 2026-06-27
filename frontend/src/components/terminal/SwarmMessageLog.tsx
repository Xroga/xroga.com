'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Terminal, Palette } from 'lucide-react';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { useThemeStore } from '@/store/useThemeStore';
import { useAppStore } from '@/store/useAppStore';
import { OutOfActionsModal } from '@/components/billing/OutOfActionsModal';
import { AiResponseLoader } from '@/components/ui/Uiverse';
import { BrowserPanelToggle } from './BrowserPanel';
import { AI_RESPONSE_LOGO_URL } from '@/lib/theme';
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

const SKIN_LABELS: Record<string, string> = {
  light: 'White',
  amoled: 'Black',
  gray: 'Gray',
  dark: 'Black',
  'light-grid': 'White',
};

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
  const terminalSkin = useThemeStore((s) => s.terminalSkin);
  const cycleTerminalSkin = useThemeStore((s) => s.cycleTerminalSkin);
  const profile = useAppStore((s) => s.profile);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const avatarUrl = profile?.avatar_url;
  const displayInitial = profile?.display_name?.charAt(0)?.toUpperCase() ?? 'U';

  return (
    <>
      <div
        className={cn(
          'terminal-log rounded-xl relative overflow-hidden',
          `terminal-skin-${terminalSkin}`,
          terminalSkin === 'dark' || terminalSkin === 'amoled' ? 'scanlines' : '',
          compact ? '' : 'w-full'
        )}
      >
        <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--card-border)]/30">
          <Terminal className="w-4 h-4 opacity-70" />
          <h3 className="font-terminal text-sm opacity-80 flex-1">xroga@swarm ~ terminal</h3>
          <BrowserPanelToggle />
          <button
            type="button"
            onClick={cycleTerminalSkin}
            className="flex items-center gap-1 p-1.5 rounded-lg hover:bg-white/10 transition-colors text-[10px] font-terminal"
            title="Cycle terminal colors"
          >
            <Palette className="w-3.5 h-3.5" />
            <span className="hidden sm:inline opacity-70">{SKIN_LABELS[terminalSkin] ?? terminalSkin}</span>
          </button>
        </div>

        <div className="px-4 py-3 space-y-3 font-terminal text-[13px]">
          {messages.length === 0 && !loading && (
            <p className="text-[var(--muted)] text-center py-6">
              <span className="opacity-70">&gt;</span> Ask Xroga to build anything…
            </p>
          )}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                'flex gap-2',
                msg.role === 'user' ? 'flex-row-reverse' : 'flex-row',
                msg.role === 'system' && 'justify-center'
              )}
            >
              {msg.role === 'user' && (
                <div className="w-7 h-7 rounded-full border border-[var(--card-border)] overflow-hidden shrink-0 flex items-center justify-center bg-[var(--accent)]/10 text-[10px] font-bold">
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    displayInitial
                  )}
                </div>
              )}
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 bg-white/10 flex items-center justify-center">
                  <Image src={AI_RESPONSE_LOGO_URL} alt="Xroga" width={22} height={22} unoptimized className="object-contain" />
                </div>
              )}
              <div
                className={cn(
                  'min-w-0 max-w-[85%]',
                  msg.role === 'user' && 'text-right',
                  msg.role === 'system' && (AGENT_STYLES[msg.agent ?? ''] ?? 'text-[var(--muted)] text-center max-w-full')
                )}
              >
                {msg.role === 'user' ? (
                  <span className="inline-block px-3 py-1.5 rounded-lg bg-white/10 text-left">
                    <span className="opacity-60 mr-2">&gt;</span>
                    {msg.content}
                  </span>
                ) : msg.role === 'system' ? (
                  <p className="py-0.5 text-xs">{msg.content}</p>
                ) : (
                  <p className="py-1 whitespace-pre-wrap text-left">
                    <TypewriterMessage
                      content={msg.content}
                      animate={msg.id === animatingId && loading}
                    />
                  </p>
                )}
              </div>
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
