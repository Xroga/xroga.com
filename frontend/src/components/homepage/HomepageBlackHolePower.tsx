import { CalendarClock, CheckCircle2, Gauge, ShieldCheck } from 'lucide-react';

const PACING = [
  {
    Icon: CalendarClock,
    title: 'Balanced Month by default',
    body: 'Capacity unlocks across your own 30-day cycle, and unused released capacity remains available until that cycle ends.',
  },
  {
    Icon: Gauge,
    title: 'Complexity when it matters',
    body: 'Xroga can use reserved capacity for genuinely complex accepted work without asking you to choose a provider model.',
  },
  {
    Icon: ShieldCheck,
    title: 'Completion stays protected',
    body: 'A protected portion remains available for finishing, focused tests, repair, migration safety, and verification.',
  },
] as const;

export function HomepageBlackHolePower() {
  return (
    <section className="xv-hc-power" aria-labelledby="capacity-heading">
      <div className="xv-hc-power-inner">
        <p className="xv-hc-pixel-kicker">ONE XROGA AI PLAN</p>
        <h2 className="xv-hc-section-title" id="capacity-heading">
          Capacity designed to <em>finish work.</em>
        </h2>
        <p className="xv-hc-section-copy">
          No model picker, provider balances, artificial credits, fixed message limit, or guaranteed token total. Xroga routes the work and shows real capacity, unlocks, and reset timing.
        </p>

        <div className="grid gap-4 md:grid-cols-3 mt-8">
          {PACING.map(({ Icon, title, body }) => (
            <article key={title} className="glass-panel rounded-2xl border border-[var(--card-border)] p-5">
              <Icon className="w-5 h-5 text-[var(--accent)] mb-3" aria-hidden />
              <h3 className="font-semibold">{title}</h3>
              <p className="text-sm text-[var(--muted)] mt-2 leading-relaxed">{body}</p>
            </article>
          ))}
        </div>

        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" aria-hidden />
          <p><strong>$19 per 30-day billing period.</strong> Activate by 30 August 2026 for one complete 30-day period free, with no card and no automatic charge.</p>
        </div>
      </div>
    </section>
  );
}
