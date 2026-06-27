'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Paperclip, Mic, Send } from 'lucide-react';
import { PENDING_PROMPT_KEY } from '@/lib/constants';
import { cn } from '@/lib/utils';

export function HomepageChatBar() {
  const [prompt, setPrompt] = useState('');
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = prompt.trim();
    if (!text) return;
    localStorage.setItem(PENDING_PROMPT_KEY, text);
    router.push('/auth/signup');
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-3xl mx-auto px-0 sm:px-0">
      <div className="glass-panel rounded-2xl p-1 sm:p-1.5 glow-frozen border border-[var(--accent)]/20 focus-within:border-[var(--accent)]/50 transition-all duration-300">
        <div className="flex items-center gap-2 px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs text-[var(--muted)] font-terminal border-b border-[var(--card-border)]/50 mb-1">
          <span className="text-[var(--accent)]">⚡ 50 free actions</span>
          <span className="hidden xs:inline">•</span>
          <span className="hidden xs:inline">Swarm online</span>
        </div>
        <div className="relative flex items-center min-h-[44px]">
          <span className="absolute left-2 sm:left-4 text-[var(--accent)] font-terminal text-sm">&gt;</span>
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ask XROGA anything..."
            className={cn(
              'flex-1 bg-transparent pl-6 sm:pl-8 pr-[4.5rem] sm:pr-28 py-3 text-sm font-terminal focus:outline-none placeholder:text-[var(--muted)] text-[var(--foreground)] min-w-0',
              !prompt && 'cursor-blink'
            )}
          />
          <div className="absolute right-11 sm:right-14 flex items-center gap-0.5 sm:gap-2 text-[var(--muted)]">
            <button type="button" className="p-1 sm:p-1.5 hover:text-[var(--accent)] transition-colors hidden sm:block" aria-label="Attach">
              <Paperclip className="w-4 h-4" />
            </button>
            <button type="button" className="p-1 sm:p-1.5 hover:text-[var(--accent)] transition-colors hidden sm:block" aria-label="Voice">
              <Mic className="w-4 h-4" />
            </button>
          </div>
          <button
            type="submit"
            disabled={!prompt.trim()}
            className="absolute right-1.5 sm:right-2 p-2 sm:p-2.5 rounded-xl bg-[var(--accent)] text-[var(--background)] hover:scale-105 active:scale-95 transition-transform disabled:opacity-40 send-pulse"
            aria-label="Send"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </form>
  );
}
