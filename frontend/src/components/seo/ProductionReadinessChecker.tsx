'use client';

import { useState } from 'react';
import { READINESS_CHECKS, summarizeReadiness, type ReadinessState } from '@/lib/seoExpansionContent';

const INITIAL_STATE = Object.fromEntries(READINESS_CHECKS.map(({ id }) => [id, false])) as ReadinessState;

export function ProductionReadinessChecker() {
  const [state, setState] = useState<ReadinessState>(INITIAL_STATE);
  const result = summarizeReadiness(state);

  return (
    <section className="xv-readiness-tool" aria-labelledby="readiness-tool-heading">
      <header>
        <p className="xv-seo-eyebrow">Interactive evidence check</p>
        <h2 id="readiness-tool-heading">What can you prove before release?</h2>
        <p>Mark only evidence you have reviewed. This tool stores nothing, assigns no invented quality score, and does not replace testing or a security review.</p>
      </header>
      <div className="xv-readiness-summary" aria-live="polite">
        <strong>{result.confirmed} confirmed</strong>
        <span>{result.unresolved} unresolved</span>
        <small>{result.total} checks total</small>
      </div>
      <fieldset>
        <legend>Production evidence</legend>
        {READINESS_CHECKS.map((item) => (
          <label key={item.id}>
            <input type="checkbox" checked={state[item.id]} onChange={(event) => setState((current) => ({ ...current, [item.id]: event.target.checked }))} />
            <span><small>{item.group}</small>{item.label}</span>
          </label>
        ))}
      </fieldset>
      <footer>
        <p>{result.unresolved === 0 ? 'All listed evidence is confirmed. Record the commit, environment, approver, and rollback owner before release.' : 'Unresolved items are not automatic failures. Assign an owner, capture the missing evidence, and make the release decision explicit.'}</p>
        <button type="button" onClick={() => setState(INITIAL_STATE)} disabled={result.confirmed === 0}>Reset checklist</button>
      </footer>
    </section>
  );
}
