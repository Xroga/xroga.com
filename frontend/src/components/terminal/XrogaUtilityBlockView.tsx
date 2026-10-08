'use client';

import { useMemo, useState } from 'react';
import {
  AlertCircle,
  Calculator,
  Check,
  CheckCircle2,
  Circle,
  LoaderCircle,
  Trophy,
  XCircle,
} from 'lucide-react';

import type { XrogaBlock } from '@/lib/xrogaBlocks';
import { calculateValues } from '@/lib/xrogaCalculations';

type UtilityType =
  | 'progress'
  | 'progress-group'
  | 'calculator'
  | 'calculation'
  | 'gauge'
  | 'comparison'
  | 'key-value'
  | 'checklist'
  | 'steps'
  | 'scorecard'
  | 'ranking';
type UtilityBlock = Extract<XrogaBlock, { type: UtilityType }>;
type ProgressItem = Extract<XrogaBlock, { type: 'progress' }>['progress'];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function text(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function formatNumber(value: number, precision = 2): string {
  if (!Number.isFinite(value)) return 'Unavailable';
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: precision }).format(value);
}

function Surface({
  children,
  title,
  description,
  state = 'ready',
}: {
  children: React.ReactNode;
  title?: string;
  description?: string;
  state?: UtilityBlock['state'];
}) {
  if (state === 'loading') return <section className="xv-response-surface max-w-[960px] rounded-2xl border border-[var(--border)] p-5" aria-busy="true"><LoaderCircle className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" /><span className="sr-only">Loading output</span></section>;
  if (state === 'empty') return <section className="xv-response-surface max-w-[960px] rounded-2xl border border-dashed border-[var(--border)] p-5 text-sm text-[var(--muted)]">No data is available for this output.</section>;
  if (state === 'error' || state === 'unsupported') return <section className="xv-response-surface max-w-[960px] rounded-2xl border border-amber-500/35 p-5 text-sm" role="status"><AlertCircle className="mr-2 inline h-4 w-4" aria-hidden="true" />{state === 'unsupported' ? 'This output cannot be previewed in this workspace yet.' : 'This output could not be rendered.'}</section>;
  return (
    <section className="xv-response-surface max-w-[960px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--background)]/70 shadow-sm">
      {title || description ? (
        <header className="border-b border-[var(--border)] px-4 py-3">
          {title ? <h3 className="text-sm font-semibold text-[var(--foreground)]">{title}</h3> : null}
          {description ? <p className="mt-0.5 text-xs text-[var(--muted)]">{description}</p> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

function ProgressRow({ item }: { item: ProgressItem }) {
  const percent = item.max > 0 ? clamp((item.value / item.max) * 100, 0, 100) : 0;
  const color = item.color ?? (item.status === 'failed' ? '#dc2626' : item.status === 'completed' ? '#16a34a' : '#2563eb');
  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3 text-sm">
        <div className="min-w-0">
          <p className="font-medium text-[var(--foreground)]">{item.label}</p>
          {item.detail ? <p className="text-xs text-[var(--muted)]">{item.detail}</p> : null}
        </div>
        <span className="shrink-0 font-mono text-xs text-[var(--muted)]">
          {formatNumber(item.value)}{item.unit ? ` ${item.unit}` : ''} · {Math.round(percent)}%
        </span>
      </div>
      <div
        className="h-2.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10"
        role="progressbar"
        aria-label={item.label}
        aria-valuemin={0}
        aria-valuemax={item.max}
        aria-valuenow={clamp(item.value, 0, item.max)}
      >
        <div className="h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${percent}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function ProgressRenderer({ block }: { block: Extract<UtilityBlock, { type: 'progress' | 'progress-group' }> }) {
  const items = block.type === 'progress' ? [block.progress] : block.items;
  return <Surface title={block.title ?? 'Progress'} description={block.description} state={block.state}><div className="space-y-5 p-4">{items.map((item) => <ProgressRow key={item.id} item={item} />)}</div></Surface>;
}

function CalculatorRenderer({ block }: { block: Extract<UtilityBlock, { type: 'calculator' }> }) {
  const [values, setValues] = useState<Record<string, number>>(() => Object.fromEntries(block.inputs.map((input) => [input.id, input.value])));
  const result = useMemo(() => calculateValues(block.operation, block.inputs.map((input) => values[input.id] ?? input.value)), [block.inputs, block.operation, values]);
  return (
    <Surface title={block.title ?? 'Calculator'} description={block.description} state={block.state}>
      <div className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.7fr)]">
        <div className="grid gap-3 sm:grid-cols-2">
          {block.inputs.map((input) => (
            <label key={input.id} className="grid gap-1.5 text-xs font-medium text-[var(--muted)]">
              {input.label}
              <span className="flex items-center rounded-lg border border-[var(--border)] bg-black/[0.02] px-3 focus-within:ring-2 focus-within:ring-blue-500 dark:bg-white/[0.025]">
                <input
                  type="number"
                  value={values[input.id] ?? input.value}
                  min={input.min}
                  max={input.max}
                  step={input.step ?? 'any'}
                  onChange={(event) => setValues((current) => ({ ...current, [input.id]: Number(event.target.value) }))}
                  className="h-10 min-w-0 flex-1 bg-transparent text-sm text-[var(--foreground)] outline-none"
                />
                {input.unit ? <span className="ml-2 text-xs text-[var(--muted)]">{input.unit}</span> : null}
              </span>
            </label>
          ))}
        </div>
        <div className="flex min-h-28 flex-col justify-center rounded-xl border border-blue-500/25 bg-blue-500/[0.06] p-4">
          <span className="flex items-center gap-2 text-xs font-medium text-[var(--muted)]"><Calculator className="h-4 w-4" aria-hidden="true" />{block.resultLabel}</span>
          <output className="mt-2 break-words text-3xl font-semibold tracking-tight text-[var(--foreground)]">
            {formatNumber(result, block.precision ?? 2)}{block.resultUnit ? <span className="ml-1 text-sm font-normal text-[var(--muted)]">{block.resultUnit}</span> : null}
          </output>
          {!Number.isFinite(result) ? <span className="mt-2 text-xs text-red-500">Check the inputs; this operation cannot divide by zero.</span> : null}
        </div>
      </div>
    </Surface>
  );
}

function CalculationRenderer({ block }: { block: Extract<UtilityBlock, { type: 'calculation' }> }) {
  return (
    <Surface title={block.title ?? 'Calculation'} description={block.description} state={block.state}>
      <div className="p-4">
        {block.formula ? <code className="block overflow-x-auto rounded-lg bg-black/5 px-3 py-2 text-xs dark:bg-white/5">{block.formula}</code> : null}
        <ol className="mt-3 space-y-2">
          {block.steps.map((step, index) => <li key={step.id} className="grid grid-cols-[24px_1fr_auto] items-start gap-2 rounded-lg border border-[var(--border)]/70 p-3 text-sm"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-black/5 text-xs font-semibold dark:bg-white/5">{index + 1}</span><span><span className="font-medium">{step.label}</span>{step.expression ? <code className="mt-0.5 block text-xs text-[var(--muted)]">{step.expression}</code> : null}</span><strong className="text-right font-mono text-xs">{text(step.value)}</strong></li>)}
        </ol>
        <div className="mt-3 flex items-center justify-between rounded-xl bg-[var(--foreground)] px-4 py-3 text-[var(--background)]"><span className="text-sm font-medium">{block.resultLabel ?? 'Result'}</span><output className="text-xl font-semibold">{text(block.result)}{block.unit ? ` ${block.unit}` : ''}</output></div>
      </div>
    </Surface>
  );
}

function GaugeRenderer({ block }: { block: Extract<UtilityBlock, { type: 'gauge' }> }) {
  const range = block.max - block.min;
  const percent = range > 0 ? clamp(((block.value - block.min) / range) * 100, 0, 100) : 0;
  return (
    <Surface title={block.title ?? block.label} description={block.description} state={block.state}>
      <div className="flex flex-col items-center gap-3 p-5 sm:flex-row sm:justify-center sm:gap-8">
        <div className="relative grid h-36 w-36 place-items-center rounded-full" style={{ background: `conic-gradient(#2563eb ${percent * 3.6}deg, color-mix(in srgb, var(--foreground) 10%, transparent) 0deg)` }} role="meter" aria-label={block.label} aria-valuemin={block.min} aria-valuemax={block.max} aria-valuenow={block.value}>
          <div className="grid h-28 w-28 place-items-center rounded-full bg-[var(--background)] text-center"><div><p className="text-2xl font-semibold">{formatNumber(block.value)}</p><p className="text-xs text-[var(--muted)]">{block.unit ?? block.label}</p></div></div>
        </div>
        <div className="min-w-48 text-sm"><p className="font-medium">{block.label}</p><p className="mt-1 text-xs text-[var(--muted)]">Range {formatNumber(block.min)}–{formatNumber(block.max)}{block.unit ? ` ${block.unit}` : ''}</p>{block.target !== undefined ? <p className="mt-2 text-xs">Target: <strong>{formatNumber(block.target)}{block.unit ? ` ${block.unit}` : ''}</strong></p> : null}{block.detail ? <p className="mt-2 max-w-sm text-xs text-[var(--muted)]">{block.detail}</p> : null}</div>
      </div>
    </Surface>
  );
}

function ComparisonRenderer({ block }: { block: Extract<UtilityBlock, { type: 'comparison' }> }) {
  const metricKeys = useMemo(() => Array.from(new Set(block.options.flatMap((option) => Object.keys(option.metrics)))), [block.options]);
  return <Surface title={block.title ?? 'Comparison'} description={block.description} state={block.state}><div className="grid auto-cols-[minmax(210px,1fr)] grid-flow-col gap-3 overflow-x-auto p-4">{block.options.map((option) => <article key={option.id} className={`relative rounded-xl border p-4 ${option.recommended ? 'border-blue-500/60 bg-blue-500/[0.05]' : 'border-[var(--border)]'}`}>{option.recommended ? <span className="absolute right-3 top-3 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Recommended</span> : null}<h4 className="pr-20 text-sm font-semibold">{option.label}</h4>{option.description ? <p className="mt-1 text-xs text-[var(--muted)]">{option.description}</p> : null}<dl className="mt-4 divide-y divide-[var(--border)]/70">{metricKeys.map((key) => <div key={key} className="flex items-center justify-between gap-3 py-2 text-xs"><dt className="text-[var(--muted)]">{key}</dt><dd className="text-right font-medium">{text(option.metrics[key])}</dd></div>)}</dl></article>)}</div></Surface>;
}

function KeyValueRenderer({ block }: { block: Extract<UtilityBlock, { type: 'key-value' }> }) {
  return <Surface title={block.title ?? 'Summary'} description={block.description} state={block.state}><dl className="grid gap-px bg-[var(--border)] sm:grid-cols-2">{block.items.map((item) => <div key={item.id} className="bg-[var(--background)] p-4"><dt className="text-xs text-[var(--muted)]">{item.label}</dt><dd className="mt-1 break-words text-sm font-medium">{text(item.value)}</dd>{item.detail ? <p className="mt-1 text-xs text-[var(--muted)]">{item.detail}</p> : null}</div>)}</dl></Surface>;
}

const CHECKLIST_ICONS = { pending: Circle, running: LoaderCircle, completed: CheckCircle2, failed: XCircle, blocked: AlertCircle } as const;
function ChecklistRenderer({ block }: { block: Extract<UtilityBlock, { type: 'checklist' }> }) {
  return <Surface title={block.title ?? 'Checklist'} description={block.description} state={block.state}><ul className="divide-y divide-[var(--border)]">{block.items.map((item) => { const Icon = CHECKLIST_ICONS[item.status]; return <li key={item.id} className="flex gap-3 p-4"><Icon className={`mt-0.5 h-4 w-4 shrink-0 ${item.status === 'running' ? 'animate-spin text-blue-500 motion-reduce:animate-none' : item.status === 'completed' ? 'text-green-500' : item.status === 'failed' || item.status === 'blocked' ? 'text-red-500' : 'text-[var(--muted)]'}`} aria-hidden="true" /><div><p className="text-sm font-medium">{item.label}</p>{item.detail ? <p className="mt-0.5 text-xs text-[var(--muted)]">{item.detail}</p> : null}</div></li>; })}</ul></Surface>;
}

function StepsRenderer({ block }: { block: Extract<UtilityBlock, { type: 'steps' }> }) {
  return <Surface title={block.title ?? 'Steps'} description={block.description} state={block.state}><ol className="grid gap-0 p-4 md:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">{block.steps.map((step, index) => { const active = step.id === block.currentStepId || step.status === 'current'; const done = step.status === 'completed'; const failed = step.status === 'failed'; return <li key={step.id} className="relative flex gap-3 pb-5 last:pb-0 md:block md:pb-0 md:pr-4"><div className="relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-[var(--background)] text-xs font-semibold" style={{ borderColor: done ? '#16a34a' : failed ? '#dc2626' : active ? '#2563eb' : 'var(--border)' }}>{done ? <Check className="h-4 w-4 text-green-500" /> : failed ? <XCircle className="h-4 w-4 text-red-500" /> : index + 1}</div>{index < block.steps.length - 1 ? <span className="absolute left-4 top-8 h-[calc(100%-2rem)] w-px bg-[var(--border)] md:left-8 md:top-4 md:h-px md:w-[calc(100%-2rem)]" aria-hidden="true" /> : null}<div className="pt-1 md:mt-3 md:pt-0"><p className={`text-sm font-medium ${active ? 'text-blue-500' : ''}`}>{step.title}</p>{step.description ? <p className="mt-1 text-xs text-[var(--muted)]">{step.description}</p> : null}</div></li>; })}</ol></Surface>;
}

function ScorecardRenderer({ block }: { block: Extract<UtilityBlock, { type: 'scorecard' }> }) {
  return <Surface title={block.title ?? 'Scorecard'} description={block.description} state={block.state}><div className="grid gap-3 p-4 sm:grid-cols-2">{block.scores.map((score) => { const percent = clamp((score.score / score.max) * 100, 0, 100); return <article key={score.id} className="rounded-xl border border-[var(--border)] p-4"><div className="flex items-baseline justify-between gap-3"><h4 className="text-sm font-medium">{score.label}</h4><strong className="text-lg">{formatNumber(score.score)}<span className="text-xs font-normal text-[var(--muted)]">/{formatNumber(score.max)}</span></strong></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10"><div className="h-full rounded-full bg-blue-600" style={{ width: `${percent}%` }} /></div>{score.detail ? <p className="mt-2 text-xs text-[var(--muted)]">{score.detail}</p> : null}</article>; })}</div></Surface>;
}

function RankingRenderer({ block }: { block: Extract<UtilityBlock, { type: 'ranking' }> }) {
  const entries = useMemo(() => [...block.entries].sort((a, b) => b.value - a.value), [block.entries]);
  const top = Math.max(...entries.map((entry) => Math.abs(entry.value)), 1);
  return <Surface title={block.title ?? 'Ranking'} description={block.description} state={block.state}><ol className="divide-y divide-[var(--border)]">{entries.map((entry, index) => <li key={entry.id} className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 p-4"><span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-semibold ${index === 0 ? 'bg-amber-400/20 text-amber-600' : 'bg-black/5 dark:bg-white/5'}`}>{index === 0 ? <Trophy className="h-3.5 w-3.5" /> : index + 1}</span><div className="min-w-0"><p className="truncate text-sm font-medium">{entry.label}</p><div className="mt-1.5 h-1 overflow-hidden rounded-full bg-black/10 dark:bg-white/10"><div className="h-full rounded-full bg-blue-600" style={{ width: `${clamp((Math.abs(entry.value) / top) * 100, 0, 100)}%` }} /></div>{entry.detail ? <p className="mt-1 text-xs text-[var(--muted)]">{entry.detail}</p> : null}</div><strong className="text-sm">{formatNumber(entry.value)}{entry.unit ? ` ${entry.unit}` : ''}</strong></li>)}</ol></Surface>;
}

export function XrogaUtilityBlockView({ block }: { block: XrogaBlock }) {
  if (block.type === 'progress' || block.type === 'progress-group') return <ProgressRenderer block={block} />;
  if (block.type === 'calculator') return <CalculatorRenderer block={block} />;
  if (block.type === 'calculation') return <CalculationRenderer block={block} />;
  if (block.type === 'gauge') return <GaugeRenderer block={block} />;
  if (block.type === 'comparison') return <ComparisonRenderer block={block} />;
  if (block.type === 'key-value') return <KeyValueRenderer block={block} />;
  if (block.type === 'checklist') return <ChecklistRenderer block={block} />;
  if (block.type === 'steps') return <StepsRenderer block={block} />;
  if (block.type === 'scorecard') return <ScorecardRenderer block={block} />;
  if (block.type === 'ranking') return <RankingRenderer block={block} />;
  return null;
}
