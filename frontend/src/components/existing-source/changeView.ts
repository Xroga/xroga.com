import type { ChangeStatus, ChangeView, SourceBinding } from '@/lib/existingSourceApi';

/** Everything the change screen decides, kept as plain functions so each rule is tested without a browser. */

export const STATUS_LABEL: Record<ChangeStatus, string> = {
  queued: 'Waiting to start',
  planning: 'Preparing a copy of the project',
  working: 'Making the change',
  verifying: 'Running the project tests',
  repairing: 'Repairing from the test output',
  verified: 'Verified',
  unverified: 'Not test-verified',
  failed: 'Failed',
  cancelled: 'Cancelled',
  interrupted: 'Interrupted',
  delivered: 'Delivered',
};

export const ACTIVE: readonly ChangeStatus[] = ['queued', 'planning', 'working', 'verifying', 'repairing'];
export const isActive = (s: ChangeStatus): boolean => ACTIVE.includes(s);
export const isFinished = (s: ChangeStatus): boolean => !isActive(s) && s !== 'interrupted';

export type StatusTone = 'good' | 'warn' | 'bad' | 'busy' | 'idle';
export const statusTone = (s: ChangeStatus): StatusTone => (s === 'verified' || s === 'delivered' ? 'good' : s === 'unverified' || s === 'interrupted' ? 'warn' : s === 'failed' ? 'bad' : s === 'cancelled' ? 'idle' : 'busy');

/** The steps shown while a change runs, from the durable events, newest last, never more than `limit`. */
export function progressSteps(change: Pick<ChangeView, 'events'>, limit = 8): { at: string; message: string; type: string }[] {
  const shown = change.events.filter((e) => e.type !== 'change.created');
  return shown.slice(-limit).map((e) => ({ at: e.at, message: e.message, type: e.type }));
}

export type DiffLine = { kind: 'file' | 'hunk' | 'add' | 'del' | 'context' | 'meta'; text: string };

/** Classifies a unified diff for display. A line is judged by its first character, so file content can never pose as a header. */
export function classifyDiff(diff: string, maxLines = 4_000): { lines: DiffLine[]; truncated: boolean } {
  const out: DiffLine[] = [];
  let inHunk = false;
  const raw = diff.split('\n');
  if (raw[raw.length - 1] === '') raw.pop();
  for (const text of raw) {
    if (out.length >= maxLines) return { lines: out, truncated: true };
    if (text.startsWith('diff --git ')) { inHunk = false; out.push({ kind: 'file', text }); continue; }
    if (!inHunk) {
      if (text.startsWith('@@')) { inHunk = true; out.push({ kind: 'hunk', text }); } else out.push({ kind: 'meta', text });
      continue;
    }
    if (text.startsWith('@@')) out.push({ kind: 'hunk', text });
    else if (text.startsWith('+')) out.push({ kind: 'add', text });
    else if (text.startsWith('-')) out.push({ kind: 'del', text });
    else if (text.startsWith('\\')) out.push({ kind: 'meta', text });
    else out.push({ kind: 'context', text });
  }
  return { lines: out, truncated: false };
}

export interface DeliveryState {
  /** A draft pull request can be requested now. */
  readonly canDeliver: boolean;
  readonly reason: string | null;
  /** The person must acknowledge that the change is not test-verified first. */
  readonly needsAcknowledgement: boolean;
  readonly canExport: boolean;
}

export function deliveryState(change: Pick<ChangeView, 'status' | 'files'>, binding: Pick<SourceBinding, 'originKind' | 'permissions' | 'repositoryArchived' | 'state'>): DeliveryState {
  const hasChange = change.files.length > 0;
  const finishedWithResult = change.status === 'verified' || change.status === 'unverified' || change.status === 'delivered';
  const canExport = hasChange && finishedWithResult;
  if (!finishedWithResult) return { canDeliver: false, reason: isActive(change.status) ? 'Wait for the change to finish.' : change.status === 'interrupted' ? 'Resume the change first.' : 'Only a finished change can be delivered.', needsAcknowledgement: false, canExport };
  if (binding.originKind !== 'github') return { canDeliver: false, reason: 'An imported ZIP is never pushed anywhere. Export the patch or a ZIP of the changed files.', needsAcknowledgement: false, canExport };
  if (binding.state !== 'linked') return { canDeliver: false, reason: 'The link to this repository is not active.', needsAcknowledgement: false, canExport };
  if (binding.repositoryArchived) return { canDeliver: false, reason: 'The repository is archived. Export the patch instead.', needsAcknowledgement: false, canExport };
  if (!binding.permissions.push) return { canDeliver: false, reason: 'Your connected GitHub account cannot push to this repository. Export the patch instead.', needsAcknowledgement: false, canExport };
  return { canDeliver: true, reason: null, needsAcknowledgement: change.status === 'unverified', canExport };
}

/** One honest sentence about what the tests showed, for the header of a revision. */
export function testHeadline(tests: NonNullable<ChangeView['revisions'][number]['tests']> | null): string {
  if (!tests) return 'Tests were not run.';
  switch (tests.status) {
    case 'passed': return `Tests passed${tests.runtime ? ` (${tests.runtime})` : ''}.`;
    case 'failed': return 'Tests failed.';
    case 'unsupported': return 'No native test runner was found for these files, so nothing was tested.';
    case 'unavailable': return 'No isolated runtime was available, so the tests were not run.';
    case 'timeout': return 'The tests timed out.';
    case 'cancelled': return 'The test run was cancelled.';
    default: return 'The tests could not be completed.';
  }
}

/** One honest sentence about the browser check of a visual change, or null when none was owed. A check that did not run is never a pass. */
export function previewHeadline(preview: ChangeView['revisions'][number]['preview']): string | null {
  if (!preview) return null;
  if (preview.status === 'passed') return 'The page was observed in a browser and behaved as required.';
  if (preview.status === 'failed') return 'A browser check found a problem with the page.';
  return `No browser check ran for this visual change.${preview.reason ? ` ${preview.reason}` : ''}`;
}

export const reproductionNote = (r: ChangeView['reproduction'], addedTest: boolean): string | null =>
  r === 'reproduced' ? 'The new test fails on the original code and passes with the change.'
    : r === 'not_reproduced' ? 'The new test also passes on the original code, so it does not prove the bug is fixed.'
      : r === 'unavailable' && addedTest ? 'The new test could not be checked against the original code.' : null;

export const ago = (iso: string, now: number = Date.now()): string => {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`;
};
