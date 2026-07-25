import type { CapabilityId } from './capabilityRegistry.js';

export type TaskIntent =
  | 'build'
  | 'change'
  | 'remove'
  | 'repair'
  | 'analyze'
  | 'research'
  | 'connect'
  | 'automate'
  | 'generate'
  | 'convert'
  | 'deploy'
  | 'review'
  | 'explain'
  | 'optimize'
  | 'test'
  | 'search'
  | 'chat';

export interface TaskClassification {
  primaryIntent: TaskIntent;
  intents: TaskIntent[];
  requiredCapabilities: CapabilityId[];
  requiresCoding: boolean;
  requiresResearch: boolean;
  requiresExternalApi: boolean;
  requiresUserAuthorization: boolean;
  canRunConcurrently: boolean;
  reasoning: string[];
}

const INTENT_PATTERNS: Array<[TaskIntent, RegExp]> = [
  ['remove', /\b(remove|delete|drop|uninstall|disconnect)\b/i],
  ['repair', /\b(fix|repair|debug|resolve|broken|error|failing)\b/i],
  ['change', /\b(change|update|edit|modify|patch|refactor|migrate)\b/i],
  ['build', /\b(build|create|make|develop|implement|scaffold|code|spin\s*up)\b/i],
  ['research', /\b(research|investigate|latest|current|news|sources?|citations?)\b/i],
  ['search', /\b(search|find|look\s*up|discover)\b/i],
  ['analyze', /\b(analy[sz]e|inspect|audit|assess|summarize|compare)\b/i],
  ['review', /\b(review|code\s*review|security\s*review|critique)\b/i],
  ['connect', /\b(connect|integrate|authorize|oauth|api\s+integration)\b/i],
  ['automate', /\b(automate|workflow|cron|schedule|agent|background\s+job)\b/i],
  ['deploy', /\b(deploy|publish|ship|release|go\s+live)\b/i],
  ['test', /\b(test|verify|validate|lint|typecheck|smoke)\b/i],
  ['optimize', /\b(optimi[sz]e|performance|speed\s*up|reduce\s*cost)\b/i],
  ['convert', /\b(convert|transform|export|import)\b/i],
  ['generate', /\b(generate|write|produce|render)\b/i],
  ['explain', /\b(explain|teach|how\s+does|what\s+is|why\s+does)\b/i],
];

const CODE_INTENTS = new Set<TaskIntent>([
  'build',
  'change',
  'remove',
  'repair',
  'connect',
  'automate',
  'deploy',
  'optimize',
  'test',
]);

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function classifyTaskRequest(
  message: string,
  context = '',
): TaskClassification {
  const fullInput = `${message}\n${context}`.trim();
  const intents = INTENT_PATTERNS.filter(([, pattern]) => pattern.test(fullInput)).map(
    ([intent]) => intent,
  );
  if (!intents.length) intents.push('chat');

  const capabilities: CapabilityId[] = [];
  const reasoning: string[] = [];
  const requiresCoding = intents.some((intent) => CODE_INTENTS.has(intent));
  const requiresResearch =
    intents.includes('research') ||
    intents.includes('search') ||
    /\b(today|real[- ]?time|x\.com|twitter|current)\b/i.test(fullInput);

  if (requiresCoding) {
    capabilities.push('software_engineering', 'repository_operations');
    reasoning.push('The requested operation changes or validates a software workflow.');
  }
  if (intents.includes('test') || requiresCoding) capabilities.push('testing');
  if (/\b(security|secret|credential|vulnerab|auth)\b/i.test(fullInput)) {
    capabilities.push('security_review');
  }
  if (requiresResearch) {
    capabilities.push('web_research');
    reasoning.push('The request needs current or externally retrieved information.');
  }
  if (/\b(x\.com|twitter)\b/i.test(fullInput)) capabilities.push('x_research');
  if (/\b(file|pdf|document|upload|attachment|image)\b/i.test(fullInput)) {
    capabilities.push('file_processing');
  }
  if (/\b(csv|spreadsheet|dataset|json|data|transform|export)\b/i.test(fullInput)) {
    capabilities.push('data_processing');
  }
  if (/\b(image|photo|illustration|upscale)\b/i.test(fullInput) && intents.includes('generate')) {
    capabilities.push('image_generation');
  }
  if (intents.includes('generate') || intents.includes('explain') || intents.includes('chat')) {
    capabilities.push('text_generation');
  }
  if (/\b(api|webhook|integration)\b/i.test(fullInput)) capabilities.push('api_integration');
  if (/\b(auth|oauth|login|sign[- ]?in)\b/i.test(fullInput)) {
    capabilities.push('authentication_integration');
  }
  if (/\b(database|postgres|supabase|sql|storage)\b/i.test(fullInput)) {
    capabilities.push('database_integration');
  }
  if (/\b(payment|checkout|subscription|stripe|lemon\s*squeezy)\b/i.test(fullInput)) {
    capabilities.push('payment_integration');
  }
  if (/\b(email|mail|resend)\b/i.test(fullInput)) capabilities.push('email_integration');
  if (/\b(blockchain|wallet|smart\s*contract|transaction|web3)\b/i.test(fullInput)) {
    capabilities.push('blockchain_integration');
  }
  if (/\b(github|repository|repo|pull\s*request|commit|push)\b/i.test(fullInput)) {
    capabilities.push('github_operations');
  }
  if (intents.includes('deploy')) {
    capabilities.push('deployment');
    if (/\b(vercel)\b/i.test(fullInput)) capabilities.push('vercel_operations');
  }
  if (/\b(browser|playwright|click|navigate|screenshot)\b/i.test(fullInput)) {
    capabilities.push('browser_automation');
  }

  if (!capabilities.length) capabilities.push('text_generation');

  const requiredCapabilities = unique(capabilities);
  const requiresUserAuthorization = requiredCapabilities.some((capability) =>
    ['github_operations', 'vercel_operations', 'deployment', 'blockchain_integration'].includes(
      capability,
    ),
  );
  const requiresExternalApi = requiredCapabilities.some((capability) =>
    [
      'web_research',
      'x_research',
      'image_generation',
      'api_integration',
      'database_integration',
      'payment_integration',
      'email_integration',
      'deployment',
      'github_operations',
      'vercel_operations',
      'blockchain_integration',
      'browser_automation',
    ].includes(capability),
  );

  return {
    primaryIntent: intents[0],
    intents: unique(intents),
    requiredCapabilities,
    requiresCoding,
    requiresResearch,
    requiresExternalApi,
    requiresUserAuthorization,
    canRunConcurrently: requiredCapabilities.length > 1 && !intents.includes('remove'),
    reasoning,
  };
}

