export type FailureCategory =
  | 'syntax'
  | 'type'
  | 'dependency'
  | 'environment'
  | 'integration'
  | 'runtime'
  | 'deployment'
  | 'structural'
  | 'unknown';

export interface RecoveryPlan {
  category: FailureCategory;
  attempt: number;
  maxAttempts: number;
  canRetry: boolean;
  preserveLastValidState: true;
  targetFiles: string[];
  actions: string[];
  blocker?: string;
}

const CATEGORY_PATTERNS: Array<[FailureCategory, RegExp]> = [
  ['syntax', /\b(?:syntaxerror|unexpected token|parse error)\b/i],
  ['type', /\b(?:typeerror|error TS\d+|type '.+' is not assignable)\b/i],
  ['dependency', /\b(?:module not found|cannot find module|npm ERR|dependency|peer dep)\b/i],
  ['environment', /\b(?:missing env|environment variable|credential|api key|unauthorized|forbidden)\b/i],
  ['integration', /\b(?:oauth|webhook|provider|integration|invalid callback)\b/i],
  ['deployment', /\b(?:deployment|build failed|vercel|netlify|fly\.io)\b/i],
  ['runtime', /\b(?:runtime|exception|timeout|ECONNREFUSED|5\d\d)\b/i],
  ['structural', /\b(?:missing file|route not found|invalid project|entrypoint)\b/i],
];

export function classifyFailure(error: string): FailureCategory {
  return CATEGORY_PATTERNS.find(([, pattern]) => pattern.test(error))?.[0] ?? 'unknown';
}

function extractFiles(error: string): string[] {
  return [
    ...new Set(
      [...error.matchAll(/(?:^|[\s"'(])([A-Za-z0-9_./-]+\.(?:ts|tsx|js|jsx|json|sql|css|html))(?::\d+)?/g)]
        .map((match) => match[1])
        .filter((path) => !path.includes('node_modules')),
    ),
  ].slice(0, 12);
}

export function planRecovery(
  error: string,
  attempt = 1,
  maxAttempts = 3,
): RecoveryPlan {
  const category = classifyFailure(error);
  const targetFiles = extractFiles(error);
  const actionsByCategory: Record<FailureCategory, string[]> = {
    syntax: ['Inspect the exact parser location', 'Patch only the malformed construct', 'Rerun syntax and build checks'],
    type: ['Read the complete type diagnostic', 'Patch the referenced types or call site', 'Rerun typecheck'],
    dependency: ['Inspect package manifest and lockfile', 'Correct the missing or incompatible dependency', 'Reinstall safely and rebuild'],
    environment: ['Identify the exact missing credential or variable', 'Do not fabricate a value', 'Retry only after configuration is verified'],
    integration: ['Capture the real provider response', 'Validate configuration and authenticated API access', 'Confirm the app consumes the response before marking connected'],
    runtime: ['Reproduce the failing request', 'Patch the smallest responsible path', 'Rerun the request and regression checks'],
    deployment: ['Preserve the last valid commit and deployment', 'Inspect provider build/runtime logs', 'Apply a targeted fix and redeploy only after local validation'],
    structural: ['Inspect project tree and entrypoints', 'Restore the missing structural dependency', 'Run repository-wide validation'],
    unknown: ['Capture fuller error output', 'Inspect the narrowest affected subsystem', 'Stop rather than guessing if no cause is established'],
  };
  const canRetry = attempt <= maxAttempts && category !== 'environment';
  return {
    category,
    attempt,
    maxAttempts,
    canRetry,
    preserveLastValidState: true,
    targetFiles,
    actions: actionsByCategory[category],
    blocker:
      category === 'environment'
        ? 'A required credential or environment value is missing; user or administrator configuration is required.'
        : attempt > maxAttempts
          ? `Recovery stopped after ${maxAttempts} bounded attempts.`
          : undefined,
  };
}
