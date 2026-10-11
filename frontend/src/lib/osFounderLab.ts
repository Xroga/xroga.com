/** Founder-only, fictional fixtures. Import this module only from the server-gated founder UI. */
export const FOUNDER_DEMO_FLOW = [
  { id: 'pain', title: 'Fictional user pain signal', detail: 'Example clinic staff need a clearer booking handoff. Source: internal demo fixture; confidence: illustrative only.' },
  { id: 'repository', title: 'Potential repository approach', detail: 'Evaluate an accessible booking foundation. No live repository was inspected for this fixture.' },
  { id: 'license', title: 'License and compatibility review', detail: 'Confirm actual source rights and Next 15 / Tailwind 3 compatibility before any import.' },
  { id: 'experiment', title: 'Sandbox experiment', detail: 'Test keyboard flow, dependency fit and privacy sanitization in isolation; not executed here.' },
  { id: 'decision', title: 'Founder decision', detail: 'Choose a future evaluation or reject pending review. No implementation follows automatically.' },
] as const;

export type LabStatus = 'queued' | 'running' | 'needs_approval' | 'validating' | 'repairing' | 'partial' | 'blocked' | 'failed' | 'verified' | 'cancelled';
export type LabModule = 'Outcome' | 'Browser' | 'Workflow' | 'Budget' | 'Storage' | 'Builder' | 'Genome' | 'Experience' | 'Security' | 'Diagnostics';
export interface LabScenario {
  id: string;
  title: string;
  module: LabModule;
  requestedStatus: LabStatus;
  cause: string; // Fictional, already redacted and safe for this restricted UI.
  nextAction: string;
  evidence: readonly string[];
  evidencePassed: boolean;
  affectedDeliverables: readonly string[];
  sourceClass: 'fixture';
  severity: 'info' | 'warning' | 'error';
}

type Definition = readonly [string, string, LabModule, LabStatus, string, string, string?];
const DEFINITIONS: readonly Definition[] = [
  ['happy-path', 'Happy path', 'Outcome', 'verified', 'All fictional acceptance checks were recorded.', 'Review the sample receipt.', 'Sample acceptance checklist passed'],
  ['loading', 'Loading state', 'Outcome', 'running', 'Example work has not reached a result.', 'Wait or cancel the local example.'],
  ['empty-result', 'Empty result', 'Outcome', 'partial', 'No example candidates matched the constraints.', 'Change the example scope and retry.'],
  ['invalid-fields', 'Invalid or missing fields', 'Outcome', 'blocked', 'Required example fields are absent.', 'Complete the required fields.'],
  ['user-cancelled', 'User cancellation', 'Outcome', 'cancelled', 'The local example was cancelled.', 'Replay when ready.'],
  ['input-needed', 'User input needed', 'Outcome', 'needs_approval', 'The next example step needs clarification.', 'Review the requested example input.'],
  ['approval-pending', 'Approval pending', 'Outcome', 'needs_approval', 'The example action has no recorded approval.', 'Review its scope before continuing.'],
  ['approval-denied', 'Approval denied', 'Outcome', 'blocked', 'Permission was denied in the fixture.', 'Choose a smaller permitted scope.'],
  ['connection-revoked', 'Revoked connection', 'Browser', 'blocked', 'Example connection permission was withdrawn.', 'Review the connection before retrying.'],
  ['provider-timeout', 'Provider timeout', 'Outcome', 'repairing', 'The fictional provider did not respond in time.', 'Try a bounded retry.'],
  ['rate-limit', 'Rate limit', 'Outcome', 'partial', 'The fictional provider asked the run to wait.', 'Wait and retry later.'],
  ['model-unavailable', 'Unavailable model', 'Outcome', 'blocked', 'The selected fictional model is unavailable.', 'Review an approved alternative.'],
  ['provider-outage', 'Provider outage', 'Outcome', 'failed', 'The example provider remained unavailable.', 'Retry after service recovery.'],
  ['reconnect', 'Reconnect after interruption', 'Outcome', 'verified', 'The local replay resumed from the last example step.', 'Inspect the sample receipt.', 'Replayed steps and checks match'],
  ['selector-failure', 'Browser selector failure', 'Browser', 'repairing', 'A fictional page target changed.', 'Inspect the page and try a bounded fallback.'],
  ['dom-mismatch', 'Screenshot and DOM mismatch', 'Browser', 'blocked', 'Two fictional observations disagree.', 'Request human review of the example.'],
  ['inaccessible-action', 'Inaccessible browser action', 'Browser', 'blocked', 'The example action has no safe accessible target.', 'Stop and request an accessible path.'],
  ['workflow-invalid', 'Invalid workflow graph', 'Workflow', 'blocked', 'A required example connection is missing.', 'Repair the graph and validate again.'],
  ['workflow-cycle', 'Workflow cycle', 'Workflow', 'blocked', 'The example graph loops without a bounded exit.', 'Remove the cycle.'],
  ['idempotent-retry', 'Idempotent retry', 'Workflow', 'verified', 'The fictional retry reused the same action identity.', 'Inspect the duplicate-prevention evidence.', 'One output for one action key'],
  ['missing-capability', 'Missing capability', 'Workflow', 'blocked', 'The example action has no approved capability.', 'Review permissions before the dry run.'],
  ['budget-exhausted', 'AI budget exhausted', 'Budget', 'blocked', 'The fictional AI budget has no available allowance.', 'Reduce scope or review an amendment.'],
  ['overrun-prevented', 'Budget overrun prevented', 'Budget', 'partial', 'The next example step would exceed its limit.', 'Review the budget before resuming.'],
  ['storage-quota', 'Storage quota reached', 'Storage', 'blocked', 'The fictional durable-storage meter is full; AI allowance is separate.', 'Review storage options without uploading.'],
  ['code-test-failure', 'Code test failure', 'Builder', 'repairing', 'An example assertion failed.', 'Inspect the proposed patch and rerun the example.'],
  ['patch-conflict', 'Patch conflict', 'Builder', 'blocked', 'The example patch overlaps another change.', 'Rebase the proposed change in an isolated review.'],
  ['stale-git-base', 'Stale Git base', 'Builder', 'blocked', 'The fictional base revision changed.', 'Refresh the example diff before approval.'],
  ['dependency-incompatible', 'Dependency incompatibility', 'Builder', 'blocked', 'The sample dependency does not fit the current stack.', 'Choose a compatible option.'],
  ['missing-license', 'Missing license provenance', 'Genome', 'blocked', 'Reuse rights are not established in this fixture.', 'Verify the source license before reuse.'],
  ['prohibited-license', 'Prohibited source license', 'Genome', 'blocked', 'The fictional source license is not approved.', 'Reject this candidate.'],
  ['uncertified-asset', 'Uncertified Genome asset', 'Genome', 'needs_approval', 'No sample certification evidence is recorded.', 'Request review before reuse.'],
  ['false-success', 'False-success verification attempt', 'Outcome', 'verified', 'The example claims completion without acceptance evidence.', 'Keep the result blocked until evidence passes.'],
  ['partial', 'Partially complete', 'Outcome', 'partial', 'Only some fictional deliverables reached review.', 'Inspect what remains and revise scope.'],
  ['failed-outcome', 'Failed outcome', 'Outcome', 'failed', 'The example could not meet the required criteria.', 'Review a safer revised plan.'],
  ['recovery-exhausted', 'Recovery exhausted', 'Outcome', 'failed', 'The bounded fictional retries have ended.', 'Request human review.'],
  ['stale-version', 'Stale saved version', 'Experience', 'blocked', 'The selected example version is out of date.', 'Open the latest version before review.'],
  ['unsafe-input', 'Injected untrusted instructions', 'Security', 'blocked', 'Untrusted fixture instructions were refused.', 'Use only approved task instructions.'],
  ['secret-candidate', 'Secret leakage candidate', 'Security', 'blocked', 'A fictional sensitive-content pattern was denied.', 'Remove sensitive input and review the scope.'],
  ['cross-tenant', 'Cross-tenant read denied', 'Security', 'blocked', 'The simulated tenant boundary denied access.', 'Stay within the authorized project.'],
  ['diagnostics-unavailable', 'Founder diagnostics unavailable', 'Diagnostics', 'blocked', 'No founder-exclusive diagnostics feed is connected.', 'Keep live diagnostics disconnected.'],
  ['permission-denied', 'True permission denial', 'Diagnostics', 'blocked', 'The simulated request lacks all required server grants.', 'Use an authorized account; do not bypass the gate.'],
];

