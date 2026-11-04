/**
 * The shared verification gate for engineering runs (Batch 2 builds and Batch 3 edits).
 *
 * A run is VERIFIED only when every required check has a genuine receipt, issued by Xroga's own execution boundary, for the exact source that is
 * being delivered. This module decides that from receipts alone. It never trusts model text, a client-supplied result, or evidence recorded for
 * a different source revision, and it never counts a check that was skipped, not run or could not run as a pass.
 *
 * Receipts are issued only by `ExecutedCheckRecorder`. Membership in a module-private registry is what makes a receipt genuine, so an object
 * rebuilt from JSON (a forged "test result" from a model or a request body) is rejected even if every field looks right.
 */

export type CheckStatus = 'passed' | 'failed' | 'skipped' | 'not_run' | 'unavailable';

export interface ExecutedCheck {
  readonly checkId: string;
  readonly status: CheckStatus;
  /** The exact command that ran, or null when nothing ran. */
  readonly command: string | null;
  readonly exitCode: number | null;
  readonly startedAt: string;
  readonly finishedAt: string;
  /** Fingerprint of the exact source the check ran against. */
  readonly sourceFingerprint: string;
  readonly runId: string;
  readonly projectId: string;
  /** Fencing generation of the attempt that ran it. */
  readonly attemptGeneration: number;
}

export interface CheckReceipt extends ExecutedCheck {
  readonly issuer: 'xroga-execution-boundary';
}

const issued = new WeakSet<object>();

const CHECK_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const FINGERPRINT = /^[a-f0-9]{64}$/;

export class ExecutedCheckRecorder {
  /** Called by the execution boundary after it actually ran (or declined to run) a check. */
  record(check: ExecutedCheck): CheckReceipt {
    if (!CHECK_ID.test(check.checkId)) throw new Error('Check id is invalid.');
    if (!FINGERPRINT.test(check.sourceFingerprint)) throw new Error('A check receipt must name the exact source it ran against.');
    if (check.status === 'passed' && (check.exitCode !== 0 || !check.command)) throw new Error('A passed check needs a command and a zero exit code.');
    if ((check.status === 'skipped' || check.status === 'not_run' || check.status === 'unavailable') && check.command !== null && check.exitCode !== null) {
      throw new Error('A check that did not run cannot carry an exit code.');
    }
    const receipt = Object.freeze({ ...check, issuer: 'xroga-execution-boundary' as const });
    issued.add(receipt);
    return receipt;
  }
}

export type GateOutcome = 'verified' | 'partial' | 'blocked' | 'failed' | 'cancelled';

export interface GateInput {
  readonly requiredChecks: readonly string[];
  readonly delivered: { readonly runId: string; readonly projectId: string; readonly sourceFingerprint: string; readonly attemptGeneration: number };
  readonly receipts: readonly unknown[];
  /** The delivered source has been durably stored and read back. */
  readonly sourceDurable: boolean;
  /** The run was cancelled, or this attempt lost its lease generation, before the gate ran. */
  readonly cancelled?: boolean;
  readonly staleAttempt?: boolean;
  /** Set when an external provider outcome is being claimed; it needs its own genuine receipt. */
  readonly externalClaim?: { readonly claimed: boolean; readonly providerReceiptPresent: boolean };
}

export interface GateResult {
  readonly outcome: GateOutcome;
  readonly reasons: readonly string[];
  readonly passed: readonly string[];
  readonly missing: readonly string[];
}

function isGenuine(value: unknown): value is CheckReceipt {
  return typeof value === 'object' && value !== null && issued.has(value);
}

export function evaluateVerification(input: GateInput): GateResult {
  const reasons: string[] = [];
  const { delivered } = input;
  if (input.cancelled) return { outcome: 'cancelled', reasons: ['The run was cancelled; a cancelled run can never be reported verified.'], passed: [], missing: [...input.requiredChecks] };
  if (input.staleAttempt) return { outcome: 'blocked', reasons: ['This attempt no longer holds the current lease generation, so it cannot certify the run.'], passed: [], missing: [...input.requiredChecks] };
  if (input.requiredChecks.length === 0) return { outcome: 'blocked', reasons: ['No required checks were defined, so there is nothing to verify against.'], passed: [], missing: [] };

  // Only genuine receipts for exactly this run, project, source and attempt count. Everything else is evidence about something else.
  const relevant = input.receipts.filter(isGenuine).filter((r) => r.runId === delivered.runId && r.projectId === delivered.projectId
    && r.sourceFingerprint === delivered.sourceFingerprint && r.attemptGeneration <= delivered.attemptGeneration);
  const ignored = input.receipts.length - relevant.length;
  if (ignored > 0) reasons.push(`${ignored} receipt(s) were ignored because they were not issued by Xroga for this exact source and run.`);

  const passed: string[] = []; const missing: string[] = []; let failed = false; let unavailable = false;
  for (const id of input.requiredChecks) {
    // The latest receipt for a check decides: an earlier pass does not survive a later failure on the same source.
    const mine = relevant.filter((r) => r.checkId === id).sort((a, b) => Date.parse(a.finishedAt) - Date.parse(b.finishedAt));
    const last = mine.at(-1);
    if (!last) { missing.push(id); continue; }
    if (last.status === 'passed') passed.push(id);
    else if (last.status === 'failed') { failed = true; missing.push(id); reasons.push(`Check "${id}" failed.`); }
    else if (last.status === 'unavailable') { unavailable = true; missing.push(id); reasons.push(`Check "${id}" could not run: the runtime for it is unavailable.`); }
    else { missing.push(id); reasons.push(`Check "${id}" was ${last.status === 'skipped' ? 'skipped' : 'not run'}; that is not a pass.`); }
  }
  for (const id of missing) if (!reasons.some((r) => r.includes(`"${id}"`))) reasons.push(`Check "${id}" has no receipt for this exact source.`);

  if (input.externalClaim?.claimed && !input.externalClaim.providerReceiptPresent) {
    reasons.push('An external provider result is claimed without a genuine provider receipt.');
    return { outcome: 'blocked', reasons, passed, missing };
  }
  if (failed) return { outcome: 'failed', reasons, passed, missing };
  if (unavailable) return { outcome: 'blocked', reasons, passed, missing };
  if (missing.length > 0) return { outcome: 'partial', reasons, passed, missing };
  if (!input.sourceDurable) {
    reasons.push('The delivered source is not durably stored and read back, so the run cannot be reported verified.');
    return { outcome: 'blocked', reasons, passed, missing };
  }
  return { outcome: 'verified', reasons, passed, missing };
}
