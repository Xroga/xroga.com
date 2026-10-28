import { AlertTriangle, CheckCircle2, Download, GitPullRequest, Loader2, RotateCcw, XCircle } from 'lucide-react';

import type { ChangeView, DeliveryConflict, SourceBinding } from '@/lib/existingSourceApi';
import { cn } from '@/lib/utils';
import { STATUS_LABEL, classifyDiff, deliveryState, isActive, progressSteps, reproductionNote, statusTone, previewHeadline, testHeadline } from './changeView';

const TONE: Record<ReturnType<typeof statusTone>, string> = {
  good: 'text-emerald-400 border-emerald-400/30',
  warn: 'text-amber-400 border-amber-400/30',
  bad: 'text-red-400 border-red-400/30',
  busy: 'text-[var(--accent)] border-[var(--accent)]/30',
  idle: 'text-[var(--muted)] border-[var(--card-border)]',
};

const LINE: Record<string, string> = {
  file: 'font-semibold text-[var(--foreground)] mt-2',
  hunk: 'text-[var(--accent)]',
  add: 'bg-emerald-500/10 text-emerald-300',
  del: 'bg-red-500/10 text-red-300',
  context: 'text-[var(--muted)]',
  meta: 'text-[var(--muted)]',
};

export interface ChangeDetailProps {
  change: ChangeView;
  binding: Pick<SourceBinding, 'originKind' | 'permissions' | 'repositoryArchived' | 'state'>;
  /** Which action is in flight, if any. */
  busy: string | null;
  revision: number;
  acknowledged: boolean;
  conflicts: DeliveryConflict[] | null;
  notice: string | null;
  onRevision: (n: number) => void;
  onAcknowledge: (value: boolean) => void;
  onCancel: () => void;
  onResume: () => void;
  onDeliver: (mode: 'pull_request' | 'branch') => void;
  onExport: (format: 'patch' | 'zip') => void;
}

