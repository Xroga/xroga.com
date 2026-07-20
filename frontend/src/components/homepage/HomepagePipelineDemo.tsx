'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

const BUILD_SCENES = [
  {
    prompt: 'Build a crypto staking dashboard…',
    file: 'src/app/page.tsx',
    del: '- // TODO: wire auth',
    addOpen: '+ export default function StakingPage() {',
    addBody: '+   return <VaultDashboard />',
    addClose: '+ }',
    checks: ['Preview ready', 'Checks passed', 'Domain mapped'],
  },
  {
    prompt: 'Ship a SaaS waitlist with Stripe…',
    file: 'app/api/checkout/route.ts',
    del: '- // placeholder checkout',
    addOpen: '+ export async function POST(req: Request) {',
    addBody: '+   return stripe.sessions.create(…)',
    addClose: '+ }',
    checks: ['Auth wired', 'Billing live', 'Domain mapped'],
  },
  {
    prompt: 'Hackathon MVP — pitch deck site…',
    file: 'components/Hero.tsx',
    del: '- <h1>Coming soon</h1>',
    addOpen: '+ export function Hero() {',
    addBody: '+   return <PitchLanding />',
    addClose: '+ }',
    checks: ['Preview ready', 'Demo URL', 'Domain mapped'],
  },
  {
    prompt: 'Landing page for our AI product…',
    file: 'app/page.tsx',
    del: '- export default function Home() {}',
    addOpen: '+ export default function Home() {',
    addBody: '+   return <ProductLanding />',
    addClose: '+ }',
    checks: ['Lighthouse pass', 'OG images', 'Domain mapped'],
  },
  {
    prompt: 'Internal ops dashboard for the team…',
    file: 'app/dashboard/page.tsx',
    del: '- // stub table',
    addOpen: '+ export default function OpsBoard() {',
    addBody: '+   return <TeamMetrics />',
    addClose: '+ }',
    checks: ['RBAC ready', 'Checks passed', 'Deploy live'],
  },
] as const;

const PIPELINE_STEPS = [
  { id: 'prompt', label: 'Prompt received', detail: 'User started a build in Workspace' },
  { id: 'analyze', label: 'Analyzing repo', detail: 'Scanning structure, deps, routes' },
  { id: 'build', label: 'Swarm building', detail: 'Xroga Apex drafting production files' },
  { id: 'debug', label: 'Debug + refactor', detail: 'Horizon pass for long-horizon fixes' },
  { id: 'github', label: 'Pushed to GitHub', detail: 'github.com/you/xroga-build' },
  { id: 'vercel', label: 'Live on Vercel', detail: 'yourapp.xroga.app · custom domain ready' },
] as const;

export function HomepagePipelineDemo() {
  const [sceneIdx, setSceneIdx] = useState(0);
  const [promptPhase, setPromptPhase] = useState(0);
  const [stepIdx, setStepIdx] = useState(0);
  const [diffTick, setDiffTick] = useState(0);

  useEffect(() => {
    const t = window.setInterval(() => {
      setSceneIdx((i) => (i + 1) % BUILD_SCENES.length);
      setPromptPhase(0);
      setDiffTick(0);
    }, 9000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => {
      setPromptPhase((i) => (i + 1) % 4);
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

  const scene = BUILD_SCENES[sceneIdx];
  const promptLines = [
    scene.prompt,
    'Analyzing workspace + repo…',
    'Converter → Builder brief ready…',
    'Generating app files…',
  ] as const;
  const DIFF_LINES = [
    { type: 'meta', text: scene.file },
    { type: 'del', text: scene.del },
    { type: 'add', text: scene.addOpen },
    { type: 'add', text: scene.addBody },
    { type: 'add', text: scene.addClose },
  ] as const;
  const visibleDiff = DIFF_LINES.slice(0, 1 + (diffTick % DIFF_LINES.length));

  return (
    <div className="xv-hc-demo" aria-hidden>
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
            <p key={`${sceneIdx}-${promptPhase}`} className="xv-hc-demo-prompt-text">
              {promptLines[promptPhase]}
              <i className="xv-hc-demo-caret" />
            </p>
          </div>
          <ul className="xv-hc-demo-checks">
            {scene.checks.map((item, i) => (
              <li key={`${sceneIdx}-${item}`} className={cn(stepIdx >= i + 3 && 'is-done')}>
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
