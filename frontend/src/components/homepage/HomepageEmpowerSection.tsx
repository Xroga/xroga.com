'use client';

import { GitBranch, Layers, Orbit, Rocket, Sparkles, Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';

const PIPELINE = [
  { id: 'convert', label: 'Converter', detail: 'Pulse turns intent into a builder brief' },
  { id: 'build', label: 'Builder', detail: 'Apex · Horizon · Forge write the product' },
  { id: 'ship', label: 'Ship', detail: 'Your GitHub → your Vercel domain' },
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
            Xroga is a production coding agent — not a chat demo. Describe the product once;
            Black Hole V∞ converts, builds, previews in Workspace, pushes your sticky GitHub repo,
            and deploys on your Vercel domain.
          </p>
        </header>

        <div className="xv-hc-empower-grid">
          <article className="xv-hc-empower-card xv-hc-empower-card--wide">
            <div className="xv-hc-empower-card-copy">
              <h3 className="font-claude">Converter → Builder → Live</h3>
              <p>
                Every prompt becomes a real project: brief, files, QA, then ownership. No model
                picker. No template catalog. The swarm finishes the loop on accounts you control.
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
                    <span>Apex · Horizon · Forge · Live · Lens</span>
                  </div>
                </div>
                <div className="xv-hc-empower-stat">
                  <GitBranch className="w-3.5 h-3.5" />
                  <div>
                    <strong>Ownership</strong>
                    <span>Sticky repo on your GitHub</span>
                  </div>
                </div>
                <div className="xv-hc-empower-stat">
                  <Rocket className="w-3.5 h-3.5" />
                  <div>
                    <strong>Deploy</strong>
                    <span>Live on your Vercel domain</span>
                  </div>
                </div>
                <div className="xv-hc-empower-stat">
                  <Terminal className="w-3.5 h-3.5" />
                  <div>
                    <strong>Workspace</strong>
                    <span>Preview · patch · ship again</span>
                  </div>
                </div>
              </div>
            </div>
          </article>

          <article className="xv-hc-empower-card xv-hc-empower-card--metric">
            <p className="xv-hc-empower-metric font-claude">
              Full loop
              <span>preview → push → live</span>
            </p>
            <p className="xv-hc-empower-card-body">
              Hand-off is a real project: Workspace preview, files in your GitHub, Vercel deploy.
              Connect integrations early so a long build can finish shipped — not stuck at the last
              mile.
            </p>
          </article>

          <article className="xv-hc-empower-card xv-hc-empower-card--scale">
            <div className="xv-hc-empower-card-copy">
              <h3 className="font-claude">Stay on one project thread</h3>
              <p>
                First ship remembers the sticky repo. Follow-ups patch themes, auth, pages, and
                agents on the same live product — continuous polish without starting over.
              </p>
            </div>
            <div className="xv-hc-empower-scale-visual" aria-hidden>
              <div className="xv-hc-empower-scale-bar">
                <span className="font-coding">
                  <Layers className="w-3 h-3 inline mr-1" />
                  workspace · sticky repo · live preview
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
