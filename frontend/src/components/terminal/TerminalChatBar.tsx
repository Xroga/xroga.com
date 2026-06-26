'use client';

import { useRef } from 'react';
import { Paperclip, Send, Loader2, Maximize2 } from 'lucide-react';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { ChatIntegrationsBar } from './ChatIntegrationsBar';
import { ActionCostPanel } from './ActionCostPanel';
import { cn } from '@/lib/utils';

interface TerminalChatBarProps {
  onFullscreen?: () => void;
}

export function TerminalChatBar({ onFullscreen }: TerminalChatBarProps) {
  const { prompt, setPrompt, loading, submit } = useTerminalChat();
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div
      className={cn(
        'terminal-chatbar rounded-2xl overflow-hidden',
        'bg-transparent backdrop-blur-2xl',
        'border border-[var(--card-border)]/40',
        'shadow-[0_-8px_40px_rgba(0,0,0,0.35),0_0_60px_rgba(74,122,255,0.08)]',
        'animate-in fade-in slide-in-from-bottom-2 duration-300'
      )}
    >
      <ChatIntegrationsBar
        onSelect={(suffix) => setPrompt(prompt + (prompt ? '\n' : '') + suffix)}
      />

      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--card-border)]/20">
        <ActionCostPanel />
        {onFullscreen && (
          <button
            type="button"
            onClick={onFullscreen}
            className="p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-white/5 transition-colors"
            title="Fullscreen terminal"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="flex items-center gap-2 p-3"
      >
        <div className="flex-1 relative flex items-center min-w-0 group">
          <span className="absolute left-3 text-[var(--accent)] font-terminal text-sm opacity-80 group-focus-within:opacity-100 transition-opacity">
            &gt;
          </span>
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ask Xroga to do anything..."
            disabled={loading}
            className={cn(
              'w-full pl-8 pr-20 py-3 rounded-xl',
              'bg-white/[0.03] border border-transparent',
              'focus:border-[var(--accent)]/40 focus:bg-white/[0.06] focus:outline-none',
              'focus:shadow-[0_0_20px_rgba(0,212,255,0.15)]',
              'text-sm font-terminal transition-all duration-300',
              !loading && !prompt && 'cursor-blink'
            )}
          />
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            multiple
            accept="image/*,video/*,.pdf"
            onChange={() => {
              setPrompt(prompt + (prompt ? '\n' : '') + '[Attached files] ');
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="absolute right-12 p-1.5 text-[var(--muted)] hover:text-[var(--accent)] transition-all hover:scale-110"
            aria-label="Upload"
          >
            <Paperclip className="w-4 h-4" />
          </button>
          <button
            type="submit"
            disabled={loading || !prompt.trim()}
            className={cn(
              'absolute right-2 p-2.5 rounded-xl',
              'bg-[var(--accent)] text-black',
              'hover:scale-105 active:scale-95',
              'disabled:opacity-30 disabled:scale-100',
              'transition-all duration-200 send-pulse',
              'shadow-[0_0_16px_rgba(0,212,255,0.35)]'
            )}
            aria-label="Send"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </form>
    </div>
  );
}
