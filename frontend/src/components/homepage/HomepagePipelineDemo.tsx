'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

const PROMPT_STEPS = [
  'Build a crypto staking dashboard…',
  'Analyzing workspace + repo…',
  'Converter → Builder brief ready…',
  'Generating app files…',
] as const;

const PIPELINE_STEPS = [
  { id: 'prompt', label: 'Prompt received', detail: 'User started a build in Workspace' },
  { id: 'analyze', label: 'Analyzing repo', detail: 'Scanning structure, deps, routes' },
  { id: 'build', label: 'Swarm building', detail: 'Xroga Apex drafting production files' },
  { id: 'debug', label: 'Debug + refactor', detail: 'Horizon pass for long-horizon fixes' },
  { id: 'github', label: 'Pushed to GitHub', detail: 'github.com/you/xroga-build' },
  { id: 'vercel', label: 'Live on Vercel', detail: 'yourapp.xroga.app · custom domain ready' },
] as const;

const DIFF_LINES = [
  { type: 'meta', text: 'src/app/page.tsx' },
  { type: 'del', text: '- // TODO: wire auth' },
  { type: 'add', text: '+ export default function StakingPage() {' },
  { type: 'add', text: '+   return <VaultDashboard />' },
  { type: 'add', text: '+ }' },
] as const;

export function HomepagePipelineDemo() {
  const [promptIdx, setPromptIdx] = useState(0);
  const [stepIdx, setStepIdx] = useState(0);
  const [diffTick, setDiffTick] = useState(0);

  useEffect(() => {
    const t = window.setInterval(() => {
      setPromptIdx((i) => (i + 1) % PROMPT_STEPS.length);
    }, 2200);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => {
      setStepIdx((i) => (i + 1) % PIPELINE_STEPS.length);
    }, 1800);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => {
      setDiffTick((n) => n + 1);
    }, 1400);
    return () => window.clearInterval(t);
  }, []);

  const visibleDiff = DIFF_LINES.slice(0, 1 + (diffTick % DIFF_LINES.length));

  return (
    <div className="xv-hc-demo" aria-hidden>
      {/* Card 1 — live workspace prompt */}
      <article className="xv-hc-demo-card">
        <header className="xv-hc-demo-card-head">
          <h3>Ship with confidence</h3>
          <p>Watch a real build loop — prompt to live domain.</p>
        </header>
        <div className="xv-hc-demo-panel xv-hc-demo-panel--workspace">
          <div className="xv-hc-demo-chrome">
            <span />
            <span />
            <span />
            <em>workspace · xroga</em>
          </div>
          <div className="xv-hc-demo-prompt">
            <span className="xv-hc-demo-prompt-label">You</span>
            <p key={promptIdx} className="xv-hc-demo-prompt-text">
              {PROMPT_STEPS[promptIdx]}
              <i className="xv-hc-demo-caret" />
            </p>
          </div>
          <ul className="xv-hc-demo-checks">
            {['Preview ready', 'Checks passed', 'Domain mapped'].map((item, i) => (
              <li
                key={item}
                className={cn(stepIdx >= i + 3 && 'is-done')}
              >
                <span className="xv-hc-demo-check" />
                {item}
              </li>
            ))}
          </ul>
          <button type="button" className="xv-hc-demo-merge xv-hc-btn-glass" tabIndex={-1}>
            Deploy live
          </button>
        </div>
      </article>

      {/* Card 2 — pipeline timeline */}
      <article className="xv-hc-demo-card">
        <header className="xv-hc-demo-card-head">
          <h3>Adapts to your standards</h3>
          <p>Analyze, refactor, push, deploy — one modern flow.</p>
        </header>
        <div className="xv-hc-demo-panel xv-hc-demo-panel--timeline">
          <ol className="xv-hc-demo-timeline">
            {PIPELINE_STEPS.map((step, i) => {
              const state =
                i < stepIdx ? 'done' : i === stepIdx ? 'active' : 'pending';
              return (
                <li key={step.id} className={cn('xv-hc-demo-step', `is-${state}`)}>
                  <span className="xv-hc-demo-step-dot" />
                  <div>
                    <strong>{step.label}</strong>
                    <span>{step.detail}</span>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </article>

      {/* Card 3 — live diff + swarm note */}
      <article className="xv-hc-demo-card">
        <header className="xv-hc-demo-card-head">
          <h3>High signal, low noise</h3>
          <p>Debug, update, delete, then ship — clear every step.</p>
        </header>
        <div className="xv-hc-demo-panel xv-hc-demo-panel--diff">
          <div className="xv-hc-demo-bot">
            <span className="xv-hc-demo-bot-avatar">X</span>
            <div>
              <strong>
                Xroga Swarm <em>bot</em>
              </strong>
              <p>Refactor complete · preparing GitHub push</p>
            </div>
          </div>
          <pre className="xv-hc-demo-diff">
            {visibleDiff.map((line) => (
              <code
                key={`${line.type}-${line.text}`}
                className={cn(
                  line.type === 'add' && 'is-add',
                  line.type === 'del' && 'is-del',
                  line.type === 'meta' && 'is-meta',
                )}
              >
                {line.text}
              </code>
            ))}
          </pre>
          <div className="xv-hc-demo-user">
            <span className="xv-hc-demo-user-avatar">U</span>
            <p>Looks good — auto-deploy to my domain.</p>
          </div>
        </div>
      </article>
    </div>
  );
}
