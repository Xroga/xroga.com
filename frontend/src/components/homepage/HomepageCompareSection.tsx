'use client';

const ROWS: Array<{
  feature: string;
  xroga: string;
  cursor: string;
  codex: string;
  replit: string;
}> = [
  {
    feature: 'Best for',
    xroga: 'Ship a product from a prompt',
    cursor: 'Developers editing code in an IDE',
    codex: 'Coding agents inside your toolchain',
    replit: 'Cloud IDE + hosted prototypes',
  },
  {
    feature: 'You start with',
    xroga: 'A product prompt in Workspace',
    cursor: 'An open repo + chat/composer',
    codex: 'Tasks / CLI / IDE agent runs',
    replit: 'A Replit project or Agent ask',
  },
  {
    feature: 'Output ownership',
    xroga: 'Your GitHub repo',
    cursor: 'Your local / remote repo',
    codex: 'Your repo / patches',
    replit: 'Replit project (exportable)',
  },
  {
    feature: 'Go live',
    xroga: 'Vercel + your domain in-flow',
    cursor: 'You deploy separately',
    codex: 'You deploy separately',
    replit: 'Replit hosting / publish',
  },
  {
    feature: 'Who runs the loop',
    xroga: 'Multi-model swarm (build → QA → ship)',
    cursor: 'You + AI pair-programming',
    codex: 'Agent steps you supervise',
    replit: 'Agent + cloud workspace',
  },
];

export function HomepageCompareSection() {
  return (
    <section className="xv-hc-compare" aria-labelledby="compare-heading">
      <div className="xv-hc-compare-inner">
        <p className="xv-hc-pixel-kicker" id="compare-heading">
          COMPARE
        </p>
        <h2 className="xv-hc-section-title">
          Not another coding IDE. <em>A ship loop.</em>
        </h2>
        <p className="xv-hc-section-copy">
          Cursor and Codex help you write code. Replit hosts the sandbox. Xroga runs Converter →
          Builder → GitHub → live domain — so the outcome is a product, not just patches.
        </p>

        <div className="xv-hc-compare-scroll" role="region" aria-label="Product comparison">
          <table className="xv-hc-compare-table">
            <thead>
              <tr>
                <th scope="col"> </th>
                <th scope="col" className="is-xroga">
                  Xroga
                </th>
                <th scope="col">Cursor</th>
                <th scope="col">Codex</th>
                <th scope="col">Replit</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.feature}>
                  <th scope="row">{row.feature}</th>
                  <td className="is-xroga">{row.xroga}</td>
                  <td>{row.cursor}</td>
                  <td>{row.codex}</td>
                  <td>{row.replit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
