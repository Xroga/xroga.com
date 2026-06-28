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

const STORIES = [
  {
    title: 'A mother in Gaza',
    text: 'She walks miles for clean water while her children sleep on cold floors. Your donation can fund food parcels and winter blankets tonight.',
  },
  {
    title: 'A doctor without supplies',
    text: 'Operating by phone flashlight, saving lives with almost nothing. Medical aid organizations need your help to restock trauma kits.',
  },
  {
    title: 'A child who lost everything',
    text: 'Schools turned to rubble. Dreams paused. Education and psychosocial support programs exist — they need funding to reach more families.',
  },
];

export function PalestineSupportBanner({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);

  const modal =
    open && typeof document !== 'undefined'
      ? createPortal(
          <>
            <div
              className="fixed inset-0 z-[400] bg-black/60 backdrop-blur-sm"
              onClick={() => setOpen(false)}
              aria-hidden
            />
            <div
              className="fixed z-[410] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(420px,calc(100vw-28px))] max-h-[min(90vh,680px)] overflow-y-auto rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-[#0a1f14]/98 via-[#0d1117]/98 to-[#1a0a0a]/95 shadow-[0_32px_80px_rgba(0,0,0,0.7)] backdrop-blur-xl"
              role="dialog"
              aria-labelledby="palestine-modal-title"
            >
              <div className="relative p-5 sm:p-6">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-red-500/80 to-emerald-500 rounded-t-2xl" />
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl" aria-hidden>🇵🇸</span>
                      <h3 id="palestine-modal-title" className="font-bold text-lg text-white">
                        We Stand With Palestine
                      </h3>
                    </div>
                    <p className="text-xs text-white/65 leading-relaxed mt-2">
                      Behind every statistic is a human being — a parent, a child, a neighbor. They did not choose this.
                      Your generosity reaches real families through verified organizations on the ground.
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

                <div className="space-y-2.5 mb-5">
                  {STORIES.map((s) => (
                    <div key={s.title} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
                      <p className="text-xs font-bold text-emerald-300 mb-1">{s.title}</p>
                      <p className="text-[11px] text-white/55 leading-relaxed">{s.text}</p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2 mb-5">
                  {IMPACT_STATS.map(({ icon: Icon, value, label }) => (
                    <div key={label} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Icon className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-sm font-bold text-emerald-300">{value}</span>
                      </div>
                      <p className="text-[9px] text-white/50 leading-snug">{label}</p>
                    </div>
                  ))}
                </div>

                <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400/80 mb-2">
                  Donate now — every amount helps
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
        onClick={() => setOpen(true)}
        className={`xv-palestine-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] sm:text-xs font-semibold transition-all ${className ?? ''}`}
      >
        <span aria-hidden>🇵🇸</span>
        <Heart className="w-3.5 h-3.5 text-emerald-400" />
        <span>We stand with Palestine</span>
      </button>
      {modal}
    </>
  );
}
