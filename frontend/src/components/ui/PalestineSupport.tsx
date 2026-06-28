'use client';

import { useState } from 'react';
import { Heart, X, ExternalLink } from 'lucide-react';
import { PALESTINE_DONATION_SITES } from '@/lib/palestineDonations';

export function PalestineSupportBanner({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`xv-palestine-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] sm:text-xs font-semibold transition-all ${className ?? ''}`}
      >
        <Heart className="w-3.5 h-3.5 text-emerald-400" />
        <span>We stand with Palestine</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} aria-hidden />
          <div className="relative w-full max-w-md rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-2xl p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="font-bold text-lg">Support Palestine</h3>
                <p className="text-xs text-[var(--muted)] mt-1 leading-relaxed">
                  Xroga supports Palestine. We do not operate in Israel and do not accept Israeli currency or
                  location-based services. Donate through trusted organizations:
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-white/10" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>
            <ul className="space-y-2">
              {PALESTINE_DONATION_SITES.map((site) => (
                <li key={site.url}>
                  <a
                    href={site.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-2 p-3 rounded-xl border border-[var(--card-border)]/50 hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-all group"
                  >
                    <div className="min-w-0 text-left">
                      <p className="text-sm font-semibold text-[var(--foreground)]">{site.name}</p>
                      <p className="text-[10px] text-[var(--muted)] truncate">{site.desc}</p>
                    </div>
                    <ExternalLink className="w-4 h-4 shrink-0 text-[var(--muted)] group-hover:text-emerald-400" />
                  </a>
                </li>
              ))}
            </ul>
            <p className="text-[9px] text-[var(--muted)] mt-4 text-center">
              Contact us: <a href="mailto:hello@xroga.com" className="text-[var(--accent)] hover:underline">hello@xroga.com</a>
            </p>
          </div>
        </div>
      )}
    </>
  );
}
