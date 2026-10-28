/**
 * Split only explicit, independent connected-app requests. The original clause
 * is passed to tool discovery; provider data is never promoted into action
 * instructions. Ambiguous language remains on the normal single-task path.
 */
export interface BusinessWorkflowStep {
  kind: 'read' | 'action' | 'web';
  request: string;
  dependsOnPrevious: boolean;
}

export const MAX_BUSINESS_WORKFLOW_STEPS = 6;

const READ_VERBS = /^(?:please\s+)?(?:find|search|list|show|check|look up|lookup|fetch|retrieve|read|summarize|inspect|review|get)\b/i;
const ACTION_VERBS = /^(?:please\s+)?(?:send|email|message|create|draft|schedule|book|update|edit|delete|remove|cancel|publish|post|upload|invite|add|put|save|move|copy|attach|submit|set|archive|reply|refund|transfer|pay|share)\b/i;
const NEXT_TASK = /(?:please\s+)?(?:find|search|list|show|check|look up|lookup|fetch|retrieve|read|summarize|inspect|review|get|send|email|message|create|draft|schedule|book|update|edit|delete|remove|cancel|publish|post|upload|invite|add|put|save|move|copy|attach|submit|set|archive|reply|refund|transfer|pay|share)\b/i;
const DEPENDENT_REFERENCE = /\b(?:them|those|these|it|its|that|their|each|every|all|found|matching|(?:qualified|selected|chosen)\s+ones|top\s+\d+|first\s+\d+|(?:the|those|these|a)\s+(?:results?|summary|options|findings|report|information|data|details|spreadsheet|sheet|document|file|link|task|event|draft|record)|the (?:people|clients|leads|items|records|files|events|messages) (?:you|we) (?:found|created|listed)|from (?:that|the previous) (?:step|search)|(?:based on|using|from)\s+(?:the|those|this|that))\b/i;
const WEB_REQUEST = /^(?:please\s+)?(?:search|research|look up|find|check)\s+(?:the\s+)?(?:web|internet|online)\b/i;
const NEGATED_ACTION = /^(?:please\s+)?(?:do\s+not|don't|never|avoid)\b/i;
const NEGATED_PREFIX = /\b(?:do\s+not|don't|never|avoid|without)\s+$/i;
const UNACCOUNTED_TASK = /(?:^|[.;]\s*|,\s*(?:and\s+)?|\b(?:and|then|also)\s+)(?:please\s+)?(?:find|search|list|show|check|read|send|email|message|create|draft|schedule|book|update|edit|delete|remove|cancel|publish|post|upload|add|put|save|share)\b/i;

/** Model-proposed steps are only accepted when each is an exact, ordered user-authored clause. */
export function validateSourceBoundBusinessWorkflow(
  message: string,
  proposed: unknown,
  allowedKinds: ReadonlySet<BusinessWorkflowStep['kind']>,
): BusinessWorkflowStep[] | null {
  if (!Array.isArray(proposed) || proposed.length < 2 || proposed.length > MAX_BUSINESS_WORKFLOW_STEPS || message.length > 1_500) return null;
  const steps: BusinessWorkflowStep[] = [];
  let offset = 0;
  for (const candidate of proposed) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
    const value = candidate as Record<string, unknown>;
    if (typeof value.request !== 'string' || typeof value.kind !== 'string') return null;
    const request = value.request.trim();
    if (request.length < 5 || request.length > 500 || !allowedKinds.has(value.kind as BusinessWorkflowStep['kind'])) return null;
    const index = message.indexOf(request, offset);
    if (index < 0 || NEGATED_ACTION.test(request) || NEGATED_PREFIX.test(message.slice(Math.max(0, index - 20), index))) return null;
    const kind = value.kind;
    if (kind === 'action' && !ACTION_VERBS.test(request)) return null;
    if (kind === 'read' && (!READ_VERBS.test(request) || WEB_REQUEST.test(request))) return null;
    if (kind === 'web' && !WEB_REQUEST.test(request)) return null;
    const between = message.slice(offset, index);
    if ((steps.length && between.length > 80) || UNACCOUNTED_TASK.test(between)) return null;
    steps.push({ kind: kind as BusinessWorkflowStep['kind'], request, dependsOnPrevious: steps.length > 0 && DEPENDENT_REFERENCE.test(request) });
    offset = index + request.length;
  }
  // Reject a partial plan that leaves another clearly separated task unaccounted for.
  const remainder = message.slice(offset);
  if (UNACCOUNTED_TASK.test(remainder)) return null;
  return steps;
}

export function splitExplicitBusinessWorkflow(message: string): BusinessWorkflowStep[] | null {
  const text = message.trim();
  if (text.length < 8 || text.length > 1_500 || /\b(?:web|internet)\s+(?:search|research)|\bsearch\s+(?:the\s+)?(?:web|internet)\b/i.test(text)) {
    return null;
  }

  const separator = new RegExp(`\\s*(?:[;\\n]+|,\\s*(?:and\\s+)?)\\s*(?=${NEXT_TASK.source})|\\s+(?:and then|then|and|also)\\s+(?=${NEXT_TASK.source})`, 'gi');
  const clauses = text.split(separator).map((item) => item.trim().replace(/^[,.;\s]+|[,.;\s]+$/g, ''));
  if (clauses.length < 2 || clauses.length > MAX_BUSINESS_WORKFLOW_STEPS || clauses.some((item) => item.length < 5 || item.length > 500)) return null;

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
