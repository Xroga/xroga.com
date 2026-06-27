'use client';

import { useEffect, useState } from 'react';
import { X, Rocket, Globe, Gamepad2, Code2, ShoppingCart, ExternalLink, Link2, Server, Smartphone, Store, Cloud } from 'lucide-react';
import { useTerminalChat } from '@/context/TerminalChatContext';

interface DeployModalProps {
  open: boolean;
  onClose: () => void;
}

const LAUNCH_TARGETS = [
  { id: 'playstore', name: 'Google Play Store', desc: 'Publish Android app with signing & listing.', prompt: '[Launch] Deploy my app to Google Play Store via Xroga', icon: Store },
  { id: 'appstore', name: 'Apple App Store', desc: 'Ship iOS build with TestFlight + App Store Connect.', prompt: '[Launch] Deploy my app to Apple App Store via Xroga', icon: Smartphone },
  { id: 'website', name: 'Website hosting', desc: 'Vercel, Netlify, Fly — live in minutes.', prompt: '[Deploy] Publish my website to production hosting', icon: Globe },
  { id: 'games', name: 'Game deploy', desc: 'WebGL, itch.io, and cloud game servers.', prompt: '[Deploy] Publish my 2D/3D game to web and stores', icon: Gamepad2 },
  { id: 'api', name: 'API & backend', desc: 'REST, GraphQL, edge APIs on Fly/Railway.', prompt: '[Deploy] Ship my API backend to production edge', icon: Cloud },
];

const XROGA_DEPLOY = [
  { id: 'xroga-vercel', name: 'Xroga → Vercel', desc: 'One-click deploy for websites & Next.js apps.', prompt: '[Deploy] Publish my Xroga build to Vercel with GitHub CI/CD' },
  { id: 'xroga-fly', name: 'Xroga → Fly.io', desc: 'Ship backends, APIs, and full-stack apps to the edge.', prompt: '[Deploy] Deploy my Xroga project to Fly.io globally' },
  { id: 'xroga-game', name: 'Xroga → Game hosting', desc: 'Publish 2D/3D web games and export mobile builds.', prompt: '[Deploy] Build and publish my game to web + app stores via Xroga' },
  { id: 'xroga-software', name: 'Xroga → Desktop software', desc: 'Package and distribute desktop apps.', prompt: '[Deploy] Package and release my desktop software build' },
];

const PLATFORMS = [
  { id: 'vercel', name: 'Vercel', desc: 'Next.js, React, static sites.', prompt: '[Deploy] Publish to Vercel with GitHub integration' },
  { id: 'github', name: 'GitHub Pages', desc: 'Host from your repository.', prompt: '[Deploy] Deploy to GitHub Pages' },
  { id: 'fly', name: 'Fly.io', desc: 'Global edge apps and APIs.', prompt: '[Deploy] Deploy backend to Fly.io' },
  { id: 'netlify', name: 'Netlify', desc: 'Jamstack sites with CI/CD.', prompt: '[Deploy] Deploy to Netlify' },
];

export function DeployModal({ open, onClose }: DeployModalProps) {
  const { setPrompt, prompt } = useTerminalChat();
  const [domain, setDomain] = useState('');
  const [tab, setTab] = useState<'deploy' | 'domain' | 'launch'>('deploy');

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
          {(['deploy', 'domain', 'launch'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`flex-1 text-[10px] sm:text-xs py-2 rounded-lg font-medium ${tab === k ? 'bg-[var(--accent)]/15 text-[var(--accent)]' : 'text-[var(--muted)]'}`}
            >
              {k === 'deploy' ? 'Deploy' : k === 'domain' ? 'Domains' : 'Launch'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {tab === 'deploy' && (
            <>
              <p className="text-xs text-[var(--muted)]">Deploy websites, apps, games, and software from Xroga Swarm.</p>
              {XROGA_DEPLOY.map((p) => (
                <button key={p.id} type="button" onClick={() => inject(p.prompt)} className="w-full text-left p-3 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 hover:border-[var(--accent)]/50 flex gap-3">
                  <Server className="w-5 h-5 text-[var(--accent)] shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-sm">{p.name}</p>
                    <p className="text-[11px] text-[var(--muted)]">{p.desc}</p>
                  </div>
                </button>
              ))}
              {PLATFORMS.map((p) => (
                <button key={p.id} type="button" onClick={() => inject(p.prompt)} className="w-full text-left p-3 rounded-xl border border-[var(--card-border)]/60 hover:border-[var(--accent)]/40 flex gap-3">
                  <Code2 className="w-5 h-5 text-[var(--accent)] shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-sm">{p.name}</p>
                    <p className="text-[11px] text-[var(--muted)]">{p.desc}</p>
                  </div>
                </button>
              ))}
            </>
          )}

          {tab === 'domain' && (
            <>
              <p className="text-xs text-[var(--muted)]">Buy, connect, or transfer domains — auto DNS & nameservers on Xroga.</p>
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
                onClick={() => inject(`[Domain] Search and register ${domain || 'my-domain.com'} via Xroga Spaceship`)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--background)] text-sm font-semibold"
              >
                <ShoppingCart className="w-4 h-4" /> Search & buy domain
              </button>
              <button
                type="button"
                onClick={() => inject(`[Domain] Connect my existing domain ${domain || 'my-domain.com'} to Xroga — auto-configure A record, CNAME, and nameservers`)}
                className="w-full text-left p-3 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/5 flex gap-3"
              >
                <Link2 className="w-4 h-4 text-[var(--accent)] shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-sm">Connect existing domain</p>
                  <p className="text-[11px] text-[var(--muted)]">Auto IP, DNS & nameserver setup on Xroga AI</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => inject('[Domain] Transfer domain from GoDaddy/Namecheap/Google — auto-point to Xroga deploy')}
                className="w-full text-xs text-[var(--accent)] hover:underline flex items-center justify-center gap-1"
              >
                Transfer & auto-connect <ExternalLink className="w-3 h-3" />
              </button>
            </>
          )}

          {tab === 'launch' && (
            <>
              <p className="text-xs text-[var(--muted)]">Launch to app stores, web, games, and APIs.</p>
              {LAUNCH_TARGETS.map((t) => {
                const Icon = t.icon;
                return (
                  <button key={t.id} type="button" onClick={() => inject(t.prompt)} className="w-full text-left p-3 rounded-xl border border-[var(--card-border)]/60 hover:border-[var(--accent)]/40 flex gap-3">
                    <Icon className="w-5 h-5 text-[var(--accent)] shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-sm">{t.name}</p>
                      <p className="text-[11px] text-[var(--muted)]">{t.desc}</p>
                    </div>
                  </button>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
