'use client';

import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import type { XrogaBlock } from '@/lib/xrogaBlocks';
import { scoreDecisionOptions } from '@/lib/xrogaDecisionMatrix';

type Matrix = Extract<XrogaBlock, { type: 'decision-matrix' }>;

export function XrogaDecisionMatrixView({ block }: { block: XrogaBlock }) {
  if (block.type !== 'decision-matrix') return null;
  return <DecisionMatrix block={block} />;
}

function DecisionMatrix({ block }: { block: Matrix }) {
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const criteria = block.criteria;
  const valid = new Set(criteria.map((criterion) => criterion.id));
  const hasUniqueIds = valid.size === criteria.length && new Set(block.options.map((option) => option.id)).size === block.options.length;
  const weights = criteria.map((criterion) => overrides[criterion.id] ?? criterion.weight);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const ranked = scoreDecisionOptions(criteria, block.options, overrides);

  if (block.state === 'loading') return <section className="xv-response-surface max-w-[960px] rounded-2xl border border-[var(--border)] p-4 text-sm" aria-busy="true">Preparing decision matrix…</section>;
  if (block.state === 'error' || block.state === 'unsupported') return <section className="xv-response-surface max-w-[960px] rounded-2xl border border-[var(--border)] p-4 text-sm" role="status">Decision matrix unavailable.</section>;
  if (!hasUniqueIds || (totalWeight > 0 && !ranked)) return <section className="xv-response-surface max-w-[960px] rounded-2xl border border-[var(--border)] p-4 text-sm" role="status">The decision matrix needs one score from 0 to 10 for every option and criterion.</section>;

  return <section className="xv-response-surface max-w-[960px] min-w-0 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--background)]/65" aria-label={block.title ?? 'Decision matrix'}>
    <header className="border-b border-[var(--border)] px-4 py-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><SlidersHorizontal className="h-4 w-4" aria-hidden="true" />{block.title ?? 'Decision matrix'}</h3>
      <p className="mt-1 text-xs text-[var(--muted)]">Based on supplied scores. Adjust weights to compare options; no external action is taken.</p>
    </header>
    <div className="grid gap-4 p-4 lg:grid-cols-[minmax(180px,0.8fr)_minmax(0,1.2fr)]">
      <fieldset className="min-w-0 space-y-3"><legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Criteria weights</legend>
        {criteria.map((criterion, index) => <label key={criterion.id} className="block rounded-xl border border-[var(--border)] p-3 text-xs">
          <span className="flex items-center justify-between gap-3"><span className="font-medium">{criterion.label}</span><span className="tabular-nums text-[var(--muted)]">{weights[index]!.toFixed(1)}</span></span>
          {criterion.description ? <span className="mt-1 block text-[var(--muted)]">{criterion.description}</span> : null}
          <input type="range" min="0" max="10" step="0.5" value={weights[index]} onChange={(event) => setOverrides((previous) => ({ ...previous, [criterion.id]: Number(event.target.value) }))} aria-label={`${criterion.label} weight`} className="mt-2 w-full accent-blue-500" />
        </label>)}
      </fieldset>
      <div className="min-w-0">
        {totalWeight === 0 ? <p className="rounded-xl border border-[var(--border)] p-3 text-xs text-[var(--muted)]">Raise at least one weight to calculate a ranking.</p> : <ol className="space-y-2" aria-label="Ranked options">{ranked!.map((option, index) => <li key={option.id} className="rounded-xl border border-[var(--border)] p-3">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words text-sm font-medium">{index + 1}. {option.label}</p>{option.detail ? <p className="mt-1 text-xs text-[var(--muted)]">{option.detail}</p> : null}</div><strong className="shrink-0 text-sm tabular-nums">{option.total.toFixed(2)} / 10</strong></div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10" role="meter" aria-label={`${option.label} weighted score`} aria-valuemin={0} aria-valuemax={10} aria-valuenow={Number(option.total.toFixed(2))}><div className="h-full rounded-full bg-blue-500 transition-[width] motion-reduce:transition-none" style={{ width: `${option.total * 10}%` }} /></div>
        </li>)}</ol>}
      </div>
    </div>
    <details className="border-t border-[var(--border)] px-4 py-3 text-xs"><summary className="cursor-pointer font-medium">Show underlying scores</summary><div className="mt-3 max-w-full overflow-x-auto"><table className="w-full min-w-[420px] text-left"><thead><tr><th scope="col" className="p-2">Option</th>{criteria.map((criterion) => <th scope="col" key={criterion.id} className="p-2">{criterion.label}</th>)}</tr></thead><tbody>{block.options.map((option) => <tr key={option.id} className="border-t border-[var(--border)]"><th scope="row" className="p-2 font-medium">{option.label}</th>{criteria.map((criterion) => <td key={criterion.id} className="p-2 tabular-nums">{option.scores[criterion.id]}</td>)}</tr>)}</tbody></table></div></details>
  </section>;
}
