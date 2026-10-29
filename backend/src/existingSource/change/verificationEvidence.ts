/**
 * Batch 3's adapter onto the shared verification gate (ai/verificationGate.ts).
 *
 * `ChangeService.outcome()` decides the user-facing status from the test and browser results. This runs the same evidence through the shared gate
 * as an independent second check, with receipts bound to the digest of the change set that was actually tested. It can only downgrade a
 * `verified` outcome (for example when the final change is not the one the tests ran on); it never promotes anything.
 */
import { evaluateVerification, ExecutedCheckRecorder, type CheckStatus, type ExecutedCheck, type GateResult } from '../../ai/verificationGate.js';
import type { SoftwarePreviewEvidence } from '../../ai/softwareAgent/contracts.js';
import type { TestRunResult } from './testRunner.js';

const recorder = new ExecutedCheckRecorder();

export interface ChangeGateInput {
  readonly runId: string;
  readonly projectId: string;
  /** Digest of the change set the tests ran against. */
  readonly testedDigest: string | null;
  /** Digest of the change set that would be delivered. */
  readonly deliveredDigest: string;
  readonly tests: TestRunResult | null;
  /** Present only when the change owes a browser observation. */
  readonly preview: SoftwarePreviewEvidence | null;
  readonly owesBrowser: boolean;
  readonly sourceComplete: boolean;
  readonly cancelled?: boolean;
}

function testStatus(status: TestRunResult['status']): CheckStatus {
  switch (status) {
    case 'passed': return 'passed';
    case 'failed': return 'failed';
    case 'unavailable': return 'unavailable';
    default: return 'not_run'; // unsupported, timeout, error, cancelled: nothing certifies the change
  }
}

function previewStatus(preview: SoftwarePreviewEvidence): CheckStatus {
  if (preview.status === 'passed') return 'passed';
  if (preview.status === 'failed') return 'failed';
  return 'not_run';
}

export function gateChange(input: ChangeGateInput): GateResult {
  // A visual change in a project with no native test runner is verified by the browser observation alone; otherwise the project's own tests are required.
  const browserOnly = input.owesBrowser && input.tests?.status === 'unsupported';
  const required = browserOnly ? ['browser-preview'] : ['project-tests', ...(input.owesBrowser ? ['browser-preview'] : [])];
  const receipts: unknown[] = [];
  const at = new Date().toISOString();
  const base = { runId: input.runId, projectId: input.projectId, attemptGeneration: 0, startedAt: at, finishedAt: at };
  if (input.tests && input.testedDigest) {
    const status = testStatus(input.tests.status);
    const ran = status === 'passed' || status === 'failed';
    const label = input.tests.stages.filter((s) => s.kind === 'test').map((s) => s.label).join(' && ') || 'project tests';
    const check: ExecutedCheck = { ...base, checkId: 'project-tests', status, command: ran ? label : null, exitCode: ran ? (status === 'passed' ? 0 : 1) : null, sourceFingerprint: input.testedDigest };
    receipts.push(recorder.record(check));
    if (input.owesBrowser && input.preview) {
      const pStatus = previewStatus(input.preview);
      const pRan = pStatus === 'passed' || pStatus === 'failed';
      receipts.push(recorder.record({ ...base, checkId: 'browser-preview', status: pStatus, command: pRan ? 'browser verification' : null, exitCode: pRan ? (pStatus === 'passed' ? 0 : 1) : null, sourceFingerprint: input.testedDigest }));
    }
  }
  return evaluateVerification({
    requiredChecks: required,
    delivered: { runId: input.runId, projectId: input.projectId, sourceFingerprint: input.deliveredDigest, attemptGeneration: 0 },
    receipts, sourceDurable: input.sourceComplete, cancelled: input.cancelled,
  });
}
