'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Search, X, Plug, ChevronDown } from 'lucide-react';
import { INTEGRATIONS, INTEGRATION_CATEGORIES } from '@/lib/integrations';
import { IntegrationLogo } from '@/components/integrations/IntegrationLogo';
import { isConnectableIntegration } from '@/lib/connectableIntegrations';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

interface IntegrationsModalProps {
  open: boolean;
  onClose: () => void;
}

export function IntegrationsModal({ open, onClose }: IntegrationsModalProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [comingSoonOpen, setComingSoonOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return INTEGRATIONS.filter(
      (i) => i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q)
    );
  }, [search]);

  const liveFiltered = useMemo(() => filtered.filter((i) => isConnectableIntegration(i.id)), [filtered]);
  const comingSoonFiltered = useMemo(() => filtered.filter((i) => !isConnectableIntegration(i.id)), [filtered]);

  function handleConnect(id: string, name: string) {
    if (!isConnectableIntegration(id)) {
      toast('Coming soon', { icon: '⏳' });
      return;
    }
    toast(`Open Integrations to connect ${name}`, { icon: '🔌' });
    onClose();
    router.push('/dashboard/integrations');
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 modal-backdrop" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[85vh] rounded-2xl modal-glass universe-fade-in flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="xv-integrations-modal-title"
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
          <h2 id="xv-integrations-modal-title" className="font-semibold text-base">Integrations</h2>
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search integrations..."
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-white/5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)]/40"
            />
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-white/10" aria-label="Close integrations">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {INTEGRATION_CATEGORIES.map((cat) => {
            const items = liveFiltered.filter((i) => i.category === cat);
            if (!items.length) return null;
            return (
              <div key={cat}>
                <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">{cat}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {items.map((item) => {
                    const connected = item.status === 'connected';
                    return (
                      <div
                        key={item.id}
                        className="relative flex items-center gap-3 p-3 rounded-xl bg-white/[0.04] border border-white/[0.06] transition-colors overflow-hidden hover:bg-white/[0.07]"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center shrink-0 overflow-hidden">
                            <IntegrationLogo id={item.id} name={item.name} size={22} className="object-contain" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{item.name}</p>
                            <p className="text-[10px] text-[var(--muted)]">{connected ? 'Connected' : 'Available'}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleConnect(item.id, item.name)}
                          className="shrink-0 relative z-[1] flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-[var(--accent)]/15 border border-[var(--accent)]/35 text-[var(--foreground)] hover:bg-[var(--accent)]/25 transition-colors"
                        >
                          <Plug className="w-3 h-3" />
                          {connected ? 'Manage' : 'Install'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {comingSoonFiltered.length > 0 && (
            <div className="rounded-xl border border-white/[0.06] overflow-hidden">
              <button
                type="button"
                onClick={() => setComingSoonOpen((v) => !v)}
                aria-expanded={comingSoonOpen}
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-white/[0.03]"
              >
                <span className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">
                  Coming soon ({comingSoonFiltered.length})
                </span>
                <ChevronDown className={cn('w-3.5 h-3.5 text-[var(--muted)] transition-transform shrink-0', comingSoonOpen && 'rotate-180')} />
              </button>
              {comingSoonOpen && (
                <div className="flex flex-wrap gap-1.5 border-t border-white/[0.06] p-3">
                  {comingSoonFiltered.map((item) => (
                    <span
                      key={item.id}
                      className="text-[10px] px-2 py-1 rounded-md bg-white/[0.04] text-[var(--muted)] uppercase tracking-wider font-semibold"
                    >
                      {item.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-white/10 flex flex-col sm:flex-row items-center justify-center gap-2">
          <Link
            href="/dashboard/integrations"
            onClick={onClose}
            className="w-full sm:w-auto text-center px-4 py-2 rounded-xl bg-[var(--accent)]/20 border border-[var(--accent)]/35 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--accent)]/30 transition-colors"
          >
            Open Integrations tab →
          </Link>
        </div>
      </div>
    </div>
  );
}
