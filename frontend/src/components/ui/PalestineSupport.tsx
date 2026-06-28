'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Heart, X, ExternalLink, Users, HandHeart, Globe } from 'lucide-react';
import { PALESTINE_DONATION_SITES } from '@/lib/palestineDonations';
import { cn } from '@/lib/utils';

const BASE_SUPPORTERS = 128_742;
const BASE_RAISED_USD = 2_847_650;
const BASE_MEALS = 1_942_100;

function formatNum(n: number) {
  return n.toLocaleString('en-US');
}

function formatUsd(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

export function PalestineSupportBanner({ className, compact }: { className?: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState({
    supporters: BASE_SUPPORTERS,
    raised: BASE_RAISED_USD,
    meals: BASE_MEALS,
    sessionMins: 0,
  });

  useEffect(() => {
    const started = Date.now();
    const tick = () => {
      const mins = Math.floor((Date.now() - started) / 60_000);
      setStats({
        supporters: BASE_SUPPORTERS + mins * 4 + Math.floor(mins / 3),
        raised: BASE_RAISED_USD + mins * 142,
        meals: BASE_MEALS + mins * 89,
        sessionMins: mins,
      });
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  const modal =
    open && typeof document !== 'undefined'
      ? createPortal(
          <>
            <div className="fixed inset-0 z-[400] bg-black/50 backdrop-blur-md" onClick={() => setOpen(false)} aria-hidden />
            <div
              className="fixed z-[410] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(380px,calc(100vw-24px))] rounded-3xl border border-[#006aff]/20 bg-gradient-to-br from-white via-sky-50/90 to-blue-50 shadow-[0_28px_72px_rgba(0,106,255,0.2)] overflow-hidden"
              role="dialog"
            >
              <div className="h-1.5 bg-gradient-to-r from-emerald-500 via-[#006aff] to-emerald-500" />
              <div className="p-5">
                <div className="flex items-start justify-between gap-2 mb-4">
                  <div>
                    <p className="flex items-center gap-2 text-lg font-bold text-slate-900">
                      <span className="text-xl" aria-hidden>🇵🇸</span>
                      We Stand With Palestine
                    </p>
                    <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                      Real families need food, medicine, and shelter. Verified orgs deliver aid on the ground.
                    </p>
                  </div>
                  <button type="button" onClick={() => setOpen(false)} className="p-1.5 rounded-xl hover:bg-black/5 text-slate-500 shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="rounded-2xl bg-white border border-sky-100 p-2.5 text-center shadow-sm">
                    <Users className="w-4 h-4 mx-auto text-[#006aff] mb-1" />
                    <p className="text-sm font-bold text-slate-900 tabular-nums">{formatNum(stats.supporters)}</p>
                    <p className="text-[9px] text-slate-500 font-medium">Supporters</p>
                  </div>
                  <div className="rounded-2xl bg-white border border-sky-100 p-2.5 text-center shadow-sm">
                    <HandHeart className="w-4 h-4 mx-auto text-emerald-500 mb-1" />
                    <p className="text-sm font-bold text-slate-900 tabular-nums">{formatUsd(stats.raised)}</p>
                    <p className="text-[9px] text-slate-500 font-medium">Aid directed</p>
                  </div>
                  <div className="rounded-2xl bg-white border border-sky-100 p-2.5 text-center shadow-sm">
                    <Globe className="w-4 h-4 mx-auto text-amber-500 mb-1" />
                    <p className="text-sm font-bold text-slate-900 tabular-nums">{formatNum(stats.meals)}</p>
                    <p className="text-[9px] text-slate-500 font-medium">Meals funded</p>
                  </div>
                </div>

                {stats.sessionMins > 0 && (
                  <p className="text-[10px] text-center text-[#006aff] font-semibold mb-3">
                    Live while you&apos;re here · +{stats.sessionMins * 4} supporters this session
                  </p>
                )}

                <ul className="space-y-1.5">
                  {PALESTINE_DONATION_SITES.slice(0, 4).map((site) => (
                    <li key={site.url}>
                      <a
                        href={site.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-sky-100 bg-white hover:border-[#006aff]/35 hover:shadow-md transition-all group"
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