/** One change: what is happening, what it touches, the real diff, the real test evidence, and the honest actions. Pure: state lives in the container. */
export function ChangeDetail(p: ChangeDetailProps) {
  const { change } = p;
  const active = isActive(change.status);
  const current = change.revisions.find((r) => r.n === p.revision) ?? change.revisions[change.revisions.length - 1];
  const diff = current ? classifyDiff(current.diff) : null;
  const delivery = deliveryState(change, p.binding);
  const receipt = change.deliveries[change.deliveries.length - 1];
  const repro = reproductionNote(change.reproduction, change.regressionTestAdded);

  return (
    <article className="space-y-3 rounded-lg border border-[var(--card-border)]/60 p-3" data-testid="change-detail" aria-label="Change">
      <header className="flex flex-wrap items-start gap-2">
        <p className="min-w-0 flex-1 text-sm font-medium">{change.instruction}</p>
        <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]', TONE[statusTone(change.status)])} role="status" aria-live="polite" data-testid="change-status">
          {active ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : change.status === 'verified' || change.status === 'delivered' ? <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> : change.status === 'failed' ? <XCircle className="h-3 w-3" aria-hidden="true" /> : <AlertTriangle className="h-3 w-3" aria-hidden="true" />}
          {STATUS_LABEL[change.status]}
        </span>
      </header>

      <p className="text-[11px] text-[var(--muted)]" data-testid="change-reason">{change.statusReason}</p>
      {change.attempts > 0 ? <p className="text-[11px] text-[var(--muted)]">Attempt {Math.min(change.attempts, change.maxAttempts)} of {change.maxAttempts}. Based on commit <code>{change.baseCommitSha.slice(0, 7)}</code>.</p> : null}

      {change.status === 'unverified' ? <p role="alert" className="rounded border border-amber-400/40 p-2 text-[11px] text-amber-300" data-testid="unverified-banner">This change is not test-verified. {testHeadline(current?.tests ?? null)} Read the diff carefully before using it.</p> : null}
      {change.status === 'failed' ? <p role="alert" className="rounded border border-red-400/40 p-2 text-[11px] text-red-300">No acceptable change was produced. Nothing was written to your project.</p> : null}
      {p.notice ? <p role="status" className="text-[11px] text-[var(--muted)]">{p.notice}</p> : null}

      {change.scope ? (
        <details className="text-[11px]">
          <summary className="cursor-pointer text-[var(--muted)]">Where Xroga looked ({change.scope.confidence} confidence)</summary>
          <p className="mt-1">{change.scope.targets.length ? change.scope.targets.join(', ') : 'No file stood out, so changes are limited to a small set.'}</p>
          {change.scope.tests.length ? <p className="text-[var(--muted)]">Tests nearby: {change.scope.tests.slice(0, 4).join(', ')}</p> : null}
        </details>
      ) : null}

      <ol aria-label="Progress" className="space-y-0.5 text-[11px]" data-testid="change-progress">
        {progressSteps(change).map((s, i) => (<li key={`${s.at}-${i}`} className="flex gap-2"><span className="shrink-0 text-[var(--muted)]">{new Date(s.at).toLocaleTimeString()}</span><span>{s.message}</span></li>))}
      </ol>

      {change.revisions.length > 1 ? (
        <nav aria-label="Revisions" className="flex flex-wrap gap-1 text-[11px]">
          {change.revisions.map((r) => (
            <button key={r.n} type="button" onClick={() => p.onRevision(r.n)} aria-pressed={current?.n === r.n} className={cn('rounded border px-2 py-0.5', current?.n === r.n ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-[var(--card-border)] text-[var(--muted)]')}>
              Revision {r.n}{r.tests ? ` (${r.tests.status})` : ''}
            </button>
          ))}
        </nav>
      ) : null}

      {current ? (
        <section aria-label="Changed files and tests" className="space-y-2">
          <p className="text-[11px]" data-testid="test-headline"><strong>{testHeadline(current.tests)}</strong> {current.tests?.summary && current.tests.status !== 'unsupported' && current.tests.status !== 'unavailable' ? current.tests.summary : ''}</p>
          {previewHeadline(current.preview) ? <p className="text-[11px]" data-testid="preview-headline"><strong>{previewHeadline(current.preview)}</strong></p> : null}
          {repro ? <p className="text-[11px] text-[var(--muted)]">{repro}</p> : null}
          <ul aria-label="Changed files" className="divide-y divide-[var(--card-border)]/30 rounded border border-[var(--card-border)]/60 text-[11px]">
            {current.files.map((f) => (
              <li key={f.path} className="flex flex-wrap items-center gap-2 p-1.5">
                <span className="min-w-0 flex-1 truncate">{f.path}</span>
                <span className="text-[var(--muted)]">{f.kind}</span>
                <span className="text-emerald-400">+{f.additions}</span><span className="text-red-400">-{f.deletions}</span>
                {f.warnings.length ? <span className="text-amber-400">{f.warnings.join('; ')}</span> : null}
              </li>
            ))}
          </ul>
          {current.tests && current.tests.evidence ? (
            <details className="text-[11px]"><summary className="cursor-pointer text-[var(--muted)]">Test output</summary><pre className="mt-1 max-h-60 overflow-auto rounded border border-[var(--card-border)]/60 p-2 leading-snug" data-testid="test-evidence"><code>{current.tests.evidence}</code></pre></details>
          ) : null}
          {diff && diff.lines.length ? (
            <details open className="text-[11px]">
              <summary className="cursor-pointer text-[var(--muted)]">Diff (+{current.additions} -{current.deletions}){current.diffTruncated || diff.truncated ? ', shortened' : ''}</summary>
              <pre className="mt-1 max-h-96 overflow-auto rounded border border-[var(--card-border)]/60 p-2 leading-snug" data-testid="change-diff"><code>{diff.lines.map((l, i) => <span key={i} className={cn('block whitespace-pre', LINE[l.kind])} data-kind={l.kind}>{l.text || ' '}</span>)}</code></pre>
            </details>
          ) : null}
        </section>
      ) : null}

      {p.conflicts ? (
        <div role="alert" className="space-y-1 rounded border border-red-400/40 p-2 text-[11px] text-red-300" data-testid="delivery-conflict">
          <p><strong>The branch changed files this change also touches, so nothing was written.</strong> Export the patch and apply it by hand, or create the change again from the new commit.</p>
          <ul>{p.conflicts.map((c) => <li key={c.path}><code>{c.path}</code>: {c.reason.replace(/_/g, ' ')}</li>)}</ul>
        </div>
      ) : null}

      {receipt ? (
        <div className="rounded border border-emerald-400/30 p-2 text-[11px]" data-testid="delivery-receipt">
          <p><strong>{receipt.kind === 'pull_request' ? 'Draft pull request' : 'Review branch'}</strong> on <code>{receipt.branch}</code>{receipt.commitSha ? <> at <code>{receipt.commitSha.slice(0, 7)}</code></> : null}.{' '}
            {receipt.pullRequestUrl ? <a href={receipt.pullRequestUrl} target="_blank" rel="noreferrer noopener" className="underline">Open #{receipt.pullRequestNumber}</a> : null}</p>
          {receipt.rebased ? <p className="text-amber-300">The base branch moved after the tests ran. Retest before merging.</p> : null}
          {!receipt.verified && !receipt.rebased ? <p className="text-amber-300">Not test-verified.</p> : null}
          {receipt.note ? <p className="text-[var(--muted)]">{receipt.note}</p> : null}
        </div>
      ) : null}

      <footer className="flex flex-wrap items-center gap-2 text-[11px]">
        {active ? <button type="button" onClick={p.onCancel} disabled={p.busy === 'cancel'} className="inline-flex items-center gap-1 rounded border border-[var(--card-border)] px-2 py-1 disabled:opacity-60"><XCircle className="h-3 w-3" aria-hidden="true" />Cancel</button> : null}
        {change.status === 'interrupted' ? <button type="button" onClick={p.onResume} disabled={p.busy === 'resume'} className="inline-flex items-center gap-1 rounded border border-[var(--card-border)] px-2 py-1 disabled:opacity-60"><RotateCcw className="h-3 w-3" aria-hidden="true" />Resume</button> : null}
        {delivery.needsAcknowledgement && delivery.canDeliver ? <label className="flex items-center gap-1"><input type="checkbox" checked={p.acknowledged} onChange={(e) => p.onAcknowledge(e.target.checked)} />I understand this is not test-verified</label> : null}
        {!receipt ? <button type="button" onClick={() => p.onDeliver('pull_request')} disabled={!delivery.canDeliver || (delivery.needsAcknowledgement && !p.acknowledged) || p.busy === 'deliver'} aria-describedby="deliver-reason" className="inline-flex items-center gap-1 rounded bg-[var(--accent)] px-2 py-1 font-medium text-white disabled:opacity-50">
          {p.busy === 'deliver' ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : <GitPullRequest className="h-3 w-3" aria-hidden="true" />}Open a draft pull request
        </button> : null}
        {delivery.canExport ? (<>
          <button type="button" onClick={() => p.onExport('patch')} disabled={p.busy === 'export'} className="inline-flex items-center gap-1 rounded border border-[var(--card-border)] px-2 py-1 disabled:opacity-60"><Download className="h-3 w-3" aria-hidden="true" />Patch</button>
          <button type="button" onClick={() => p.onExport('zip')} disabled={p.busy === 'export'} className="inline-flex items-center gap-1 rounded border border-[var(--card-border)] px-2 py-1 disabled:opacity-60"><Download className="h-3 w-3" aria-hidden="true" />ZIP of changed files</button>
        </>) : null}
        {!delivery.canDeliver && delivery.reason && !receipt ? <span id="deliver-reason" className="text-[var(--muted)]" data-testid="deliver-reason">{delivery.reason}</span> : null}
      </footer>
    </article>
  );
}
