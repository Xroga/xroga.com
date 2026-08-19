'use client';

import { browserVerificationLine, type EngineeringArtifact } from '@/lib/engineeringArtifact';

/**
 * Renders a real engineering result.
 *
 * The three statuses get visibly different treatment on purpose. A blocked run previously
 * rendered as nothing at all, and the failure mode that creates is worse than an ugly card:
 * the user cannot tell a run that did nothing from a run that wrote twelve files and failed
 * its last check. So `blocked` leads with the phase and the blocker, and still shows the files
 * and the commit — because those exist and the user needs to know they exist.
 */
export function EngineeringArtifactView({ artifact }: { artifact: EngineeringArtifact }) {
  // Same single source as the text form, so the two surfaces cannot disagree about whether a
  // page was ever looked at.
  const browserLine = browserVerificationLine(artifact.browserVerification);
  const uncheckedCriteria = artifact.browserVerification?.criteriaNotChecked ?? [];
  const tone =
    artifact.status === 'verified'
      ? { border: 'border-emerald-500/40', text: 'text-emerald-400', label: 'Verified' }
      : artifact.status === 'blocked'
        ? { border: 'border-amber-500/40', text: 'text-amber-400', label: 'Needs attention' }
        : { border: 'border-rose-500/40', text: 'text-rose-400', label: 'Failed' };

  return (
    <div className={`my-2 rounded-lg border ${tone.border} bg-[var(--background)]/40 p-3 text-sm`}>
      <div className="flex items-center gap-2">
        <span className={`font-medium ${tone.text}`}>{tone.label}</span>
        <span className="text-[var(--muted)] text-xs">
          {artifact.phaseReached}
          {artifact.verified ? ' · verification passed' : ''}
        </span>
      </div>

      <p className="mt-1 text-[var(--foreground)]/90">{artifact.summary}</p>

      {artifact.error ? (
        <p className="mt-1 text-xs text-rose-400">{artifact.error}</p>
      ) : null}

      {artifact.blockers.length > 0 ? (
        <div className="mt-2">
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Blockers</p>
          <ul className="mt-1 space-y-0.5">
            {artifact.blockers.slice(0, 6).map((blocker, index) => (
              <li key={index} className="text-[var(--foreground)]/80 text-xs">
                • {blocker}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {artifact.fileCount > 0 ? (
        <div className="mt-2">
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
            {artifact.fileCount} file{artifact.fileCount === 1 ? '' : 's'} changed
          </p>
          <ul className="mt-1 space-y-0.5 font-mono text-[11px]">
            {artifact.files.slice(0, 12).map((file) => (
              <li key={file.path} className="text-[var(--foreground)]/75">
                {file.path}
                {typeof file.added === 'number' || typeof file.removed === 'number' ? (
                  <span className="ml-2 text-[var(--muted)]">
                    {typeof file.added === 'number' ? `+${file.added}` : ''}
                    {typeof file.removed === 'number' ? ` -${file.removed}` : ''}
                  </span>
                ) : null}
              </li>
            ))}
            {artifact.files.length > 12 ? (
              <li className="text-[var(--muted)]">…and {artifact.files.length - 12} more</li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {artifact.repository ? (
        <p className="mt-2 text-xs text-[var(--muted)]">
          {artifact.repository.owner}/{artifact.repository.repo}
          <span className="mx-1">·</span>
          {artifact.repository.branch}
          {artifact.commitSha ? (
            <>
              <span className="mx-1">·</span>
              <span className="font-mono">{artifact.commitSha.slice(0, 7)}</span>
            </>
          ) : null}
        </p>
      ) : null}

      {artifact.preview?.url ? (
        <p className="mt-1 text-xs">
          <a
            href={artifact.preview.url}
            target="_blank"
            rel="noreferrer"
            className="text-[var(--accent)] underline"
          >
            Open preview
          </a>
          {artifact.preview.verified ? (
            <span className="ml-1 text-[var(--muted)]">(verified)</span>
          ) : null}
        </p>
      ) : null}

      {artifact.verificationEvidence.length > 0 ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-[var(--muted)]">
            Verification evidence ({artifact.verificationEvidence.length})
          </summary>
          <ul className="mt-1 space-y-0.5">
            {artifact.verificationEvidence.map((item, index) => (
              <li key={index} className="text-[11px] text-[var(--foreground)]/70">
                <span className="text-[var(--muted)]">{item.phase}</span> — {item.statement}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {browserLine ? (
        <p className="mt-2 text-xs">
          <span
            className={
              artifact.browserVerification?.status === 'passed'
                ? 'text-[var(--foreground)]/70'
                : // Not styled as an error: "we could not look" is not the app being broken.
                  // It is missing evidence, and it reads as missing evidence.
                  'text-[var(--muted)]'
            }
          >
            {browserLine}
          </span>
        </p>
      ) : null}

      {uncheckedCriteria.length > 0 ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-[var(--muted)]">
            Acceptance criteria not checked ({uncheckedCriteria.length})
          </summary>
          <ul className="mt-1 space-y-0.5">
            {uncheckedCriteria.map((criterion, index) => (
              <li key={index} className="text-[11px] text-[var(--foreground)]/70">
                {criterion}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {artifact.nextAction ? (
        <p className="mt-2 text-xs text-[var(--foreground)]/70">{artifact.nextAction}</p>
      ) : null}
    </div>
  );
}
