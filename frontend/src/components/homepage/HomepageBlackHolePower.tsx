'use client';

import { useMemo, useState } from 'react';
import {
  Binary,
  Brain,
  Infinity,
  Layers,
  Orbit,
  Radar,
  Sparkles,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  BLACK_HOLE_POWER,
  XROGA_MODEL_FULL,
  XROGA_MODEL_TAGLINE,
  XROGA_MODEL_UPDATE,
  XROGA_MODEL_FIRST_LAST,
} from '@/lib/brand';
import { GALACTIC_PLANS, SPARK_TOKEN_POOL, type GalacticPlan } from '@/lib/plans';

/**
 * Public swarm cores — Xroga product names only.
 * Capability language mirrors real specialist power; provider brands never appear.
 */
const CORE_DEFS = [
  {
    name: 'Apex',
    role: 'Chief Architect',
    power: 98,
    focus:
      'Flagship coding depth — multi-file systems, crypto/SaaS architectures, long-horizon agentic builds that rival top frontier coding agents',
    Icon: Brain,
    training: 'Reasoning · code king',
    sparkTokens: 888_888,
    edge: 'Hard problems. Clean architecture. Ships.',
  },
  {
    name: 'Horizon',
    role: 'Project Engineer',
    power: 94,
    focus:
      'Million-token whole-repo engineering — refactors, migrations, and project continuity across massive codebases',
    Icon: Layers,
    training: 'Long-context · repo mind',
    sparkTokens: 2_000_000,
    edge: 'Sees the whole tree. Keeps the thread.',
  },
  {
    name: 'Forge',
    role: 'Deep Executor',
    power: 91,
    focus:
      'High-volume execution — agent tasks, knowledge work, and shipping throughput when you need bulk delivery',
    Icon: Binary,
    training: 'Execution · volume',
    sparkTokens: 1_500_000,
    edge: 'Turns plans into finished files.',
  },
  {
    name: 'Pulse',
    role: 'Converter',
    power: 88,
    focus:
      'Prompt → precise builder brief at speed — routes intent so Apex / Horizon / Forge build the right product',
    Icon: Zap,
    training: 'Converter · velocity',
    sparkTokens: 1_000_000,
    edge: 'No template catalog. Real briefs.',
  },
  {
    name: 'Live',
    role: 'Real-Time Intel',
    power: 90,
    focus:
      'Native web + X firehose research — markets, hackathon rules, news — then fold facts into code in the same loop',
    Icon: Radar,
    training: 'Realtime · web + X',
    sparkTokens: 250_000,
    edge: 'Current world → shipping product.',
  },
  {
    name: 'Lens',
    role: 'Document Mind',
    power: 87,
    focus:
      'PDFs, screenshots, specs, and vision — multimodal context that feeds the same build (not a side chat)',
    Icon: Sparkles,
    training: 'Multimodal · docs',
    sparkTokens: 533_000,
    edge: 'Files become build fuel.',
  },
] as const;

function formatPool(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    const s = m >= 100 ? m.toFixed(0) : m >= 10 ? m.toFixed(1) : m.toFixed(2);
    return `${s.replace(/\.0$/, '')}M`;
  }
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return n.toLocaleString();
}

function scaleTokens(sparkTokens: number, planPool: number): number {
  return Math.round(sparkTokens * (planPool / SPARK_TOKEN_POOL));
}

