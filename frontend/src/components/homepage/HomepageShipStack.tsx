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
    body: 'Describe the product — website, SaaS, crypto dashboard, ASP agent. Pulse converts intent into a builder brief Black Hole V∞ can execute.',
  },
  {
    Icon: GitBranch,
    title: 'Own the sticky repo',
    body: 'First ship creates your GitHub repository and remembers it. Later prompts update that same live product — no orphan repos.',
  },
  {
    Icon: Rocket,
    title: 'Go live on Vercel',
    body: 'Deploy to your Vercel project and domain. Preview in Workspace, then ship for real on accounts you authorize.',
  },
  {
    Icon: RefreshCw,
    title: 'Iterate forever',
    body: 'Follow-ups surgically patch code and redeploy. Hackathon polish and enterprise iteration without restarting the build.',
  },
  {
    Icon: Globe2,
    title: 'Research that ships',
    body: 'Live web + X intel when you need current rules or markets — then the same swarm turns findings into product files.',
  },
  {
    Icon: ShieldCheck,
    title: 'Your keys, your stack',
    body: 'Authorize GitHub + Vercel (+ optional Supabase). Secrets stay in your vault. Xroga builds on your ownership.',
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
          Enterprises ask who owns the code and where it runs. Xroga answers both: your GitHub,
          your Vercel, continuous updates inside Black Hole V∞ — the #1 coding agent that finishes
          the loop.
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
