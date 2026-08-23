'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  ChartNoAxesColumnIncreasing,
  FileText,
  LockKeyhole,
  Network,
  Rocket,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { XROGA_MODEL_FULL } from '@/lib/brand';

/**
 * Four signals, each paired with what it gets you.
 *
 * These used to be two separate lists — four floating concepts positioned around the
 * infinity graphic, then four capability cards below it — which is what made the
 * section tall enough to need its own scroll. The pairing was already implied by
 * their numbering, so folding each capability into the signal it belongs to loses
 * nothing and collapses two full-width rows into one.
 */
const SIGNALS = [
  {
    Icon: Activity,
    code: '01 / STATE SIGNAL',
    label: 'State',
    copy: "Know what's happening in real time.",
    CapIcon: ChartNoAxesColumnIncreasing,
    capTitle: 'Reviewable execution',
    capBody: 'Validated, published, and audit-ready.',
  },
  {
    Icon: FileText,
    code: '02 / EVIDENCE SIGNAL',
    label: 'Evidence',
    copy: 'See what changed and why.',
    CapIcon: Users,
    capTitle: 'Builders & non-devs',
    capBody: 'Plain language for clear decisions, together.',
  },
  {
    Icon: LockKeyhole,
    code: '03 / PERMISSION SIGNAL',
    label: 'Permission',
    copy: 'Know who can act and when.',
    CapIcon: Rocket,
    capTitle: 'Hackathon-ready MVPs',
    capBody: 'Build and iterate on demo projects, fast.',
  },
  {
    Icon: ShieldAlert,
    code: '04 / BLOCKER SIGNAL',
    label: 'Blockers',
    copy: 'Surface risks that stop progress.',
    CapIcon: Network,
    capTitle: 'Outcome-first workflow',
    // "when authorised" is kept deliberately. The rest of this copy was shortened to
    // fit the compact card, but that clause is a claim about what the product will
    // and will not do on its own, not a stylistic flourish — a line reading
    // "validate → publish" describes something Xroga does not do unattended.
    capBody: 'Understand → implement → validate → publish when authorised.',
  },
] as const;

function InfinitySystem() {
  return (
    <div className="xv-er-core" aria-label="Xroga Black Hole V Infinity review system">
      <svg className="xv-er-orbits" viewBox="0 0 720 310" role="img" aria-labelledby="xv-er-infinity-title">
        <title id="xv-er-infinity-title">A connected infinity system representing continuous, reviewable execution</title>
        <defs>
          <linearGradient id="xv-er-edge" x1="0" x2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity=".16" />
            <stop offset=".5" stopColor="currentColor" stopOpacity=".92" />
            <stop offset="1" stopColor="currentColor" stopOpacity=".16" />
          </linearGradient>
          <linearGradient id="xv-er-ribbon" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity=".18" />
            <stop offset=".48" stopColor="currentColor" stopOpacity=".62" />
            <stop offset="1" stopColor="currentColor" stopOpacity=".12" />
          </linearGradient>
        </defs>
        <g className="xv-er-orbit-lines">
          <ellipse cx="360" cy="158" rx="328" ry="102" />
          <ellipse cx="360" cy="160" rx="285" ry="72" />
          <ellipse cx="360" cy="164" rx="232" ry="46" />
          <path d="M42 158C142 22 578 20 678 158" />
          <path d="M43 164C151 288 569 290 677 164" />
        </g>
        <g className="xv-er-ribbon">
          <path d="M155 165C155 94 211 64 267 78C310 89 333 128 360 158C389 190 412 229 458 235C519 243 566 207 566 158C566 107 519 72 460 80C414 86 389 127 360 158C331 189 307 230 259 236C203 243 155 213 155 165Z" />
          <path d="M169 164C169 108 213 84 259 94C300 103 326 136 360 171C395 207 419 229 461 223C509 217 551 190 551 159C551 125 511 99 465 94C421 89 395 115 360 151C327 185 300 217 258 225C212 233 169 211 169 164Z" />
        </g>
        <path className="xv-er-ribbon-edge" d="M155 165C155 94 211 64 267 78C310 89 333 128 360 158C389 190 412 229 458 235C519 243 566 207 566 158C566 107 519 72 460 80C414 86 389 127 360 158C331 189 307 230 259 236C203 243 155 213 155 165Z" />
        <g className="xv-er-nodes">
          <circle cx="155" cy="164" r="4" />
          <circle cx="360" cy="158" r="5" />
          <circle cx="566" cy="158" r="4" />
          <circle cx="360" cy="262" r="3" />
        </g>
        <path className="xv-er-ground" d="M118 270H602M180 284H540" />
      </svg>
      <div className="xv-er-core-meta" aria-hidden="true">
        <span>BLACK HOLE V∞</span><i /><span>REVIEW CORE ONLINE</span>
      </div>
    </div>
  );
}

export function HomepageEnterpriseProof() {
  const sectionRef = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12 },
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      className={`xv-er${isVisible ? ' is-visible' : ''}`}
      aria-labelledby="ent-heading"
    >
      <div className="xv-er-field" aria-hidden="true" />
      <div className="xv-er-inner">
        <div className="xv-er-stage">
          <div className="xv-er-stage-lines" aria-hidden="true" />
          <span className="xv-er-stage-edge" aria-hidden="true" />

          {/* The headline and the graphic share a row rather than stacking, which is
              most of where the height went. */}
          <div className="xv-er-top">
            <header className="xv-er-heading">
              <p><span className="xv-er-mark" aria-hidden="true">∞</span>BUILT FOR REAL REVIEW</p>
              <h2 id="ent-heading">Built for teams<br />that need <em>evidence</em>.</h2>
              <div>
                {XROGA_MODEL_FULL} keeps model selection internal while the product exposes the
                parts operators need to judge.
              </div>
            </header>

            <InfinitySystem />
          </div>

          <ol className="xv-er-signals" aria-label="What Xroga exposes for review">
            {SIGNALS.map(({ Icon, code, label, copy, CapIcon, capTitle, capBody }) => (
              <li key={label}>
                <div className="xv-er-signal-head">
                  <span className="xv-er-signal-icon"><Icon aria-hidden="true" /></span>
                  <div><small>{code}</small><h3>{label}</h3></div>
                </div>
                <p className="xv-er-signal-copy">{copy}</p>
                <div className="xv-er-signal-cap">
                  <CapIcon className="xv-er-cap-icon" aria-hidden="true" />
                  <div><b>{capTitle}</b><p>{capBody}</p></div>
                </div>
                <ArrowUpRight className="xv-er-cap-arrow" aria-hidden="true" />
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
