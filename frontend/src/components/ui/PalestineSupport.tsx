'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Heart, X, ExternalLink, Users, Baby, Stethoscope, Home } from 'lucide-react';
import { PALESTINE_DONATION_SITES } from '@/lib/palestineDonations';

const IMPACT_STATS = [
  { icon: Users, value: '2M+', label: 'People need urgent humanitarian aid' },
  { icon: Baby, value: '1 in 3', label: 'Children face acute malnutrition risk' },
  { icon: Stethoscope, value: '78%', label: 'Of hospitals damaged or destroyed' },
  { icon: Home, value: '1.9M', label: 'Displaced from their homes' },
];

export function PalestineSupportBanner({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);

  function handleOpen(e: React.MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    setAnchor({
      top: Math.max(16, rect.top - 40),
      left: rect.right + 12,
    });
    setOpen(true);
  }

  const modal =
    open && anchor && typeof document !== 'undefined'
      ? createPortal(
          <>
            <div
              className="fixed inset-0 z-[280] bg-black/40 backdrop-blur-[2px]"
              onClick={() => setOpen(false)}
              aria-hidden
            />
            <div
              className="fixed z-[290] w-[min(380px,calc(100vw-32px))] max-h-[min(90vh,640px)] overflow-y-auto rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-[#0a1f14]/98 via-[#0d1117]/98 to-[#1a0a0a]/95 shadow-[0_24px_80px_rgba(0,0,0,0.6)] backdrop-blur-xl"
              style={{ top: anchor.top, left: Math.min(anchor.left, window.innerWidth - 400) }}
              role="dialog"
              aria-labelledby="palestine-modal-title"
            >
              <div className="relative p-5 sm:p-6">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-red-500/80 to-emerald-500 rounded-t-2xl" />
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Heart className="w-5 h-5 text-emerald-400 fill-emerald-400/30" />
                      <h3 id="palestine-modal-title" className="font-bold text-lg text-white">
                        We Stand With Palestine
                      </h3>
                    </div>
                    <p className="text-xs text-white/60 leading-relaxed mt-2">
                      Every life matters. Xroga supports Palestine and does not operate in Israel. Your donation
                      reaches families, children, and medical teams on the ground through verified organizations.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-white/70 shrink-0"
                    aria-label="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-5">
                  {IMPACT_STATS.map(({ icon: Icon, value, label }) => (
                    <div
                      key={label}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5"
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <Icon className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-sm font-bold text-emerald-300">{value}</span>
                      </div>
                      <p className="text-[9px] text-white/50 leading-snug">{label}</p>
                    </div>
                  ))}
                </div>

                <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400/80 mb-2">
                  Top trusted donation sites
                </p>
                <ul className="space-y-2">
                  {PALESTINE_DONATION_SITES.map((site) => (
                    <li key={site.url}>
                      <a
                        href={site.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between gap-2 p-3 rounded-xl border border-white/10 hover:border-emerald-500/40 hover:bg-emerald-500/8 transition-all group"
                      >
                        <div className="min-w-0 text-left">
                          <p className="text-sm font-semibold text-white">{site.name}</p>
                          <p className="text-[10px] text-white/45 truncate">{site.desc}</p>
                        </div>
                        <ExternalLink className="w-4 h-4 shrink-0 text-white/40 group-hover:text-emerald-400" />
                      </a>
                    </li>
                  ))}
                </ul>
                <p className="text-[9px] text-white/40 mt-4 text-center">
                  <a href="mailto:hello@xroga.com" className="text-emerald-400/90 hover:underline">
                    hello@xroga.com
                  </a>
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
        onClick={handleOpen}
        className={`xv-palestine-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] sm:text-xs font-semibold transition-all ${className ?? ''}`}
      >
        <Heart className="w-3.5 h-3.5 text-emerald-400" />
        <span>We stand with Palestine</span>
      </button>
      {modal}
    </>
  );
}
