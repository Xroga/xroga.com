'use client';

import { useState } from 'react';
import { History, Loader2, RotateCcw } from 'lucide-react';

import type { BuilderRevisionSummary } from '@/lib/builderApi';
import { builderPhase2Api, type RevisionDiff } from '@/lib/builderApiPhase2';
import { BuilderApiError } from '@/lib/builderApi';
import { cn } from '@/lib/utils';

const ORIGIN_LABEL: Record<BuilderRevisionSummary['origin'], string> = {
  starter: 'Starting point',
  generation: 'Built',
  followup: 'Your change',
  repair: 'Automatic fix',
  restore: 'Restored',
};

/** Real revision history: what changed, a line-level view, and a safe restore that never rewrites history. */
export function BuilderHistory({
  projectId,
  revisions,
  currentRevisionId,
  onChanged,
}: {
  projectId: string;
  revisions: BuilderRevisionSummary[];
  currentRevisionId: string | null;
  onChanged: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [diff, setDiff] = useState<RevisionDiff | null>(null);
  const [file, setFile] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const show = async (revisionId: string) => {
    if (openId === revisionId) {
      setOpenId(null);
      return;
    }
    setOpenId(revisionId);
    setDiff(null);
    setFile(null);
    try {
      const result = await builderPhase2Api.diff(projectId, revisionId);
      setDiff(result);
      setFile(result.files[0]?.path ?? null);
    } catch {
      setMessage('The changes for this version could not be loaded.');
    }
  };

  const restore = async (revisionId: string) => {
    setBusy(revisionId);
    setMessage(null);
    try {
      const result = await builderPhase2Api.restore(projectId, revisionId);
      setMessage(result.unchanged ? 'That version is already the current one.' : `Restored version ${result.restoredFrom} as a new version. ${result.notice}`);
      setConfirming(null);
      onChanged();
    } catch (error) {
      setMessage(error instanceof BuilderApiError && error.status === 409 ? 'A build is running. Wait for it to finish, then restore.' : 'The version could not be restored.');
    } finally {
      setBusy(null);
    }
  };

  const selected = diff?.files.find((entry) => entry.path === file) ?? null;

  return (
    <section aria-label="Revision history" className="space-y-2">
      <div className="flex items-center gap-1.5 font-medium">
        <History className="h-3.5 w-3.5" aria-hidden="true" /> Versions
      </div>
      {message ? <p className="text-[11px] text-[var(--muted)]" role="status">{message}</p> : null}
      <ul className="space-y-1.5">
        {revisions.map((revision) => (
          <li key={revision.id} className="rounded-lg border border-[var(--card-border)]/60">
            <div className="flex items-center gap-2 p-2">
              <button type="button" onClick={() => void show(revision.id)} className="min-w-0 flex-1 text-left" aria-expanded={openId === revision.id}>
                <span className="font-medium">#{revision.revisionNumber}</span> {ORIGIN_LABEL[revision.origin]}
                {revision.id === currentRevisionId ? <span className="ml-1.5 rounded bg-[var(--accent)]/15 px-1.5 text-[10px] text-[var(--accent)]">current</span> : null}
                <span className="block text-[11px] text-[var(--muted)]">
                  {revision.fileCount} files · {revision.verificationStatus} · {new Date(revision.createdAt).toLocaleString()}
                </span>
              </button>
              {revision.id !== currentRevisionId ? (
                confirming === revision.id ? (
                  <span className="flex items-center gap-1">
                    <button type="button" disabled={busy !== null} onClick={() => void restore(revision.id)} className="rounded border border-[var(--accent)] px-2 py-0.5 text-[11px] text-[var(--accent)] disabled:opacity-50">
                      {busy === revision.id ? <Loader2 className="h-3 w-3 animate-spin" aria-label="Restoring" /> : 'Confirm restore'}
                    </button>
                    <button type="button" onClick={() => setConfirming(null)} className="text-[11px] text-[var(--muted)] underline">Cancel</button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setConfirming(revision.id)} className="flex items-center gap-1 text-[11px] text-[var(--muted)] hover:text-[var(--foreground)]">
                    <RotateCcw className="h-3 w-3" aria-hidden="true" /> Restore
                  </button>
                )
              ) : null}
            </div>
            {confirming === revision.id ? (
              <p className="px-2 pb-2 text-[11px] text-[var(--muted)]">
                This adds version {revision.revisionNumber}&apos;s files as a new version. Nothing is deleted. It does not change any database, GitHub repository or deployment, and it needs testing again.
              </p>
            ) : null}
            {openId === revision.id ? (
              <div className="border-t border-[var(--card-border)]/40 p-2">
                {!diff ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label="Loading changes" />
                ) : diff.files.length === 0 ? (
                  <p className="text-[11px] text-[var(--muted)]">No file changes.</p>
                ) : (
                  <>
                    <p className="mb-1 text-[11px] text-[var(--muted)]">
                      {diff.totals.added} added, {diff.totals.modified} changed, {diff.totals.deleted} removed (+{diff.totals.additions} −{diff.totals.deletions})
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {diff.files.map((entry) => (
                        <button key={entry.path} type="button" onClick={() => setFile(entry.path)} className={cn('rounded border px-1.5 py-0.5 font-mono text-[10px]', file === entry.path ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-[var(--card-border)]/60')}>
                          {entry.status === 'added' ? '+' : entry.status === 'deleted' ? '−' : '~'} {entry.path}
                        </button>
                      ))}
                    </div>
                    {selected ? (
                      selected.patch === null ? (
                        <p className="mt-1 text-[11px] text-[var(--muted)]">This file is too large to show line by line.</p>
                      ) : (
                        <pre className="mt-1 max-h-56 overflow-auto rounded bg-[var(--foreground)]/5 p-2 font-mono text-[10px] leading-4">
                          {selected.patch.split('\n').map((line, index) => (
                            <span key={index} className={cn('block', line.startsWith('+') && 'text-emerald-400', line.startsWith('-') && 'text-red-400')}>{line || ' '}</span>
                          ))}
                          {selected.truncated ? <span className="block text-[var(--muted)]">… shortened</span> : null}
                        </pre>
                      )
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
