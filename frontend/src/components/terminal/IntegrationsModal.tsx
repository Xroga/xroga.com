'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Search, X, ExternalLink } from 'lucide-react';
import { INTEGRATIONS, INTEGRATION_CATEGORIES } from '@/lib/integrations';
import { getIntegrationLogo } from '@/lib/integrationLogos';

interface IntegrationsModalProps {
  open: boolean;
  onClose: () => void;
}

export function IntegrationsModal({ open, onClose }: IntegrationsModalProps) {
  const [search, setSearch] = useState('');

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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 modal-backdrop" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[85vh] rounded-2xl modal-glass universe-fade-in flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
          <h2 className="font-semibold text-base">Integrations</h2>
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
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-white/10">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {INTEGRATION_CATEGORIES.map((cat) => {
            const items = filtered.filter((i) => i.category === cat);
            if (!items.length) return null;
            return (
              <div key={cat}>
                <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">{cat}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {items.map((item) => {
                    const logo = getIntegrationLogo(item.id);
                    return (
                      <Link
                        key={item.id}
                        href="/dashboard/integrations"
                        onClick={onClose}
                        className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] transition-all hover:scale-[1.01] group"
                      >
                        <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center shrink-0 overflow-hidden">
                          {logo ? (
                            <Image src={logo} alt="" width={22} height={22} unoptimized className="object-contain" />
                          ) : (
                            <span className="text-xs font-bold">{item.name.charAt(0)}</span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{item.name}</p>
                          <p className="text-[10px] text-[var(--muted)]">
                            {item.status === 'connected' ? 'Connected' : 'Not connected'}
                          </p>
                        </div>
                        <ExternalLink className="w-3.5 h-3.5 opacity-0 group-hover:opacity-60 shrink-0" />
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <div className="px-5 py-3 border-t border-white/10 text-center">
          <Link href="/dashboard/integrations" onClick={onClose} className="text-sm text-[var(--accent)] hover:underline">
            Open full integrations page →
          </Link>
        </div>
      </div>
    </div>
  );
}
