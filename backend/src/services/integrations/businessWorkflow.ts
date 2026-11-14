/**
 * Split only explicit, independent connected-app requests. The original clause
 * is passed to tool discovery; provider data is never promoted into action
 * instructions. Ambiguous language remains on the normal single-task path.
 */
export interface BusinessWorkflowStep {
  kind: 'read' | 'action';
  request: string;
  dependsOnPrevious: boolean;
}

const READ_VERBS = /^(?:please\s+)?(?:find|search|list|show|check|look up|lookup|fetch|retrieve|read|summarize|inspect|review|get)\b/i;
const ACTION_VERBS = /^(?:please\s+)?(?:send|email|message|create|schedule|book|update|edit|delete|remove|cancel|publish|post|upload|invite|add|set|archive|reply|refund|transfer|pay|share)\b/i;
const NEXT_TASK = /(?:please\s+)?(?:find|search|list|show|check|look up|lookup|fetch|retrieve|read|summarize|inspect|review|get|send|email|message|create|schedule|book|update|edit|delete|remove|cancel|publish|post|upload|invite|add|set|archive|reply|refund|transfer|pay|share)\b/i;
const DEPENDENT_REFERENCE = /\b(?:them|those|these|it|that|their|each|every|all|found|matching|top\s+\d+|first\s+\d+|the results?|the (?:people|clients|leads|items|records|files|events|messages) (?:you|we) (?:found|created|listed)|from (?:that|the previous) (?:step|search))\b/i;

export function splitExplicitBusinessWorkflow(message: string): BusinessWorkflowStep[] | null {
  const text = message.trim();
  if (text.length < 8 || text.length > 1_500 || /\b(?:web|internet)\s+(?:search|research)|\bsearch\s+(?:the\s+)?(?:web|internet)\b/i.test(text)) {
    return null;
  }

  const separator = new RegExp(`\\s*(?:;|\\n+)\\s*|\\s+(?:and then|then|and|also)\\s+(?=${NEXT_TASK.source})`, 'gi');
  const clauses = text.split(separator).map((item) => item.trim().replace(/^[,.;\s]+|[,.;\s]+$/g, ''));
  if (clauses.length < 2 || clauses.length > 8 || clauses.some((item) => item.length < 5 || item.length > 500)) return null;

  const steps: BusinessWorkflowStep[] = [];
  for (const request of clauses) {
    const kind = ACTION_VERBS.test(request) ? 'action' : READ_VERBS.test(request) ? 'read' : null;
    if (!kind) return null;
    steps.push({
      kind,
      request,
      dependsOnPrevious: steps.length > 0 && DEPENDENT_REFERENCE.test(request),
    });
  }
  // Two explicit reads can also form a useful cross-app workflow. The same
  // durable checkpoints and per-read confirmation still apply to each step.
  return steps;
}

/**
 * Continue only the paused action. Previous completed steps and their receipts
 * stay untouched. User clarification is never treated as provider authority.
 */
export function clarifyPendingBusinessWorkflowStep(
  steps: BusinessWorkflowStep[], stepIndex: number, details: string,
): BusinessWorkflowStep[] {
  if (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex >= steps.length ||
      steps[stepIndex]?.kind !== 'action') throw new Error('No pending action to clarify.');
  if (typeof details !== 'string' || details.length > 350 ||
      /[\u0000-\u001f\u007f]/.test(details)) throw new Error('Invalid action clarification.');
  const clean = details.trim().replace(/\s+/g, ' ');
  if (clean.length < 3) throw new Error('Provide the missing details for this action.');
  const current = steps[stepIndex]!;
  const updated = `${current.request}\nUser clarification: ${clean}`;
  if (updated.length > 500) throw new Error('Action details are too long. Narrow the clarification.');
  return steps.map((step, index) => index === stepIndex ? { ...step, request: updated } : { ...step });
}

/**
 * A bounded wave of independent, explicitly requested read-only steps.
 * Writes and dependent reads remain strictly sequential and approval gated.
 */
export function independentReadWave(steps: readonly BusinessWorkflowStep[], startIndex: number, maxConcurrency = 3): number[] {
  if (!Number.isInteger(startIndex) || startIndex < 0 || startIndex >= steps.length) return [];
  const limit = Math.min(3, Math.max(1, Math.trunc(maxConcurrency)));
  const indexes: number[] = [];
  for (let i = startIndex; i < steps.length && indexes.length < limit; i++) {
    const step = steps[i];
    if (!step || step.kind !== 'read' || step.dependsOnPrevious) break;
    indexes.push(i);
  }
  return indexes;
}

/** Select bounded evidence for an explicitly dependent step, never as instructions.
 * Include both relevant prior reads and the most recent created destination when
 * the user refers to earlier records. External egress still requires approval.
 */
export function dependentWorkflowEvidenceIndexes(
  outcomes: readonly { stepIndex: number; kind: 'read' | 'action' }[],
  pendingIndex: number, request: string, dependsOnPrevious: boolean,
): number[] {
  if (!dependsOnPrevious || pendingIndex < 1) return [];
  const earlier = outcomes.map((item, index) => ({ ...item, index }))
    .filter((item) => item.stepIndex < pendingIndex);
  if (!earlier.length) return [];
  const referencesReadData = /\b(?:results?|found|matching|search(?:ed)?|leads?|clients?|them|those|these|their|listed|retrieved|emails?|messages?|records?|rows?|data)\b/i.test(request);
  if (!referencesReadData) return [earlier[earlier.length - 1]!.index];
  const reads = earlier.filter((item) => item.kind === 'read').slice(-2);
  const lastAction = earlier.filter((item) => item.kind === 'action').slice(-1);
  return [...new Set([...reads, ...lastAction].map((item) => item.index))].sort((a, b) => a - b);
}
