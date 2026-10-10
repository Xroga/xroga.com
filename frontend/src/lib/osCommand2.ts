/** Command 2 fixtures are illustrative only. No IDs refer to real customer records. */
export type DemoStory = 'clinic' | 'browser-crm' | 'repair';
export type DemoStage = 'request' | 'planned' | 'approved' | 'working' | 'checking' | 'example-complete';
export type DemoNodeKind = 'trigger' | 'condition' | 'transform' | 'app-action' | 'approval' | 'output';
export interface DemoWorkflowNode { id: string; kind: DemoNodeKind; label: string; detail: string; next: string | null }
export interface DemoProject { id: DemoStory; name: string; goal: string; artifact: string; proposedEmployee: string; proposedAsset: string }
export interface DemoAsset { id: string; name: string; category: string; license: string; trust: 'approved-demo' | 'rejected-license' | 'incompatible'; detail: string }
export interface DemoEmployee { id: string; name: string; responsibility: string; permissions: string; cost: string }

export const DEMO_PROJECTS: DemoProject[] = [
  { id: 'clinic', name: 'Dental clinic concept', goal: 'Build a clinic appointment booking website and set up confirmations.', artifact: 'booking-concept', proposedEmployee: 'frontend-engineer', proposedAsset: 'booking-foundation' },
  { id: 'browser-crm', name: 'CRM follow-up example', goal: 'Review a sample CRM pipeline and prepare approved follow-ups.', artifact: 'crm-review', proposedEmployee: 'browser-operator', proposedAsset: 'approval-workflow' },
  { id: 'repair', name: 'Checkout repair example', goal: 'Inspect a broken checkout and prepare a reviewable repair.', artifact: 'patch-review', proposedEmployee: 'software-engineer', proposedAsset: 'test-harness' },
];

export const DEMO_EMPLOYEES: DemoEmployee[] = [
  ['software-engineer','Software Engineer','Plans and reviews code changes.','Repository read; write requires approval.','Higher effort for complex repairs.'],
  ['frontend-engineer','Frontend Engineer','Shapes accessible interfaces.','Sample project files only in this demo.','Moderate illustrative effort.'],
  ['qa-engineer','QA Engineer','Defines acceptance and regression checks.','Test environment access would require review.','Moderate illustrative effort.'],
  ['browser-operator','Browser Operator','Reviews bounded browser action plans.','Site access and writes require separate approval.','Effort rises with retries.'],
  ['research-analyst','Research Analyst','Organizes sources and competing findings.','Source access must be authorized.','Varies with source volume.'],
  ['data-analyst','Data Analyst','Explains structured evidence and uncertainty.','Dataset access would require review.','Varies with data volume.'],
  ['workflow-engineer','Workflow Engineer','Designs controlled automations.','Connections and schedules require approval.','Varies with connected steps.'],
  ['designer','Designer','Clarifies visual hierarchy and interaction.','No external writes in this demo.','Moderate illustrative effort.'],
  ['devops','DevOps','Plans release and recovery checks.','Deployment permission always required.','Higher effort for production gates.'],
  ['customer-operations','Customer Operations','Prepares service handoffs and follow-ups.','Customer data and outreach require approval.','Varies with case volume.'],
].map(([id,name,responsibility,permissions,cost]) => ({ id,name,responsibility,permissions,cost }));

