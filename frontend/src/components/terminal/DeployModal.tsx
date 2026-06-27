'use client';

import { useEffect, useState } from 'react';
import { X, Rocket, Globe, Gamepad2, Code2, ShoppingCart, ExternalLink } from 'lucide-react';
import { useTerminalChat } from '@/context/TerminalChatContext';

interface DeployModalProps {
  open: boolean;
  onClose: () => void;
}

const PLATFORMS = [
  { id: 'vercel', name: 'Vercel', desc: 'Instant deploy for Next.js, React, and static sites.', prompt: '[Deploy] Publish to Vercel with GitHub integration' },
  { id: 'github', name: 'GitHub Pages', desc: 'Push and host from your repository.', prompt: '[Deploy] Deploy to GitHub Pages' },
  { id: 'fly', name: 'Fly.io', desc: 'Global edge apps and APIs.', prompt: '[Deploy] Deploy backend to Fly.io' },
  { id: 'netlify', name: 'Netlify', desc: 'Jamstack sites with CI/CD.', prompt: '[Deploy] Deploy to Netlify' },
];

export function DeployModal({ open, onClose }: DeployModalProps) {
  const { setPrompt, prompt } = useTerminalChat();
  const [domain, setDomain] = useState('');
  const [tab, setTab] = useState<'deploy' | 'domain'>('deploy');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  function inject(text: string) {
    setPrompt(prompt ? `${prompt}\n${text}` : text);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-lg glass-panel-strong rounded-2xl border border-[var(--card-border)] overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--card-border)]/60">
          <div className="flex items-center gap-2">
            <Rocket className="w-5 h-5 text-[var(--accent)]" />
            <h2 className="font-bold">Deploy & Domains</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex gap-1 p-3 border-b border-[var(--card-border)]/40">
          {(['deploy', 'domain'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`flex-1 text-xs py-2 rounded-lg font-medium ${tab === k ? 'bg-[var(--accent)]/15 text-[var(--accent)]' : 'text-[var(--muted)]'}`}
            >
              {k === 'deploy' ? 'Launch' : 'Buy domain'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {tab === 'deploy' && (
            <>
              <p className="text-xs text-[var(--muted)]">Deploy websites, apps, and games directly from Xroga Swarm.</p>
              {PLATFORMS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => inject(p.prompt)}
                  className="w-full text-left p-3 rounded-xl border border-[var(--card-border)]/60 hover:border-[var(--accent)]/40 hover:bg-white/[0.03] transition-all flex gap-3"
                >
                  <Code2 className="w-5 h-5 text-[var(--accent)] shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-sm">{p.name}</p>
                    <p className="text-[11px] text-[var(--muted)]">{p.desc}</p>
                  </div>
                </button>
              ))}
              <button
                type="button"
                onClick={() => inject('[Deploy] Build and publish my game to web + mobile stores')}
                className="w-full text-left p-3 rounded-xl border border-[var(--card-border)]/60 hover:border-[var(--accent)]/40 flex gap-3"
              >
                <Gamepad2 className="w-5 h-5 text-green-400 shrink-0" />
                <div>
                  <p className="font-semibold text-sm">Games</p>
                  <p className="text-[11px] text-[var(--muted)]">2D/3D web games and mobile export guidance.</p>
                </div>
              </button>
            </>
          )}

          {tab === 'domain' && (
            <>
              <p className="text-xs text-[var(--muted)]">
                Search, buy, and transfer domains via Spaceship API — connected to your Xroga account.
              </p>
              <div className="flex gap-2">
                <Globe className="w-4 h-4 text-[var(--muted)] shrink-0 mt-2.5" />
                <input
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="yourbrand.com"
                  className="flex-1 text-sm px-3 py-2 rounded-lg bg-white/5 border border-[var(--card-border)] focus:outline-none focus:border-[var(--accent)]/50"
                />
              </div>
              <button
                type="button"
                onClick={() =>
                  inject(
                    `[Domain] Search availability and register ${domain || 'my-domain.com'} via Spaceship — connect DNS to my deployed app`
                  )
                }
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--background)] text-sm font-semibold"
              >
                <ShoppingCart className="w-4 h-4" /> Search & buy domain
              </button>
              <button
                type="button"
                onClick={() => inject('[Domain] Transfer existing domain to Xroga Spaceship and point to my project')}
                className="w-full text-xs text-[var(--accent)] hover:underline flex items-center justify-center gap-1"
              >
                Transfer domain <ExternalLink className="w-3 h-3" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
