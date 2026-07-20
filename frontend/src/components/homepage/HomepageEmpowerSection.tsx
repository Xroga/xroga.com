'use client';

import { useEffect, useState } from 'react';
import {
  Check,
  Circle,
  FileCode2,
  GitBranch,
  Globe2,
  Loader2,
  Rocket,
  Terminal,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const PIPE_STEPS = [
  { id: 'convert', label: 'Converter', detail: 'Pulse → builder brief', agent: 'Pulse' },
  { id: 'build', label: 'Builder', detail: 'Apex · Horizon · Forge', agent: 'Apex' },
  { id: 'qa', label: 'QA', detail: 'Checks · compile', agent: 'Horizon' },
  { id: 'ship', label: 'Ship', detail: 'GitHub → Vercel', agent: 'Deploy' },
] as const;

const PROMPT_ROTATION = [
  'Build a crypto vault dashboard with auth…',
  'Ship a SaaS onboarding flow + Stripe…',
  'Hackathon landing — demo-ready tonight…',
  'Marketing site with blog + waitlist…',
  'Internal ops board for the team…',
  'Add night/day theme — keep sticky repo…',
] as const;

const FILES_BY_SCENE = [
  [
    { path: 'app/page.tsx', status: 'written' },
    { path: 'app/api/auth/route.ts', status: 'written' },
    { path: 'components/VaultCard.tsx', status: 'writing' },
    { path: 'vercel.json', status: 'queued' },
  ],
  [
    { path: 'app/(saas)/onboard/page.tsx', status: 'written' },
    { path: 'app/api/stripe/route.ts', status: 'writing' },
    { path: 'components/Checkout.tsx', status: 'queued' },
    { path: 'supabase/schema.sql', status: 'queued' },
  ],
  [
    { path: 'app/page.tsx', status: 'written' },
    { path: 'components/PitchHero.tsx', status: 'writing' },
    { path: 'app/demo/page.tsx', status: 'queued' },
    { path: 'public/og.png', status: 'queued' },
  ],
] as const;

const ACTIVITY = [
  'Sticky repo bound · you/acme-vault',
  'Preview hot on Workspace',
  'Push main · deploy production',
] as const;

export function HomepageEmpowerSection() {
  const [step, setStep] = useState(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = window.setInterval(() => {
      setStep((s) => (s + 1) % PIPE_STEPS.length);
      setTick((n) => n + 1);
    }, 2200);
    return () => window.clearInterval(t);
  }, []);

  const liveUrl =
    step >= 3 ? 'acme-vault.vercel.app' : step >= 1 ? 'preview.workspace' : 'waiting…';

  return (
    <section className="xv-hc-ops" aria-labelledby="empower-heading">
      <div className="xv-hc-ops-inner">
        <header className="xv-hc-ops-head">
          <p className="xv-hc-ops-kicker font-pixel">LIVE WORKSPACE</p>
          <h2 id="empower-heading" className="xv-hc-ops-title">
            One swarm. <em>Your</em> repo. <em>Live</em> domain.
          </h2>
          <p className="xv-hc-ops-sub">
            Not a chat toy — Black Hole V∞ converts, builds, previews in Workspace, pushes your
            sticky GitHub repo, and deploys on your Vercel. Watch the loop.
          </p>
        </header>

        <div className="xv-hc-ops-dash" aria-hidden>
          {/* Top chrome */}
          <div className="xv-hc-ops-chrome">
            <div className="xv-hc-ops-dots">
              <span />
              <span />
              <span />
            </div>
            <span className="xv-hc-ops-chrome-path font-coding">
              <Terminal className="w-3 h-3" />
              workspace · sticky repo · live
            </span>
            <span className={cn('xv-hc-ops-livepill', step >= 3 && 'is-live')}>
              {step >= 3 ? 'LIVE' : 'BUILDING'}
            </span>
          </div>

          <div className="xv-hc-ops-body">
            {/* Pipeline rail */}
            <aside className="xv-hc-ops-rail">
              <p className="xv-hc-ops-rail-label font-pixel">PIPELINE</p>
              <ol className="xv-hc-ops-steps">
                {PIPE_STEPS.map((s, i) => {
                  const state = i < step ? 'done' : i === step ? 'active' : 'pending';
                  return (
                    <li key={s.id} className={cn('xv-hc-ops-step', `is-${state}`)}>
                      <span className="xv-hc-ops-step-ico">
                        {state === 'done' ? (
                          <Check className="w-3 h-3" strokeWidth={2.5} />
                        ) : state === 'active' ? (
                          <Loader2 className="w-3 h-3 xv-hc-ops-spin" strokeWidth={2.5} />
                        ) : (
                          <Circle className="w-3 h-3" strokeWidth={2} />
                        )}
                      </span>
                      <div>
                        <strong>{s.label}</strong>
                        <span>{s.detail}</span>
                      </div>
                      <em>{s.agent}</em>
                    </li>
                  );
                })}
              </ol>
            </aside>

            {/* Center — file tree + prompt */}
            <div className="xv-hc-ops-main">
              <div className="xv-hc-ops-prompt">
                <span className="font-pixel">YOU</span>
                <p key={tick % PROMPT_ROTATION.length}>
                  {PROMPT_ROTATION[tick % PROMPT_ROTATION.length]}
                  <i className="xv-hc-ops-caret" />
                </p>
              </div>

              <ul className="xv-hc-ops-files">
                {FILES_BY_SCENE[tick % FILES_BY_SCENE.length].map((f, i) => {
                  const writing = step === 1 && i === 2;
                  const done =
                    step > 1 || (step === 1 && i < 2) || (step === 0 && i < 1);
                  return (
                    <li
                      key={`${tick}-${f.path}`}
                      className={cn(
                        'xv-hc-ops-file',
                        writing && 'is-writing',
                        done && 'is-done'
                      )}
                    >
                      <FileCode2 className="w-3.5 h-3.5 shrink-0" />
                      <code>{f.path}</code>
                      <span>
                        {writing ? 'writing…' : done ? '✓' : 'queued'}
                      </span>
                    </li>
                  );
                })}
              </ul>

              <div className="xv-hc-ops-activity">
                {ACTIVITY.map((line, i) => (
                  <p
                    key={line}
                    className={cn('xv-hc-ops-actline', step >= i + 1 && 'is-on')}
                  >
                    <span className="xv-hc-ops-actdot" />
                    {line}
                  </p>
                ))}
              </div>
            </div>

            {/* Right — ownership strip */}
            <aside className="xv-hc-ops-side">
              <div className="xv-hc-ops-side-card">
                <GitBranch className="w-3.5 h-3.5" />
                <div>
                  <strong>Ownership</strong>
                  <span>you/acme-vault</span>
                </div>
              </div>
              <div className="xv-hc-ops-side-card">
                <Rocket className="w-3.5 h-3.5" />
                <div>
                  <strong>Deploy</strong>
                  <span className={cn(step >= 3 && 'is-live-url')}>{liveUrl}</span>
                </div>
              </div>
              <div className="xv-hc-ops-side-card">
                <Globe2 className="w-3.5 h-3.5" />
                <div>
                  <strong>Thread</strong>
                  <span>sticky · continuous</span>
                </div>
              </div>
              <p className="xv-hc-ops-side-note">
                Connect GitHub + Vercel early — so the build finishes shipped, not stuck at the last
                mile.
              </p>
            </aside>
          </div>
        </div>

        <p className="xv-hc-ops-foot">
          First ship remembers the sticky repo. Follow-ups patch themes, auth, pages — same live
          product. No model picker. No template catalog. The swarm finishes the loop on accounts you
          control.
        </p>
      </div>
    </section>
  );
}
