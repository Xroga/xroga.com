'use client';

import { useEffect, useRef, useState } from 'react';
import { GitBranch, Paperclip, Send, ChevronDown, Loader2, ExternalLink, Plus } from 'lucide-react';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { useAppStore } from '@/store/useAppStore';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

export function TerminalChatBar() {
  const { prompt, setPrompt, loading, submit } = useTerminalChat();
  const actions = useAppStore((s) => s.actions);
  const fileRef = useRef<HTMLInputElement>(null);
  const [githubOpen, setGithubOpen] = useState(false);
  const [githubUser, setGithubUser] = useState<string | null>(null);
  const [githubConnected, setGithubConnected] = useState(false);

  const remaining = actions?.remaining ?? 0;

  useEffect(() => {
    api.github
      .status()
      .then((s) => {
        setGithubConnected(s.connected);
        setGithubUser(s.username ?? null);
      })
      .catch(() => {
        setGithubConnected(false);
      });
  }, []);

  async function handleGithubConnect() {
    try {
      const { url } = await api.github.oauthUrl();
      window.location.href = url;
    } catch {
      window.location.href = '/dashboard/integrations';
    }
  }

  return (
    <div className="terminal-chatbar glass-panel-strong rounded-t-2xl border-t border-[var(--card-border)]">
      <div className="flex items-center justify-between px-4 py-1.5 text-[10px] sm:text-xs text-[var(--muted)] font-terminal border-b border-[var(--card-border)]/50">
        <span>
          ⚡ {remaining.toLocaleString()} actions left
          <span className="hidden sm:inline"> | 💡 1 action per chat</span>
        </span>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="flex items-center gap-2 p-3"
      >
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setGithubOpen(!githubOpen);
            }}
            className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg glass-panel text-xs font-terminal hover:border-[var(--accent)]/40 transition-colors max-w-[140px] sm:max-w-[180px]"
          >
            <GitBranch className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">
              {githubConnected ? githubUser ?? 'Connected' : 'GitHub'}
            </span>
            <ChevronDown className="w-3 h-3 shrink-0 opacity-60" />
          </button>
          {githubOpen && (
            <div
              className="absolute bottom-full left-0 mb-2 w-52 glass-panel-strong rounded-xl p-1.5 z-50 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              {!githubConnected ? (
                <button
                  type="button"
                  onClick={handleGithubConnect}
                  className="w-full text-left px-3 py-2 rounded-lg text-xs hover:bg-white/5 flex items-center gap-2"
                >
                  <Plus className="w-3.5 h-3.5" /> Connect GitHub
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setPrompt(prompt + (prompt ? '\n' : '') + '[Create new GitHub repo] ');
                      setGithubOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg text-xs hover:bg-white/5"
                  >
                    Create new repo
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPrompt(prompt + (prompt ? '\n' : '') + '[Push to existing repo] ');
                      setGithubOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg text-xs hover:bg-white/5"
                  >
                    Push to existing
                  </button>
                  <a
                    href={`https://github.com/${githubUser}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs hover:bg-white/5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> View on GitHub
                  </a>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 relative flex items-center min-w-0">
          <span className="absolute left-3 text-[var(--accent)] font-terminal text-sm">&gt;</span>
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ask Xroga to do anything..."
            disabled={loading}
            className={cn(
              'w-full pl-7 pr-20 py-2.5 rounded-xl bg-white/5 border border-transparent focus:border-[var(--accent)]/50 focus:outline-none text-sm font-terminal transition-all',
              !loading && !prompt && 'cursor-blink'
            )}
          />
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            multiple
            onChange={() => {
              setPrompt(prompt + (prompt ? '\n' : '') + '[Attached files] ');
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="absolute right-11 p-1.5 text-[var(--muted)] hover:text-[var(--accent)] transition-colors"
            aria-label="Upload"
          >
            <Paperclip className="w-4 h-4" />
          </button>
          <button
            type="submit"
            disabled={loading || !prompt.trim()}
            className="absolute right-2 p-2 rounded-lg bg-[var(--accent)] text-black hover:scale-105 active:scale-95 transition-transform disabled:opacity-40 send-pulse"
            aria-label="Send"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </form>
    </div>
  );
}
