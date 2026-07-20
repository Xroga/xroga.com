'use client';

import {
  GitBranch,
  Globe2,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Workflow,
} from 'lucide-react';

const STEPS = [
  {
    Icon: Workflow,
    title: 'Prompt once',
    body: 'Describe the product — website, SaaS, crypto dashboard, ASP agent. Black Hole V∞ converts intent into a builder brief.',
  },
  {
    Icon: GitBranch,
    title: 'Own the repo',
    body: 'First ship creates your GitHub repository. Every later prompt updates that same live product — no orphan repos.',
  },
  {
    Icon: Rocket,
    title: 'Go live on Vercel',
    body: 'Deploy to your Vercel project and domain. Preview in Workspace, then ship for real.',
  },
  {
    Icon: RefreshCw,
    title: 'Iterate forever',
    body: 'Follow-ups patch code, redeploy, and keep the sticky repo in sync. Hackathon polish without starting over.',
  },
  {
    Icon: Globe2,
    title: 'Research that ships',
    body: 'When you need live rules, markets, or hackathon intel, the swarm gathers sources then turns them into product.',
  },
  {
    Icon: ShieldCheck,
    title: 'Your keys, your stack',
    body: 'Authorize GitHub + Vercel (+ optional Supabase). Secrets stay in your vault — Xroga builds on your accounts.',
  },
] as const;

export function HomepageShipStack() {
  return (
    <section className="xv-hc-ship" aria-labelledby="ship-heading">
      <div className="xv-hc-ship-inner">
        <p className="xv-hc-pixel-kicker" id="ship-heading">
          SHIP STACK
        </p>
        <h2 className="xv-hc-section-title">
          From prompt to <em>production ownership.</em>
        </h2>
        <p className="xv-hc-section-copy">
          Big companies care about who owns the code and where it runs. Xroga answers both: your
          GitHub, your Vercel, continuous updates inside Black Hole V∞.
        </p>

        <ul className="xv-hc-ship-grid">
          {STEPS.map((step, i) => (
            <li key={step.title} className="xv-hc-ship-card" style={{ animationDelay: `${0.06 * i}s` }}>
              <span className="xv-hc-ship-icon" aria-hidden>
                <step.Icon className="xv-hc-ship-lucide" strokeWidth={1.75} />
              </span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
