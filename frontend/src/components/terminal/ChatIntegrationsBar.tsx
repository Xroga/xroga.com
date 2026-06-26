'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  GitBranch,
  Search,
  Plus,
  ChevronDown,
  ExternalLink,
  Plug,
} from 'lucide-react';
import { api } from '@/lib/api';
import { INTEGRATIONS } from '@/lib/integrations';
import { cn } from '@/lib/utils';

const CHAT_INTEGRATIONS = INTEGRATIONS.filter((i) =>
  ['github', 'gitlab', 'vercel', 'slack', 'stripe', 'gmail', 'twitter'].includes(i.id)
);

interface ChatIntegrationsBarProps {
  onSelect?: (name: string) => void;
}

export function ChatIntegrationsBar({ onSelect }: ChatIntegrationsBarProps) {
  const [search, setSearch] = useState('');
  const [githubOpen, setGithubOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [githubConnected, setGithubConnected] = useState(false);
  const [githubUser, setGithubUser] = useState<string | null>(null);

  useEffect(() => {
    api.github
      .status()
      .then((s) => {
        setGithubConnected(s.connected);
        setGithubUser(s.username ?? null);
      })
      .catch(() => setGithubConnected(false));
  }, []);

  const filtered = CHAT_INTEGRATIONS.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase())
  );

  async function connectGithub() {
    try {
      const { url } = await api.github.oauthUrl();
      window.location.href = url;
    } catch {
      window.location.href = '/dashboard/integrations';
    }
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--card-border)]/30">
      <div className="relative flex-1 min-w-0 max-w-[140px]">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--muted)]" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Integrations..."
          className="w-full pl-7 pr-2 py-1 rounded-md bg-white/5 border border-transparent text-[10px] focus:border-[var(--accent)]/30 focus:outline-none"
          onFocus={() => setMoreOpen(true)}
        />
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setGithubOpen(!githubOpen);
            setMoreOpen(false);
          }}
          className={cn(
            'flex items-center gap-1 px-2 py-1 rounded-md text-[10px] border transition-all hover:scale-105',
            githubConnected
              ? 'border-blue-500/40 text-blue-400 bg-blue-500/10'
              : 'border-[var(--card-border)] text-[var(--muted)] hover:border-[var(--accent)]/40'
          )}
        >
          <GitBranch className="w-3.5 h-3.5" />
          <span className="hidden sm:inline max-w-[80px] truncate">
            {githubConnected ? githubUser ?? 'GitHub' : 'GitHub'}
          </span>
          <ChevronDown className="w-3 h-3 opacity-60" />
        </button>
        {githubOpen && (
          <div
            className="absolute bottom-full left-0 mb-1 w-48 rounded-xl border border-[var(--card-border)] bg-[var(--card)] backdrop-blur-xl shadow-xl p-1 z-50"
            onClick={(e) => e.stopPropagation()}
          >
            {!githubConnected ? (
              <button
                type="button"
                onClick={connectGithub}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs hover:bg-white/5"
              >
                <Plus className="w-3.5 h-3.5" /> Connect GitHub
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onSelect?.('[Create new GitHub repo] ');
                    setGithubOpen(false);
                  }}
                  className="w-full text-left px-2 py-1.5 rounded-lg text-xs hover:bg-white/5"
                >
                  Create new repo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSelect?.('[Push to existing repo] ');
                    setGithubOpen(false);
                  }}
                  className="w-full text-left px-2 py-1.5 rounded-lg text-xs hover:bg-white/5"
                >
                  Push to existing
                </button>
                <a
                  href={`https://github.com/${githubUser}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs hover:bg-white/5"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> View on GitHub
                </a>
              </>
            )}
          </div>
        )}
      </div>

      <div className="hidden sm:flex items-center gap-1">
        {filtered.slice(0, 4).map((item) => (
          <Link
            key={item.id}
            href="/dashboard/integrations"
            className="px-2 py-1 rounded-md text-[10px] border border-[var(--card-border)]/50 text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--accent)]/30 transition-colors"
            title={item.name}
          >
            {item.name.split(' ')[0]}
          </Link>
        ))}
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setMoreOpen(!moreOpen);
            setGithubOpen(false);
          }}
          className="p-1 rounded-md text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-white/5"
          title="All integrations"
        >
          <Plug className="w-3.5 h-3.5" />
        </button>
        {moreOpen && (
          <div
            className="absolute bottom-full right-0 mb-1 w-56 max-h-48 overflow-y-auto rounded-xl border border-[var(--card-border)] bg-[var(--card)] backdrop-blur-xl shadow-xl p-2 z-50"
            onClick={(e) => e.stopPropagation()}
          >
            {filtered.map((item) => (
              <Link
                key={item.id}
                href="/dashboard/integrations"
                className="flex items-center justify-between px-2 py-1.5 rounded-lg text-xs hover:bg-white/5"
                onClick={() => setMoreOpen(false)}
              >
                <span>{item.name}</span>
                <span className="text-[10px] text-[var(--muted)]">
                  {item.status === 'connected' ? 'On' : 'Connect'}
                </span>
              </Link>
            ))}
            <Link
              href="/dashboard/integrations"
              className="block text-center text-[10px] text-[var(--accent)] mt-2 pt-2 border-t border-[var(--card-border)]"
            >
              View all integrations →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
