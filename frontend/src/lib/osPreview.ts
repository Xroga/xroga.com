/** Static, data-only demonstration contracts. Nothing in this module calls Xroga APIs. */
export type PreviewFeatureAvailability = 'available-now' | 'interactive-preview' | 'coming-soon';
export type PreviewUserFacingStatus = 'draft' | 'queued' | 'working' | 'validating' | 'verified' | 'needs-approval' | 'partially-complete' | 'unable-to-complete';
export type PreviewScenario = 'clinic' | 'code-repair' | 'crm-operations';
export type PreviewEnding = 'verified' | 'needs-approval' | 'partially-complete' | 'unable-to-complete';

export interface PreviewDeliverable { id: string; title: string; detail: string }
export interface PreviewTaskNode { id: string; title: string; role: string; dependsOn: string[]; description: string }
export interface PreviewRunEvent { id: string; step: number; status: PreviewUserFacingStatus; title: string; detail: string }
export interface PreviewApproval { id: string; service: string; reason: string; required: boolean }
export interface PreviewEvidence { id: string; title: string; requirement: string; demoState: 'not-executed' }
export interface PreviewArtifact { id: string; title: string; kind: 'website' | 'patch' | 'workflow'; summary: string }
export interface PreviewOutcomeContract {
  id: PreviewScenario;
  goal: string;
  constraints: string[];
  deliverables: PreviewDeliverable[];
  acceptanceCriteria: string[];
  tasks: PreviewTaskNode[];
  approvals: PreviewApproval[];
  evidence: PreviewEvidence[];
  artifact: PreviewArtifact;
  budget: { label: string; amount: number; unit: 'demo credits' };
}
export interface PreviewRunState { scenario: PreviewScenario; ending: PreviewEnding; status: PreviewUserFacingStatus; step: number; events: PreviewRunEvent[]; paused: boolean }
export interface PreviewReceipt { label: 'DEMO / NOT EXECUTED'; scenario: PreviewScenario; status: PreviewUserFacingStatus; evidence: PreviewEvidence[]; completedSteps: number; actualExternalChanges: 0 }

