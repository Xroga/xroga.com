'use client';

import { useEffect, useState } from 'react';
import { X, Rocket, Globe, Gamepad2, Code2, ShoppingCart, ExternalLink, Link2, Server } from 'lucide-react';
import { useTerminalChat } from '@/context/TerminalChatContext';

interface DeployModalProps {
  open: boolean;
  onClose: () => void;
}

const XROGA_DEPLOY = [
  {
    id: 'xroga-vercel',
    name: 'Xroga → Vercel',
    desc: 'One-click deploy for websites & Next.js apps from your swarm build.',
    prompt: '[Deploy] Publish my Xroga build to Vercel with GitHub CI/CD',
  },
  {
    id: 'xroga-fly',
    name: 'Xroga → Fly.io',
    desc: 'Ship backends, APIs, and full-stack apps to the edge.',
    prompt: '[Deploy] Deploy my Xroga project to Fly.io globally',
  },
  {
    id: 'xroga-game',
    name: 'Xroga → Game hosting',
    desc: 'Publish 2D/3D web games and export mobile builds.',
    prompt: '[Deploy] Build and publish my game to web + app stores via Xroga',
  },
  {
    id: 'xroga-software',
    name: 'Xroga → Desktop software',
    desc: 'Package and distribute desktop apps built in swarm.',
    prompt: '[Deploy] Package and release my desktop software build',
  },
];

const PLATFORMS = [
  { id: 'vercel', name: 'Vercel', desc: 'Instant deploy for Next.js, React, and static sites.', prompt: '[Deploy] Publish to Vercel with GitHub integration' },
  { id: 'github', name: 'GitHub Pages', desc: 'Push and host from your repository.', prompt: '[Deploy] Deploy to GitHub Pages' },
  { id: 'fly', name: 'Fly.io', desc: 'Global edge apps and APIs.', prompt: '[Deploy] Deploy backend to Fly.io' },
  { id: 'netlify', name: 'Netlify', desc: 'Jamstack sites with CI/CD.', prompt: '[Deploy] Deploy to Netlify' },
];

const DOMAIN_PROVIDERS = [
  { name: 'Spaceship (Xroga partner)', prompt: '[Domain] Search, buy, and connect via Spaceship API' },
  { name: 'Buy from Xroga', prompt: '[Domain] Purchase domain through Xroga billing and auto-connect DNS' },
  { name: 'Transfer existing domain', prompt: '[Domain] Transfer domain from GoDaddy/Namecheap/Google and auto-point to my Xroga deploy' },
  { name: 'Connect external domain', prompt: '[Domain] Connect my existing domain from another registrar to Xroga hosting' },
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
              {k === 'deploy' ? 'Launch from Xroga' : 'Domains'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {tab === 'deploy' && (
            <>
              <p className="text-xs text-[var(--muted)]">
                Deploy websites, apps, games, and software directly from Xroga Swarm.
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--accent)]">Xroga deploy</p>
              {XROGA_DEPLOY.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => inject(p.prompt)}
                  className="w-full text-left p-3 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/10 transition-all flex gap-3"
                >
                  <Server className="w-5 h-5 text-[var(--accent)] shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-sm">{p.name}</p>
                    <p className="text-[11px] text-[var(--muted)]">{p.desc}</p>
                  </div>
                </button>
              ))}
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)] pt-1">Also supported</p>
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
                Search, buy, transfer, and connect domains — powered by Spaceship & Xroga.
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
                    `[Domain] Search availability and register ${domain || 'my-domain.com'} via Xroga Spaceship — connect DNS to my deployed app`
                  )
                }
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--background)] text-sm font-semibold"
              >
                <ShoppingCart className="w-4 h-4" /> Search & buy domain
              </button>
              {DOMAIN_PROVIDERS.map((d) => (
                <button
                  key={d.name}
                  type="button"
                  onClick={() => inject(d.prompt + (domain ? ` for ${domain}` : ''))}
                  className="w-full text-left p-3 rounded-xl border border-[var(--card-border)]/60 hover:border-[var(--accent)]/40 flex gap-3"
                >
                  <Link2 className="w-4 h-4 text-[var(--accent)] shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-sm">{d.name}</p>
                  </div>
                </button>
              ))}
              <button
                type="button"
                onClick={() => inject('[Domain] Transfer existing domain to Xroga Spaceship and point to my project')}
                className="w-full text-xs text-[var(--accent)] hover:underline flex items-center justify-center gap-1"
              >
                Auto-transfer & connect DNS <ExternalLink className="w-3 h-3" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
