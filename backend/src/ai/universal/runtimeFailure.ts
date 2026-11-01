export const RUNTIME_FAILURE_CODES = [
  'SAFETY_BLOCKED',
  'PLANNER_INVALID_OUTPUT',
  'PLANNER_SCHEMA_INVALID',
  'PLANNER_TIMEOUT',
  'PLANNER_PROVIDER_UNAVAILABLE',
  'CAPABILITY_UNSUPPORTED',
  'CAPABILITY_AUTH_REQUIRED',
  'CAPABILITY_TEMPORARILY_UNAVAILABLE',
  'PROVIDER_UNAVAILABLE',
  'TOOL_UNAVAILABLE',
  'PROJECT_CONTEXT_MISMATCH',
  'DEPENDENCY_FAILED',
  'COMPILE_FAILED',
  'TEST_FAILED',
  'RUNTIME_FAILED',
  'PREVIEW_FAILED',
  'REPOSITORY_FAILED',
  'DEPLOYMENT_FAILED',
  'NETWORK_FAILED',
  'CANCELLED',
] as const;

export type RuntimeFailureCode = (typeof RUNTIME_FAILURE_CODES)[number];

interface RuntimeFailureOptions {
  readonly status?: number;
  readonly retryable?: boolean;
  readonly cause?: unknown;
  readonly details?: Readonly<Record<string, unknown>>;
}

/**
 * A failure that can cross an API boundary without pretending an operational
 * problem was a safety decision. `message` is deliberately customer-safe;
 * provider payloads and stack traces stay in `cause`/server logs.
 */
export class RuntimeFailure extends Error {
  readonly code: RuntimeFailureCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(code: RuntimeFailureCode, message: string, options: RuntimeFailureOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'RuntimeFailure';
    this.code = code;
    this.status = options.status ?? defaultStatus(code);
    this.retryable = options.retryable ?? defaultRetryable(code);
    this.details = options.details;
  }
}

function defaultStatus(code: RuntimeFailureCode): number {
  if (code === 'SAFETY_BLOCKED' || code === 'CAPABILITY_UNSUPPORTED') return 422;
  if (code === 'CAPABILITY_AUTH_REQUIRED') return 403;
  if (code === 'PROJECT_CONTEXT_MISMATCH') return 409;
  if (code === 'CANCELLED') return 499;
  if (code === 'PLANNER_INVALID_OUTPUT' || code === 'PLANNER_SCHEMA_INVALID') return 502;
  return 503;
}

function defaultRetryable(code: RuntimeFailureCode): boolean {
  return [
    'PLANNER_INVALID_OUTPUT',
    'PLANNER_SCHEMA_INVALID',
    'PLANNER_TIMEOUT',
    'PLANNER_PROVIDER_UNAVAILABLE',
    'CAPABILITY_TEMPORARILY_UNAVAILABLE',
    'PROVIDER_UNAVAILABLE',
    'TOOL_UNAVAILABLE',
    'NETWORK_FAILED',
  ].includes(code);
}

export function isRuntimeFailure(error: unknown): error is RuntimeFailure {
  return error instanceof RuntimeFailure || (
    Boolean(error) &&
    typeof error === 'object' &&
    RUNTIME_FAILURE_CODES.includes((error as { code?: RuntimeFailureCode }).code as RuntimeFailureCode)
  );
}

export function publicRuntimeFailure(error: unknown): {
  status: number;
  body: { error: string; code: RuntimeFailureCode | 'RUNTIME_FAILED'; retryable: boolean };
} {
  // An empty upstream completion is a provider failure, not an internal bug or
  // a policy refusal. Keep the raw payload private and require a deliberate retry.
  // This mapping must not release the existing uncertain-spend reservation.
  if (error && typeof error === 'object' &&
      (error as { code?: unknown }).code === 'EMPTY_PROVIDER_RESPONSE') {
    return {
      status: 502,
      body: {
        error: "The model provider returned no answer. Your request wasn't completed.",
        code: 'PROVIDER_UNAVAILABLE',
        retryable: false,
      },
    };
  }
  if (isRuntimeFailure(error)) {
    return {
      status: error.status,
      body: { error: error.message, code: error.code, retryable: error.retryable },
    };
  }
  return {
    status: 500,
    body: {
      error: 'Xroga could not complete this request because of an internal runtime error.',
      code: 'RUNTIME_FAILED',
      retryable: false,
    },
  };
}
