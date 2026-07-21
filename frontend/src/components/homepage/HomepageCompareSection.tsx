'use client';

import Image from 'next/image';

const COLUMNS = [
  {
    id: 'xroga',
    name: 'Xroga',
    logo: '/brand/xroga-mark.png',
    highlight: true,
  },
  {
    id: 'cursor',
    name: 'Cursor',
    logo: '/brand/logos/cursor.svg',
    highlight: false,
  },
  {
    id: 'codex',
    name: 'Codex',
    logo: '/brand/logos/openai.svg',
    highlight: false,
  },
  {
    id: 'claude',
    name: 'Claude',
    logo: '/brand/logos/anthropic.svg',
    highlight: false,
  },
  {
    id: 'replit',
    name: 'Replit',
    logo: '/brand/logos/replit.svg',
    highlight: false,
  },
] as const;

const ROWS: Array<{
  feature: string;
  xroga: string;
  cursor: string;
  codex: string;
  claude: string;
  replit: string;
}> = [
  {
    feature: 'Best for',
    xroga: 'Ship a live product from a prompt',
    cursor: 'Fast coding inside a desktop IDE',
    codex: 'Agent tasks in your existing toolchain',
    claude: 'Deep reasoning + code help in chat / IDE',
    replit: 'Cloud IDE + quick hosted prototypes',
  },
  {
    feature: 'You start with',
    xroga: 'A product prompt in Workspace',
    cursor: 'An open repo + Composer/chat',
    codex: 'CLI / IDE agent runs you supervise',
    claude: 'A chat thread or Claude Code session',
    replit: 'A Replit project or Agent ask',
  },
  {
    feature: 'What you get',
    xroga: 'Working app files + GitHub push',
    cursor: 'Edits & refactors in your editor',
    codex: 'Patches / PRs you review',
    claude: 'Answers, diffs, and guided edits',
    replit: 'Runnable cloud project (exportable)',
  },
  {
    feature: 'Output ownership',
    xroga: 'Your GitHub repo',
    cursor: 'Your local / remote repo',
    codex: 'Your repo',
    claude: 'Your files / repo (you control)',
    replit: 'Replit project (you can export)',
  },
  {
    feature: 'Go live',
    xroga: 'Your Vercel + domain in-flow',
    cursor: 'You deploy with your own stack',
    codex: 'You deploy with your own stack',
    claude: 'You deploy with your own stack',
    replit: 'Replit hosting / publish',
  },
  {
    feature: 'Backend / data',
    xroga: 'Optional: your Supabase keys in vault',
    cursor: 'You wire databases yourself',
    codex: 'You wire databases yourself',
    claude: 'You wire databases yourself',
    replit: 'Replit DB / your own services',
  },
  {
    feature: 'Who runs the loop',
    xroga: 'Multi-model swarm → build → QA → ship',
    cursor: 'You + AI pair-programming',
    codex: 'Agent steps you approve',
    claude: 'You + Claude in the loop',
    replit: 'Agent + cloud workspace',
  },
  {
    feature: 'Usage limits',
    xroga: 'Monthly plan pool — build until it lasts',
    cursor: 'Rate limits & plan caps; often feels low fast',
    codex: 'Usage caps; bursts hit limits quickly',
    claude: 'Session / plan limits; 5-hour style resets common',
    replit: 'Agent / compute quotas reset on a short cycle',
  },
  {
    feature: 'Unused tokens',
    xroga: 'Unused API credit rolls up to 1 month',
    cursor: 'No month-to-month token rollover',
    codex: 'No month-to-month token rollover',
    claude: 'No month-to-month token rollover',
    replit: 'Unused quota typically does not roll over',
  },
];

function cell(row: (typeof ROWS)[number], id: (typeof COLUMNS)[number]['id']) {
  return row[id];
}

export function HomepageCompareSection() {
  return (
    <section className="xv-hc-compare" aria-labelledby="compare-heading">
      <div className="xv-hc-compare-inner">
        <p className="xv-hc-pixel-kicker" id="compare-heading">
          COMPARE
        </p>
        <h2 className="xv-hc-section-title">
          Fair look: ship loop vs coding tools
        </h2>
        <p className="xv-hc-section-copy">
          Cursor, Codex, Claude, and Replit are strong for writing and editing code. Xroga is built
          to take a product prompt to your GitHub + Vercel — with optional Supabase — without
          starting in an IDE. Other tools often hit 5-hour resets and burn through usage fast, with
          no rollover of unused tokens. Xroga meters a monthly pool and rolls unused API credit up
          to one month.
        </p>

        <div className="xv-hc-compare-scroll" role="region" aria-label="Product comparison">
          <table className="xv-hc-compare-table">
            <thead>
              <tr>
                <th scope="col"> </th>
                {COLUMNS.map((col) => (
                  <th key={col.id} scope="col" className={col.highlight ? 'is-xroga' : undefined}>
                    <span className="xv-hc-compare-brand">
                      <span className="xv-hc-compare-logo">
                        <Image
                          src={col.logo}
                          alt={`${col.name} logo`}
                          width={56}
                          height={32}
                          unoptimized
                          priority
                          className="xv-hc-compare-logo-img"
                        />
                      </span>
                      <span>{col.name}</span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.feature}>
                  <th scope="row">{row.feature}</th>
                  {COLUMNS.map((col) => (
                    <td key={col.id} className={col.highlight ? 'is-xroga' : undefined}>
                      {cell(row, col.id)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
