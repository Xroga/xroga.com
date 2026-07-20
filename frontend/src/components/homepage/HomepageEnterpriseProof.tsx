'use client';

import { Award, Building2, Infinity, Target, Users } from 'lucide-react';
import { XROGA_MODEL_FULL } from '@/lib/brand';

const PROOFS = [
  {
    Icon: Building2,
    title: 'Enterprise-readable',
    body: 'One branded model — Black Hole V∞ — instead of a confusing vendor zoo. Security reviews see a clear ship path.',
  },
  {
    Icon: Target,
    title: 'Hackathon-ready MVPs',
    body: 'Ship dashboards, ASP agents, and SaaS shells fast — then polish on the same sticky repo until demo day.',
  },
  {
    Icon: Users,
    title: 'Builders & non-devs',
    body: 'Plain language in. Working product out. Teams that can’t staff a full eng pod still leave with GitHub + live URL.',
  },
  {
    Icon: Award,
    title: '#1 coding agent posture',
    body: 'Converter → swarm → QA → push → deploy. Competitors stop at chat or IDE edits. Xroga finishes the loop.',
  },
] as const;

export function HomepageEnterpriseProof() {
  return (
    <section className="xv-hc-ent" aria-labelledby="ent-heading">
      <div className="xv-hc-ent-inner">
        <div className="xv-hc-ent-banner xv-hc-ent-banner--alive">
          <span className="xv-hc-ent-orbit" aria-hidden>
            <span className="xv-hc-ent-orbit-ring" />
            <Infinity className="xv-hc-ent-inf" strokeWidth={2.25} />
          </span>
          <p className="xv-hc-ent-kicker font-pixel">WHY TEAMS SAY WOW</p>
          <h2 id="ent-heading" className="xv-hc-ent-title">
            Built so high-level companies stop scrolling.
          </h2>
          <p className="xv-hc-ent-lead">
            When a serious buyer opens Xroga, they should feel {XROGA_MODEL_FULL} is already the
            last coding agent they’ll need — continuously updated, never “wait for the next model.”
          </p>
          <div className="xv-hc-ent-signal" aria-hidden>
            <span />
            <span />
            <span />
          </div>
        </div>

        <ul className="xv-hc-ent-grid">
          {PROOFS.map((p, i) => (
            <li
              key={p.title}
              className="xv-hc-ent-card xv-hc-ent-card--alive"
              style={{ animationDelay: `${0.08 * i}s` }}
            >
              <span className="xv-hc-ent-icon" aria-hidden>
                <p.Icon className="xv-hc-ent-lucide" strokeWidth={1.75} />
              </span>
              <h3>{p.title}</h3>
              <p>{p.body}</p>
              <span className="xv-hc-ent-card-glow" aria-hidden />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
