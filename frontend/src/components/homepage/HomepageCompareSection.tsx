'use client';

import Image from 'next/image';

const COLUMNS = [
  {
    id: 'xroga',
    name: 'Xroga',
    logo: '/brand/xroga-home-workspace.png',
    highlight: true,
  },
  {
    id: 'cursor',
    name: 'Cursor',
    logo: 'https://cdn.simpleicons.org/cursor/ffffff',
    highlight: false,
  },
  {
    id: 'codex',
    name: 'Codex',
    logo: 'https://cdn.simpleicons.org/openai/ffffff',
    highlight: false,
  },
  {
    id: 'replit',
    name: 'Replit',
    logo: 'https://cdn.simpleicons.org/replit/F26207',
    highlight: false,
  },
] as const;

const ROWS: Array<{
  feature: string;
  xroga: string;
  cursor: string;
  codex: string;
  replit: string;
}> = [
  {
    feature: 'Best for',
    xroga: 'Ship a live product from a prompt',
    cursor: 'Fast coding inside a desktop IDE',
    codex: 'Agent tasks in your existing toolchain',
    replit: 'Cloud IDE + quick hosted prototypes',
  },
  {
    feature: 'You start with',
    xroga: 'A product prompt in Workspace',
    cursor: 'An open repo + Composer/chat',
    codex: 'CLI / IDE agent runs you supervise',
    replit: 'A Replit project or Agent ask',
  },
  {
    feature: 'What you get',
    xroga: 'Working app files + GitHub push',
    cursor: 'Edits & refactors in your editor',
    codex: 'Patches / PRs you review',
    replit: 'Runnable cloud project (exportable)',
  },
  {
    feature: 'Output ownership',
    xroga: 'Your GitHub repo',
    cursor: 'Your local / remote repo',
    codex: 'Your repo',
    replit: 'Replit project (you can export)',
  },
  {
    feature: 'Go live',
    xroga: 'Your Vercel + domain in-flow',
    cursor: 'You deploy with your own stack',
    codex: 'You deploy with your own stack',
    replit: 'Replit hosting / publish',
  },
  {
    feature: 'Backend / data',
    xroga: 'Optional: your Supabase keys in vault',
    cursor: 'You wire databases yourself',
    codex: 'You wire databases yourself',
    replit: 'Replit DB / your own services',
  },
  {
    feature: 'Who runs the loop',
    xroga: 'Multi-model swarm → build → QA → ship',
    cursor: 'You + AI pair-programming',
    codex: 'Agent steps you approve',
    replit: 'Agent + cloud workspace',
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
          Cursor and Codex are excellent for writing and editing code. Replit is strong for cloud
          prototypes. Xroga is built to take a product prompt to your GitHub + Vercel — with optional
          Supabase — without starting in an IDE.
        </p>

        <div className="xv-hc-compare-scroll" role="region" aria-label="Product comparison">
          <table className="xv-hc-compare-table">
            <thead>
              <tr>
                <th scope="col"> </th>
                {COLUMNS.map((col) => (
                  <th key={col.id} scope="col" className={col.highlight ? 'is-xroga' : undefined}>
                    <span className="inline-flex flex-col items-center gap-1.5">
                      <span className="relative h-7 w-14 sm:h-8 sm:w-16">
                        <Image
                          src={col.logo}
                          alt=""
                          fill
                          unoptimized
                          className="object-contain"
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
