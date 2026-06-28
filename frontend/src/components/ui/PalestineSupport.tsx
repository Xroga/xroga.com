'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Heart, X, ExternalLink } from 'lucide-react';
import { PALESTINE_DONATION_SITES } from '@/lib/palestineDonations';
import { cn } from '@/lib/utils';

export function PalestineSupportBanner({ className, compact }: { className?: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);

  const modal =
    open && typeof document !== 'undefined'
      ? createPortal(
          <>
            <div className="fixed inset-0 z-[400] bg-black/45 backdrop-blur-sm" onClick={() => setOpen(false)} aria-hidden />
            <div
              className="fixed z-[410] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(360px,calc(100vw-24px))] rounded-2xl border border-[#006aff]/20 bg-gradient-to-br from-white via-sky-50 to-blue-50 shadow-[0_24px_64px_rgba(0,106,255,0.18)] overflow-hidden"
              role="dialog"
            >
              <div className="h-1 bg-gradient-to-r from-emerald-500 via-[#006aff] to-emerald-500" />
              <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <p className="flex items-center gap-1.5 text-base font-bold text-slate-900">
                      <span>🇵🇸</span> We Stand With Palestine
                    </p>
                    <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                      Families need food, medicine, and shelter tonight. Your donation reaches real people through verified organizations.
                    </p>
                  </div>
                  <button type="button" onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-black/5 text-slate-500 shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <ul className="space-y-1.5">
                  {PALESTINE_DONATION_SITES.slice(0, 4).map((site) => (
                    <li key={site.url}>
                      <a
                        href={site.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-sky-100 bg-white hover:border-[#006aff]/30 hover:shadow-sm transition-all group"
                      >
                        <div className="min-w-0 text-left">
                          <p className="text-xs font-semibold text-slate-800">{site.name}</p>
                          <p className="text-[9px] text-slate-500 truncate">{site.desc}</p>
                        </div>
                        <ExternalLink className="w-3.5 h-3.5 shrink-0 text-slate-400 group-hover:text-[#006aff]" />
                      </a>
                    </li>
                  ))}
                </ul>
                <p className="text-[9px] text-slate-400 mt-3 text-center">
                  Every life matters · <a href="mailto:hello@xroga.com" className="text-[#006aff] hover:underline">hello@xroga.com</a>
                </p>
              </div>
            </div>
          </>,
          document.body
        )
      : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'xv-palestine-btn inline-flex items-center gap-1 px-2 py-1 rounded-full text-[9px] sm:text-[10px] font-semibold transition-all',
          compact && '!px-1.5',
          className
        )}
        title="We stand with Palestine"
      >
        <span aria-hidden>🇵🇸</span>
        {!compact && (
          <>
            <Heart className="w-3 h-3 text-emerald-500" />
            <span>We stand with Palestine</span>
          </>
        )}
      </button>
      {modal}
    </>
  );
}