export const LAB_SCENARIOS: readonly LabScenario[] = DEFINITIONS.map(([id, title, module, requestedStatus, cause, nextAction, evidence]) => ({
  id, title, module, requestedStatus, cause, nextAction,
  evidence: evidence ? [evidence] : [], evidencePassed: Boolean(evidence),
  affectedDeliverables: [module === 'Storage' ? 'Example artifact' : 'Example outcome contract'],
  sourceClass: 'fixture', severity: requestedStatus === 'failed' ? 'error' : requestedStatus === 'verified' ? 'info' : 'warning',
}));

export function labTerminalStatus(scenario: LabScenario): LabStatus {
  // A fixture claiming success cannot override the acceptance gate.
  if (scenario.requestedStatus === 'verified' && (!scenario.evidence.length || !scenario.evidencePassed)) return 'blocked';
  return scenario.requestedStatus;
}

export function labStatusAt(scenario: LabScenario, step: number): LabStatus {
  if (step <= 0) return 'queued';
  if (step === 1) return 'running';
  if (step === 2) {
    const final = labTerminalStatus(scenario);
    return final === 'verified' || final === 'partial' ? 'validating' : final === 'needs_approval' ? 'needs_approval' : final === 'cancelled' ? 'cancelled' : final === 'running' ? 'running' : 'repairing';
  }
  return labTerminalStatus(scenario);
}

export function labPublicMessage(scenario: LabScenario): { happened: string; saved: string; remaining: string; next: string; reference: string } {
  const status = labTerminalStatus(scenario);
  return {
    happened: status === 'verified' ? 'This example passed its simulated checks.' : status === 'running' ? 'This example is still in progress.' : status === 'cancelled' ? 'This example was cancelled.' : 'This example needs more work before it can be marked complete.',
    saved: 'Only local demo state is saved. No real work or external change was made.',
    remaining: status === 'verified' ? 'Real execution and independent evidence would still be required.' : 'The example outcome and real acceptance evidence remain unfinished.',
    next: scenario.nextAction,
    reference: `DEMO-${scenario.id.toUpperCase()}`,
  };
}
