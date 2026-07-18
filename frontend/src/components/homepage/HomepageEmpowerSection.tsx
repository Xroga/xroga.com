'use client';

import { Brain, CircleDot, Lock, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

const ROUTES = [
  {
    id: 'standard',
    name: 'Swarm Core',
    tag: 'All users',
    locked: false,
    active: true,
  },
  {
    id: 'max',
    name: 'Swarm Max',
    tag: 'Pro only',
    locked: true,
    active: false,
  },
] as const;

const STATS = [
  { icon: Zap, label: 'Speed', value: 'High' },
  { icon: Brain, label: 'Intelligence', value: 'High' },
  { icon: CircleDot, label: 'Token cost', value: 'Balanced' },
] as const;

export function HomepageEmpowerSection() {
  return (
    <section className="xv-hc-empower" aria-labelledby="empower-heading">
      <div className="xv-hc-empower-inner">
        <header className="xv-hc-empower-head">
          <h2 id="empower-heading" className="xv-hc-empower-title font-claude">
            Empowering builders with a swarm that actually ships
          </h2>
          <p className="xv-hc-empower-sub">
            Xroga handles routing, testing, and deploy — so you stay on the product, not the
            plumbing.
          </p>
        </header>

        <div className="xv-hc-empower-grid">
          {/* Full-width top card */}
          <article className="xv-hc-empower-card xv-hc-empower-card--wide">
            <div className="xv-hc-empower-card-copy">
              <h3 className="font-claude">The right agent, every prompt</h3>
              <p>
                Xroga routes each request across Apex, Horizon, Forge, and Live — balancing quality,
                speed, and cost without you picking models.
              </p>
            </div>
            <div className="xv-hc-empower-mock" aria-hidden>
              <div className="xv-hc-empower-agent">
                <p className="xv-hc-empower-agent-title font-coding">Xroga Agent</p>
                <ul className="xv-hc-empower-routes">
                  {ROUTES.map((r) => (
                    <li
                      key={r.id}
                      className={cn('xv-hc-empower-route', r.active && 'is-active')}
                    >
                      <span className="xv-hc-empower-route-dot" />
                      <span className="xv-hc-empower-route-name">{r.name}</span>
                      {r.locked ? (
                        <span className="xv-hc-empower-route-tag xv-hc-empower-route-tag--lock">
                          <Lock className="w-3 h-3" />
                          {r.tag}
                        </span>
                      ) : (
                        <span className="xv-hc-empower-route-tag">{r.tag}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="xv-hc-empower-stats">
                {STATS.map(({ icon: Icon, label, value }) => (
                  <div key={label} className="xv-hc-empower-stat">
                    <Icon className="w-3.5 h-3.5" />
                    <div>
                      <strong>{label}</strong>
                      <span>{value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </article>

          {/* Metric card */}
          <article className="xv-hc-empower-card xv-hc-empower-card--metric">
            <p className="xv-hc-empower-metric font-claude">
              98%
              <span>fewer dead ends</span>
            </p>
            <p className="xv-hc-empower-card-body">
              The swarm tests, refactors, and iterates in-loop — so you keep building instead of
              babysitting broken previews.
            </p>
          </article>

          {/* Scale card */}
          <article className="xv-hc-empower-card xv-hc-empower-card--scale">
            <div className="xv-hc-empower-card-copy">
              <h3 className="font-claude">Ship big without breaking</h3>
              <p>
                Context stays locked to your GitHub project. Update night/day themes, auth, or whole
                pages — without rewriting from scratch.
              </p>
            </div>
            <div className="xv-hc-empower-scale-visual" aria-hidden>
              <div className="xv-hc-empower-scale-bar">
                <span className="font-coding">repo · workspace · preview</span>
                <em>1,000× context</em>
              </div>
              <div className="xv-hc-empower-scale-pane" />
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