export function HomepageBlackHolePower() {
  const [planTier, setPlanTier] = useState<GalacticPlan['tier']>('spark');
  const plan = useMemo(
    () => GALACTIC_PLANS.find((p) => p.tier === planTier) ?? GALACTIC_PLANS[0]!,
    [planTier]
  );

  const poolLabel = formatPool(plan.aiTokens);
  const cores = useMemo(
    () =>
      CORE_DEFS.map((c) => ({
        ...c,
        count: `${formatPool(scaleTokens(c.sparkTokens, plan.aiTokens))}+`,
      })),
    [plan.aiTokens]
  );

  const headlineStats = [
    { label: 'Context window', value: BLACK_HOLE_POWER.contextWindow, unit: 'tokens' },
    { label: `${plan.name} monthly pool`, value: poolLabel, unit: 'tokens' },
    { label: 'Concurrent swarms', value: String(plan.concurrency), unit: 'parallel' },
    { label: 'Ship loop', value: 'Own', unit: 'GitHub + Vercel' },
  ] as const;

  return (
    <section className="xv-hc-bh" aria-labelledby="blackhole-heading">
      <div className="xv-hc-bh-inner">
        <header className="xv-hc-bh-head">
          <div className="xv-hc-bh-identity" aria-label={XROGA_MODEL_FULL}>
            <Orbit className="xv-hc-bh-orbit-icon" strokeWidth={1.5} aria-hidden />
            <div className="xv-hc-bh-mark">
              <span className="xv-hc-bh-label">BLACK HOLE</span>
              <span className="xv-hc-bh-vrow">
                <span className="xv-hc-bh-v">V</span>
                <Infinity className="xv-hc-bh-inf" strokeWidth={2.5} aria-hidden />
              </span>
            </div>
            <p className="xv-hc-bh-update font-pixel">{XROGA_MODEL_UPDATE}</p>
          </div>

          <h2 id="blackhole-heading" className="xv-hc-bh-title">
            One model. <em>Infinite updates.</em>
          </h2>
          <p className="xv-hc-bh-lead">
            {XROGA_MODEL_FULL} is the only model you meet — a unified swarm of specialist cores
            under one event horizon. No waiting for “next model.” Capabilities land inside{' '}
            <strong>Black Hole V∞</strong> on a continuous cadence.
          </p>
          <p className="xv-hc-bh-tagline">{XROGA_MODEL_TAGLINE}</p>
          <p className="xv-hc-bh-firstlast">{XROGA_MODEL_FIRST_LAST}</p>
        </header>

        <div className="xv-hc-bh-planbar" role="group" aria-label="Plan capacity">
          <div className="xv-hc-bh-plan-row">
            <span className="xv-hc-bh-plan-tag font-pixel">PLAN</span>
            <div className="xv-hc-bh-plan-seg">
              {GALACTIC_PLANS.map((p) => (
                <button
                  key={p.tier}
                  type="button"
                  className={cn(
                    'xv-hc-bh-plan-chip',
                    planTier === p.tier && 'is-active',
                    p.highlight && 'is-popular'
                  )}
                  onClick={() => setPlanTier(p.tier)}
                  aria-pressed={planTier === p.tier}
                >
                  {p.name}
                  <em>{p.priceLabel}</em>
                </button>
              ))}
            </div>
            <p className="xv-hc-bh-plan-meta">
              <strong>{poolLabel}</strong>
              <span>
                tokens · {plan.concurrency}×
              </span>
            </p>
          </div>
        </div>

        <div className="xv-hc-bh-stats" role="list">
          {headlineStats.map((s) => (
            <div key={s.label} className="xv-hc-bh-stat" role="listitem">
              <span className="xv-hc-bh-stat-value">{s.value}</span>
              <span className="xv-hc-bh-stat-unit">{s.unit}</span>
              <span className="xv-hc-bh-stat-label">{s.label}</span>
            </div>
          ))}
        </div>

        <ul className="xv-hc-bh-cores">
          {cores.map((core, i) => (
            <li
              key={core.name}
              className="xv-hc-bh-core"
              style={{ animationDelay: `${0.08 * i}s` }}
            >
              <div className="xv-hc-bh-core-top">
                <span className="xv-hc-bh-core-icon" aria-hidden>
                  <core.Icon className="xv-hc-bh-core-lucide" strokeWidth={1.75} />
                </span>
                <div>
                  <strong>{core.name}</strong>
                  <span className="xv-hc-bh-core-role">{core.role}</span>
                </div>
              </div>
              <p className="xv-hc-bh-core-focus">{core.focus}</p>
              <p className="xv-hc-bh-core-edge">{core.edge}</p>
              <div className="xv-hc-bh-core-meter" aria-hidden>
                <div className="xv-hc-bh-core-meter-fill" style={{ width: `${core.power}%` }} />
              </div>
              <div className="xv-hc-bh-core-train">
                <span>{core.training}</span>
                <span className="xv-hc-bh-core-count">{core.count}</span>
              </div>
            </li>
          ))}
        </ul>

        <p className="xv-hc-bh-footnote">
          You never pick a vendor model. Xroga routes Apex · Horizon · Forge · Pulse · Live · Lens
          inside Black Hole V∞ — frontier coding depth, long-context repos, volume execution, live
          web+X intel, and multimodal docs as one #1 coding agent. Continuously trained by Event
          Horizon updates. Use the plan chips above to scale pool + per-core capacity.
        </p>
      </div>
    </section>
  );
}