export const DEMO_ASSETS: DemoAsset[] = [
  { id:'booking-foundation', name:'Accessible booking foundation', category:'App foundation', license:'Xroga demo original', trust:'approved-demo', detail:'Sample appointment form, confirmation view and keyboard checklist.' },
  { id:'approval-workflow', name:'Approval-first follow-up', category:'Workflow', license:'Xroga demo original', trust:'approved-demo', detail:'A read, review, approve, then act sequence with no live connector.' },
  { id:'test-harness', name:'Checkout test harness', category:'Skill', license:'Xroga demo original', trust:'approved-demo', detail:'Example validation cases for a simulated code repair.' },
  { id:'theme-component', name:'Quiet interface components', category:'UI component', license:'Xroga demo original', trust:'approved-demo', detail:'Theme-aware cards and accessible controls.' },
  { id:'motion-pattern', name:'Reduced-motion transitions', category:'Animation', license:'Xroga demo original', trust:'approved-demo', detail:'Subtle motion with a reduced-motion alternative.' },
  { id:'restricted-kit', name:'Restricted commercial kit', category:'App foundation', license:'Unverified third-party terms', trust:'rejected-license', detail:'Rejected: reuse rights have not been established.' },
  { id:'incompatible-kit', name:'Next 16 / Tailwind 4 kit', category:'App foundation', license:'MIT example', trust:'incompatible', detail:'Rejected: dependency baseline differs from Xroga Next 15 / Tailwind 3.' },
];

export const INITIAL_WORKFLOW: DemoWorkflowNode[] = [
  { id:'trigger-1', kind:'trigger', label:'Sample request received', detail:'A local example event only.', next:'condition-1' },
  { id:'condition-1', kind:'condition', label:'Check required fields', detail:'Continue only when the example has a contact and requested action.', next:'approval-1' },
  { id:'approval-1', kind:'approval', label:'Human review', detail:'A person would approve any external write.', next:'output-1' },
  { id:'output-1', kind:'output', label:'Prepare draft', detail:'Produce a local sample draft, not a sent message.', next:null },
];

export const FOUNDER_DEMO_FLOW = [
  { id:'pain', title:'Fictional user pain signal', detail:'Example clinic staff need a clearer booking handoff. Source: internal demo fixture; confidence: illustrative only.' },
  { id:'repository', title:'Potential repository approach', detail:'Evaluate an accessible booking foundation. No live repository was inspected for this fixture.' },
  { id:'license', title:'License and compatibility review', detail:'Confirm actual source rights and Next 15 / Tailwind 3 compatibility before any import.' },
  { id:'experiment', title:'Sandbox experiment', detail:'Test keyboard flow, dependency fit and privacy sanitization in isolation; not executed here.' },
  { id:'decision', title:'Founder decision', detail:'Choose a future evaluation or reject pending review. No implementation follows automatically.' },
] as const;

export function validateDemoWorkflow(nodes: DemoWorkflowNode[]): string[] {
  const errors: string[] = [];
  const ids = new Set(nodes.map((node) => node.id));
  if (!nodes.some((node) => node.kind === 'trigger')) errors.push('Add a trigger.');
  if (!nodes.some((node) => node.kind === 'output')) errors.push('Add an output.');
  if (!nodes.some((node) => node.kind === 'approval')) errors.push('Add an approval before the example action.');
  for (const node of nodes) if (node.next && !ids.has(node.next)) errors.push(`${node.label} points to a missing step.`);
  const starts = nodes.filter((node) => node.kind === 'trigger');
  for (const start of starts) {
    const seen = new Set<string>(); let current: DemoWorkflowNode | undefined = start; let approvalSeen = false;
    while (current) {
      if (seen.has(current.id)) { errors.push('The workflow has a cycle.'); break; }
      seen.add(current.id);
      if (current.kind === 'approval') approvalSeen = true;
      if (current.kind === 'app-action' && !approvalSeen) errors.push('Connect an approval before an app action.');
      current = nodes.find((node) => node.id === current?.next);
    }
    if (!Array.from(seen).some((id) => nodes.find((node) => node.id === id)?.kind === 'output')) errors.push('Connect the trigger to an output.');
    if (!approvalSeen) errors.push('Connect an approval in the trigger path.');
  }
  return Array.from(new Set(errors));
}

export function nextDemoStage(stage: DemoStage): DemoStage {
  const stages: DemoStage[] = ['request','planned','approved','working','checking','example-complete'];
  return stages[Math.min(stages.indexOf(stage) + 1, stages.length - 1)];
}
