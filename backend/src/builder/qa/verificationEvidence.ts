/**
 * Batch 2's adapter onto the shared verification gate (ai/verificationGate.ts).
 *
 * Browser QA records its evidence against the exact revision it tested, then relabels that revision. This runs the same report through the shared
 * gate as an independent second check: a revision is labelled `verified` only if every required check has a genuine receipt for that
 * revision's content hash. The gate can only downgrade a `verified` label to `partial`; it never promotes.
 *
 * Limitation, stated on purpose: an incremental run may carry a pass forward from an earlier revision without re-executing it. A carried pass is
 * not evidence about this revision, so the gate is skipped for such a report and the existing rule stands. It is not re-attested here.
 */
import { evaluateVerification, ExecutedCheckRecorder, type GateResult } from '../../ai/verificationGate.js';
import type { QaReport } from './types.js';

const recorder = new ExecutedCheckRecorder();

export interface QaGateInput {
  readonly report: QaReport;
  readonly runId: string;
  readonly projectId: string;
  /** Content hash of the revision the report was recorded against. */
  readonly revisionContentSha256: string;
  /** Content hash of the revision the checks actually ran on. */
  readonly testedContentSha256: string;
}

/** Returns null when the gate does not apply (nothing is claimed verified, or the report carries passes it did not execute). */
export function gateQaReport(input: QaGateInput): GateResult | null {
  const required = input.report.checks.filter((c) => c.required);
  if (input.report.status !== 'passed' || required.length === 0) return null;
  if (required.some((c) => !c.executed)) return null;
  const at = new Date().toISOString();
  const receipts = required.map((c) => recorder.record({
    checkId: c.id.toLowerCase().replace(/[^a-z0-9._-]/g, '-').replace(/^[^a-z0-9]+/, '').slice(0, 64) || 'qa-check',
    status: c.status === 'passed' ? 'passed' : c.status === 'failed' ? 'failed' : 'not_run',
    command: c.status === 'pending' ? null : `browser QA: ${c.title}`.slice(0, 200),
    exitCode: c.status === 'pending' ? null : c.status === 'passed' ? 0 : 1,
    startedAt: at, finishedAt: at, sourceFingerprint: input.testedContentSha256, runId: input.runId, projectId: input.projectId, attemptGeneration: 0,
  }));
  const ids = required.map((c) => c.id.toLowerCase().replace(/[^a-z0-9._-]/g, '-').replace(/^[^a-z0-9]+/, '').slice(0, 64) || 'qa-check');
  return evaluateVerification({
    requiredChecks: [...new Set(ids)],
    delivered: { runId: input.runId, projectId: input.projectId, sourceFingerprint: input.revisionContentSha256, attemptGeneration: 0 },
    receipts, sourceDurable: true,
  });
}
