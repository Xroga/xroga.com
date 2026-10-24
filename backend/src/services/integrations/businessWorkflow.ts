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
  if (clauses.length < 2 || clauses.length > 4 || clauses.some((item) => item.length < 5 || item.length > 500)) return null;

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
  return steps.some((step) => step.kind === 'action') ? steps : null;
}
