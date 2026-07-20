'use client';

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
import {
  BLACK_HOLE_POWER,
  XROGA_MODEL_FULL,
  XROGA_MODEL_TAGLINE,
  XROGA_MODEL_UPDATE,
  XROGA_MODEL_FIRST_LAST,
} from '@/lib/brand';

/**
 * Public swarm cores — Xroga product names only.
 * Underlying provider APIs are never named on the homepage.
 */
const CORES = [
  {
    name: 'Apex',
    role: 'Chief Architect',
    power: 98,
    focus: 'Complex full-stack · crypto · long-horizon builds',
    Icon: Brain,
    training: 'Reasoning capacity',
    count: '888K+',
  },
  {
    name: 'Horizon',
    role: 'Project Engineer',
    power: 94,
    focus: 'Million-token context · whole-repo engineering',
    Icon: Layers,
    training: 'Long-context capacity',
    count: '2.0M+',
  },
  {
    name: 'Forge',
    role: 'Deep Executor',
    power: 91,
    focus: 'Agent tasks · knowledge work · volume shipping',
    Icon: Binary,
    training: 'Execution capacity',
    count: '1.5M+',
  },
  {
    name: 'Pulse',
    role: 'Converter',
    power: 88,
    focus: 'Prompt → builder brief · high-speed chat',
    Icon: Zap,
    training: 'Converter capacity',
    count: '1.0M+',
  },
  {
    name: 'Live',
    role: 'Real-Time Intel',
    power: 90,
    focus: 'Web research · news · live-aware coding',
    Icon: Radar,
    training: 'Realtime capacity',
    count: '250K+',
  },
  {
    name: 'Lens',
    role: 'Document Mind',
    power: 87,
    focus: 'Files · PDFs · vision · 1M backup context',
    Icon: Sparkles,
    training: 'Multimodal capacity',
    count: '533K+',
  },
] as const;

const HEADLINE_STATS = [
  { label: 'Context window', value: `${BLACK_HOLE_POWER.contextWindow}`, unit: 'tokens' },
  { label: 'Spark monthly pool', value: BLACK_HOLE_POWER.monthlyPoolSpark, unit: 'tokens' },
  { label: 'Swarm cores', value: String(BLACK_HOLE_POWER.swarmCores), unit: 'specialists' },
  { label: 'Ship loop', value: 'Own', unit: 'GitHub + Vercel' },
] as const;

export function HomepageBlackHolePower() {
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

        <div className="xv-hc-bh-stats" role="list">
          {HEADLINE_STATS.map((s) => (
            <div key={s.label} className="xv-hc-bh-stat" role="listitem">
              <span className="xv-hc-bh-stat-value">{s.value}</span>
              <span className="xv-hc-bh-stat-unit">{s.unit}</span>
              <span className="xv-hc-bh-stat-label">{s.label}</span>
            </div>
          ))}
        </div>

        <ul className="xv-hc-bh-cores">
          {CORES.map((core, i) => (
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
          inside Black Hole V∞ — so enterprises see one #1 coding agent, continuously trained by
          Event Horizon updates.
        </p>
      </div>
    </section>
  );
}