export const PREVIEW_FIXTURES: Record<PreviewScenario, PreviewOutcomeContract> = {
  clinic: {
    id: 'clinic', goal: 'Build a clinic appointment booking website and set up confirmations.',
    constraints: ['Example clinic only — no patient data', 'No real calendar access', 'No publishing or messages sent'],
    deliverables: [
      { id: 'booking', title: 'Booking flow', detail: 'A responsive sample appointment selection and confirmation screen.' },
      { id: 'confirmation', title: 'Confirmation design', detail: 'A sample confirmation message and delivery rule for review.' },
      { id: 'handoff', title: 'Owner handoff', detail: 'A checklist for real data, permissions, tests, and launch.' },
    ],
    acceptanceCriteria: ['A visitor can choose a sample appointment slot on mobile and desktop.', 'Confirmation copy states the date, time, and next step clearly.', 'Accessibility and booking edge cases are checked before any real release.'],
    tasks: [
      { id: 'scope', title: 'Define the booking experience', role: 'Product planner', dependsOn: [], description: 'Clarify services, working hours, and visitor needs.' },
      { id: 'design', title: 'Design booking screens', role: 'Designer', dependsOn: ['scope'], description: 'Prepare accessible mobile and desktop layouts.' },
      { id: 'build', title: 'Implement sample flow', role: 'Developer', dependsOn: ['design'], description: 'Build a non-connected example interface.' },
      { id: 'verify', title: 'Check acceptance criteria', role: 'QA', dependsOn: ['build'], description: 'List required browser and accessibility checks.' },
    ],
    approvals: [{ id: 'calendar', service: 'Calendar', reason: 'Would be required before writing real appointments.', required: true }, { id: 'mail', service: 'Email', reason: 'Would be required before sending confirmations.', required: true }],
    evidence: [{ id: 'browser', title: 'Browser checks', requirement: 'Responsive booking and keyboard path must be tested on the real product.', demoState: 'not-executed' }, { id: 'delivery', title: 'Confirmation delivery', requirement: 'Real mail-provider send and receipt must be checked after authorization.', demoState: 'not-executed' }],
    artifact: { id: 'site', title: 'Clinic booking concept', kind: 'website', summary: 'A nonfunctional visual concept with sample slots and confirmation copy.' },
    budget: { label: 'Illustrative planning allowance', amount: 18, unit: 'demo credits' },
  },
  'code-repair': {
    id: 'code-repair', goal: 'Repair a broken checkout and verify the payment flow.',
    constraints: ['Example repository only', 'No payment provider connected', 'No merge or deployment'],
    deliverables: [{ id: 'patch', title: 'Proposed patch', detail: 'A sample change list for checkout validation.' }, { id: 'tests', title: 'Test plan', detail: 'Unit and browser checks to run in a real repository.' }],
    acceptanceCriteria: ['Payment failure is surfaced without exposing provider details.', 'Successful checkout requires a verified provider response.', 'No change is deployed without review.'],
    tasks: [{ id: 'inspect', title: 'Inspect failure', role: 'Developer', dependsOn: [], description: 'Identify a likely validation boundary.' }, { id: 'patch', title: 'Prepare patch', role: 'Developer', dependsOn: ['inspect'], description: 'Draft a reviewable change.' }, { id: 'test', title: 'Plan verification', role: 'QA', dependsOn: ['patch'], description: 'Define tests and evidence.' }],
    approvals: [{ id: 'repo', service: 'Repository', reason: 'Would be needed to inspect or change real code.', required: true }],
    evidence: [{ id: 'tests', title: 'Real test results', requirement: 'Run unit and browser checks in the actual repository.', demoState: 'not-executed' }],
    artifact: { id: 'patch', title: 'Checkout repair concept', kind: 'patch', summary: 'An example patch plan, not a changed file.' },
    budget: { label: 'Illustrative planning allowance', amount: 12, unit: 'demo credits' },
  },
  'crm-operations': {
    id: 'crm-operations', goal: 'Summarize a CRM pipeline and prepare follow-up tasks in the browser.',
    constraints: ['Example contacts only', 'No CRM or browser connection', 'No external tasks created'],
    deliverables: [{ id: 'report', title: 'Pipeline summary', detail: 'A sample summary structure with next actions.' }, { id: 'workflow', title: 'Action plan', detail: 'A review queue before any external changes.' }],
    acceptanceCriteria: ['Each proposed action has a source and owner.', 'No outreach is sent without explicit approval.', 'The user can review any proposed browser action.'],
    tasks: [{ id: 'collect', title: 'Collect context', role: 'Researcher', dependsOn: [], description: 'Identify authorized CRM data sources.' }, { id: 'summarize', title: 'Prepare summary', role: 'Analyst', dependsOn: ['collect'], description: 'Organize findings and uncertainties.' }, { id: 'review', title: 'Queue actions for approval', role: 'Workflow specialist', dependsOn: ['summarize'], description: 'Prepare—not execute—follow-ups.' }],
    approvals: [{ id: 'crm', service: 'CRM', reason: 'Would be needed to read real contact records.', required: true }, { id: 'browser', service: 'Browser', reason: 'Would be needed before performing external actions.', required: true }],
    evidence: [{ id: 'source', title: 'Source trace', requirement: 'Real records and browser actions need attributable evidence.', demoState: 'not-executed' }],
    artifact: { id: 'workflow', title: 'Follow-up workflow concept', kind: 'workflow', summary: 'A simulated review queue, not created tasks.' },
    budget: { label: 'Illustrative planning allowance', amount: 15, unit: 'demo credits' },
  },
};

export function createPreviewRun(scenario: PreviewScenario, ending: PreviewEnding = 'verified'): PreviewRunState {
  return { scenario, ending, status: 'draft', step: 0, events: [], paused: true };
}

const STAGES: PreviewUserFacingStatus[] = ['queued', 'working', 'validating'];
const STAGE_TITLES = ['Plan accepted for simulation', 'Sample work in progress', 'Checking sample acceptance path'];

export function advancePreviewRun(run: PreviewRunState): PreviewRunState {
  if (run.step >= 4) return run;
  const nextStep = run.step + 1;
  const status = nextStep === 4 ? run.ending : STAGES[nextStep - 1];
  const title = nextStep === 4
    ? ({ verified: 'Demo path complete', 'needs-approval': 'Approval would be needed', 'partially-complete': 'Some steps need follow-up', 'unable-to-complete': 'Demo cannot continue' } as const)[run.ending]
    : STAGE_TITLES[nextStep - 1];
  const detail = nextStep === 4
    ? 'This is a simulated result. No real tools ran, no evidence was collected, and no external changes were made.'
    : 'Illustrative event only. No live worker, service, or provider was contacted.';
  const event: PreviewRunEvent = { id: `${run.scenario}-${nextStep}`, step: nextStep, status, title, detail };
  return { ...run, step: nextStep, status, events: [...run.events, event], paused: nextStep === 4 ? true : run.paused };
}

export function createPreviewReceipt(run: PreviewRunState): PreviewReceipt | null {
  if (run.step !== 4) return null;
  return { label: 'DEMO / NOT EXECUTED', scenario: run.scenario, status: run.status, evidence: PREVIEW_FIXTURES[run.scenario].evidence, completedSteps: run.step, actualExternalChanges: 0 };
}

/** The only service adapter in Command 1. Future live adapters must be separate and server-authorized. */
export const previewAdapter = { fixtures: PREVIEW_FIXTURES, createRun: createPreviewRun, advance: advancePreviewRun, receipt: createPreviewReceipt } as const;
