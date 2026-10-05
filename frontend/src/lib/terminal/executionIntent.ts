export type PendingExecutionIntent =
  | 'chat'
  | 'research'
  | 'analysis'
  | 'document'
  | 'code'
  | 'business';

const GREETING_ONLY =
  /^(?:(?:hi|hello|hey|yo|sup|salam|salaam|assalam(?:u|o)?\s*alaikum|good\s+(?:morning|afternoon|evening))\b[\s!.?]*){1,3}$/i;

const RESEARCH =
  /\b(?:search(?: the)? web|web search|browse|research|look up|find sources?|current|latest|today|news|citations?|sources?|compare sources?|verify online|check online)\b/i;

const DOCUMENT =
  /\b(?:pdf|docx?|document|attachment|uploaded file|spreadsheet|xlsx?|csv|slides?|pptx?|contract|resume|cv|read (?:the )?file|analy[sz]e (?:the )?(?:file|document)|summari[sz]e (?:the )?(?:file|document))\b/i;

const BUSINESS =
  /\b(?:gmail|email|slack|notion|hubspot|salesforce|calendar|google drive|drive|crm|linear|jira|asana|trello|shopify|stripe|send (?:an )?email|schedule|connected app|business app)\b/i;

const ANALYSIS =
  /\b(?:reason|solve|problem|calculate|evaluate|diagnose|debug|compare|decide|strategy|plan|analy[sz]e|explain why|figure out|investigate)\b/i;

export function isQuickConversationPrompt(prompt: string): boolean {
  const value = prompt.trim();
  if (!value) return true;
  if (value.length <= 48 && GREETING_ONLY.test(value)) return true;
  return false;
}

/**
 * This classifier changes only transient presentation before the first real event.
 * It never records an execution step and never claims that a tool has run.
 */
export function pendingExecutionIntent(input: {
  prompt: string;
  codeBuildActive?: boolean;
  researchActive?: boolean;
}): PendingExecutionIntent {
  const prompt = input.prompt.trim();

  if (input.codeBuildActive) return 'code';
  if (input.researchActive || RESEARCH.test(prompt)) return 'research';
  if (DOCUMENT.test(prompt)) return 'document';
  if (BUSINESS.test(prompt)) return 'business';
  if (ANALYSIS.test(prompt)) return 'analysis';
  return 'chat';
}

export function pendingExecutionLabel(intent: PendingExecutionIntent): string {
  switch (intent) {
    case 'research':
      return 'Preparing research';
    case 'document':
      return 'Preparing document analysis';
    case 'code':
      return 'Preparing workspace';
    case 'business':
      return 'Preparing connected app';
    case 'analysis':
      return 'Working through the problem';
    default:
      return 'Responding';
  }
}
