'use client';

import { GitBranch, Layers, Orbit, Rocket, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

const PIPELINE = [
  { id: 'convert', label: 'Converter', detail: 'Brief from your prompt' },
  { id: 'build', label: 'Builder', detail: 'Apex · Horizon · Forge' },
  { id: 'ship', label: 'Ship', detail: 'GitHub → Vercel live' },
] as const;

export function HomepageEmpowerSection() {
  return (
    <section className="xv-hc-empower" aria-labelledby="empower-heading">
      <div className="xv-hc-empower-inner">
        <header className="xv-hc-empower-head">
          <p className="xv-hc-empower-kicker font-pixel">BLACK HOLE OS</p>
          <h2 id="empower-heading" className="xv-hc-empower-title font-claude">
            One swarm. Your repo. Live domain.
          </h2>
          <p className="xv-hc-empower-sub">
            Xroga is not a chat toy — it converts intent, writes the product, and lands it on GitHub
            + Vercel while you stay in Workspace.
          </p>
        </header>

        <div className="xv-hc-empower-grid">
          <article className="xv-hc-empower-card xv-hc-empower-card--wide">
            <div className="xv-hc-empower-card-copy">
              <h3 className="font-claude">Converter → Builder → Live</h3>
              <p>
                Every prompt becomes a builder brief, then a real project. No model picker, no
                template catalog — just the Xroga swarm finishing the loop.
              </p>
            </div>
            <div className="xv-hc-empower-mock" aria-hidden>
              <div className="xv-hc-empower-agent">
                <p className="xv-hc-empower-agent-title font-coding">
                  <Orbit className="w-3 h-3 inline mr-1" />
                  Pipeline
                </p>
                <ol className="xv-hc-empower-pipeline">
                  {PIPELINE.map((step, i) => (
                    <li key={step.id} className={cn('xv-hc-empower-pipe-step', i === 1 && 'is-active')}>
                      <span className="xv-hc-empower-pipe-idx font-pixel">{i + 1}</span>
                      <div>
                        <strong>{step.label}</strong>
                        <span>{step.detail}</span>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="xv-hc-empower-stats">
                <div className="xv-hc-empower-stat">
                  <Sparkles className="w-3.5 h-3.5" />
                  <div>
                    <strong>Swarm roles</strong>
                    <span>Apex · Horizon · Forge · Live</span>
                  </div>
                </div>
                <div className="xv-hc-empower-stat">
                  <GitBranch className="w-3.5 h-3.5" />
                  <div>
                    <strong>Ownership</strong>
                    <span>Pushed to your GitHub</span>
                  </div>
                </div>
                <div className="xv-hc-empower-stat">
                  <Rocket className="w-3.5 h-3.5" />
                  <div>
                    <strong>Deploy</strong>
                    <span>Live on your Vercel domain</span>
                  </div>
                </div>
              </div>
            </div>
          </article>

          <article className="xv-hc-empower-card xv-hc-empower-card--metric">
            <p className="xv-hc-empower-metric font-claude">
              100%
              <span>finish rate target</span>
            </p>
            <p className="xv-hc-empower-card-body">
              When the swarm guides a build, we aim for a complete handoff — preview, files, push,
              and deploy — not a half-done demo.
            </p>
          </article>

          <article className="xv-hc-empower-card xv-hc-empower-card--scale">
            <div className="xv-hc-empower-card-copy">
              <h3 className="font-claude">Stay on one project thread</h3>
              <p>
                Updates patch your selected repo — themes, auth, pages — without throwing away the
                build you already shipped.
              </p>
            </div>
            <div className="xv-hc-empower-scale-visual" aria-hidden>
              <div className="xv-hc-empower-scale-bar">
                <span className="font-coding">
                  <Layers className="w-3 h-3 inline mr-1" />
                  workspace · repo · preview
                </span>
                <em>continuous</em>
              </div>
              <div className="xv-hc-empower-scale-pane" />
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
