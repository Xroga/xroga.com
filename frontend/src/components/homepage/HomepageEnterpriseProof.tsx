'use client';

import { Award, Building2, Infinity, Target, Users } from 'lucide-react';
import { XROGA_MODEL_FULL } from '@/lib/brand';

const PROOFS = [
  {
    Icon: Building2,
    title: 'Reviewable execution',
    body: 'One customer-facing Xroga AI experience with changed files, validation, and publishing evidence.',
  },
  {
    Icon: Target,
    title: 'Hackathon-ready MVPs',
    body: 'Build and iterate on demo projects in the same connected repository, with blockers shown truthfully.',
  },
  {
    Icon: Users,
    title: 'Builders & non-devs',
    body: 'Plain language starts the work; required decisions, credentials, and review remain visible to the operator.',
  },
  {
    Icon: Award,
    title: 'Outcome-first workflow',
    body: 'Understand → implement → validate → repair → push or publish when authorised.',
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
          <p className="xv-hc-ent-kicker font-pixel">BUILT FOR REAL REVIEW</p>
          <h2 id="ent-heading" className="xv-hc-ent-title">
            Built for teams that need evidence.
          </h2>
          <p className="xv-hc-ent-lead">
            {XROGA_MODEL_FULL} keeps model selection internal while the product exposes the parts
            operators need to judge: state, evidence, permission, and blockers.
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
