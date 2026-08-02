/**
 * Bounded builder attempts.
 *
 * The production blocker this exists for: a builder provider could accept the
 * connection and then never stream a token. Nothing in the stack bounded that.
 * The OpenAI client's 180s socket timeout was the only limit, it only fires on a
 * dead socket rather than on a live-but-silent one, and with several models in the
 * fallback order plus repair attempts a single run could stay `running` for many
 * minutes and still deliver nothing.
 *
 * Three deadlines now bound every attempt:
 *
 *   first-token   the provider has accepted the request but produced nothing
 *   generation    the provider is streaming but will not stop
 *   output size   the provider is streaming but has run away
 *
 * Each one aborts that attempt only. The controller classifies why, and the caller
 * decides whether the classification is worth another provider. Failures are typed
 * rather than string-matched so the fallback policy is a table, not a pile of
 * `includes()` checks that silently stop matching when a vendor reworks its error
 * copy.
 */

export type BuilderAttemptFailure =
  | 'provider_unconfigured'
  | 'provider_authentication'
  | 'provider_rate_limit'
  | 'provider_unavailable'
  | 'connection_timeout'
  | 'first_token_timeout'
  | 'generation_timeout'
  | 'empty_response'
  | 'prose_only_response'
  | 'credential_refusal'
  | 'invalid_structured_output'
  | 'truncated_output'
  | 'no_executable_artifacts'
  | 'unsafe_artifact_path'
  | 'output_limit_exceeded'
  | 'cancelled'
  | 'unknown';

/** Attempt bounds. Values are deliberately generous — this is a backstop, not a SLA. */
export interface BuilderAttemptBudget {
  /** No token at all within this window means the provider is not going to answer. */
  firstTokenMs: number;
  /** Total wall-clock for one attempt, first token or not. */
  generationMs: number;
  /** Hard cap on streamed characters, so a looping model cannot exhaust memory. */
  maxOutputChars: number;
}

export const DEFAULT_BUILDER_BUDGET: BuilderAttemptBudget = {
  // Large builder prompts genuinely take a while to first token on a cold route;
  // 60s is well past normal and still far short of the old unbounded behaviour.
  firstTokenMs: 60_000,
  generationMs: 300_000,
  maxOutputChars: 1_500_000,
};

/**
 * Failures worth trying another provider for.
 *
 * A permanent authentication problem is not: retrying it burns the whole fallback
 * order against a key that will keep being wrong. Cancellation is not either —
 * the user asked to stop, and moving to the next model would ignore that.
 */
const RETRYABLE: ReadonlySet<BuilderAttemptFailure> = new Set([
  'provider_unconfigured',
  'provider_rate_limit',
  'provider_unavailable',
  'connection_timeout',
  'first_token_timeout',
  'generation_timeout',
  'empty_response',
  'prose_only_response',
  'credential_refusal',
  'invalid_structured_output',
  'truncated_output',
  'no_executable_artifacts',
  'output_limit_exceeded',
  'unknown',
]);

export function isRetryableBuilderFailure(failure: BuilderAttemptFailure): boolean {
  return RETRYABLE.has(failure);
}

/** Human-readable, vendor-neutral. Used in the truthful terminal failure summary. */
export const BUILDER_FAILURE_LABEL: Record<BuilderAttemptFailure, string> = {
  provider_unconfigured: 'not configured',
  provider_authentication: 'authentication failed',
  provider_rate_limit: 'rate limited',
  provider_unavailable: 'unavailable',
  connection_timeout: 'connection timed out',
  first_token_timeout: 'no response before the deadline',
  generation_timeout: 'generation timed out',
  empty_response: 'empty completion',
  prose_only_response: 'prose without project files',
  credential_refusal: 'refused, citing credentials it does not need',
  invalid_structured_output: 'invalid artifact output',
  truncated_output: 'truncated output',
  no_executable_artifacts: 'no executable files',
  unsafe_artifact_path: 'unsafe file path',
  output_limit_exceeded: 'output limit exceeded',
  cancelled: 'cancelled',
  unknown: 'failed',
};

type ErrorLike = { code?: unknown; status?: unknown; message?: unknown; name?: unknown };

/**
 * Classify a thrown builder error.
 *
 * Codes set by our own guards are checked before any message text, so a rename of
 * a vendor's error string cannot silently reclassify our own failures.
 */
export function classifyBuilderFailure(error: unknown): BuilderAttemptFailure {
  const err = (error ?? {}) as ErrorLike;
  const code = typeof err.code === 'string' ? err.code : '';
  const status = typeof err.status === 'number' ? err.status : undefined;
  const message = typeof err.message === 'string' ? err.message : '';
  const lower = message.toLowerCase();

  // ---- our own typed codes first
  switch (code) {
    case 'BUILDER_FIRST_TOKEN_TIMEOUT':
      return 'first_token_timeout';
    case 'BUILDER_GENERATION_TIMEOUT':
      return 'generation_timeout';
    case 'BUILDER_OUTPUT_LIMIT':
      return 'output_limit_exceeded';
    case 'BUILD_CANCELLED':
      return 'cancelled';
    case 'INVALID_BUILD_OUTPUT':
      return 'prose_only_response';
    case 'EMPTY_MODEL_RESPONSE':
      return 'empty_response';
    case 'UNSAFE_ARTIFACT_PATH':
      return 'unsafe_artifact_path';
    default:
      break;
  }

  if (err.name === 'AbortError' || code === 'ABORT_ERR') return 'cancelled';

  // ---- HTTP status, which vendors are consistent about even when copy changes
  if (status === 401 || status === 403) return 'provider_authentication';
  if (status === 429) return 'provider_rate_limit';
  if (status === 408 || status === 504) return 'connection_timeout';
  if (typeof status === 'number' && status >= 500) return 'provider_unavailable';

  // ---- last resort: message text
  if (lower.includes('is not configured')) return 'provider_unconfigured';
  if (lower.includes('timeout') || lower.includes('timed out')) return 'connection_timeout';
  if (lower.includes('rate limit')) return 'provider_rate_limit';
  if (lower.includes('econnrefused') || lower.includes('enotfound') || lower.includes('socket hang up')) {
    return 'provider_unavailable';
  }
  return 'unknown';
}

function timeoutError(code: string, message: string): Error & { code: string } {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}

export interface BuilderAttemptRecord {
  readonly model: string;
  readonly failure: BuilderAttemptFailure;
  readonly startedAt: number;
  readonly firstTokenAt: number | null;
  readonly endedAt: number;
  readonly outputChars: number;
}

/**
 * Runs one builder attempt under the budget.
 *
 * `run` is handed an `AbortSignal` it must pass to the provider call, and an
 * `onToken` it must call for each streamed chunk. The first call to `onToken`
 * cancels the first-token deadline; the generation deadline keeps running, because
 * a provider that starts and never stops is the other half of the same problem.
 *
 * Both timers are cleared in `finally`, so a fast attempt does not leave a handle
 * holding the process open.
 */
export async function runBuilderAttempt<T>(
  run: (ctx: { signal: AbortSignal; onToken: (chunk: string) => void }) => Promise<T>,
  opts: {
    budget?: Partial<BuilderAttemptBudget>;
    /** The caller's signal — cancellation must propagate through, not be swallowed. */
    signal?: AbortSignal;
  } = {},
): Promise<{ value: T; outputChars: number; firstTokenMs: number | null }> {
  const budget = { ...DEFAULT_BUILDER_BUDGET, ...opts.budget };
  const controller = new AbortController();
  const startedAt = Date.now();

  let firstTokenAt: number | null = null;
  let outputChars = 0;
  let failure: (Error & { code: string }) | null = null;

  const abortWith = (error: Error & { code: string }) => {
    if (failure) return;
    failure = error;
    controller.abort();
  };

  const onUpstreamAbort = () => {
    if (failure) return;
    failure = timeoutError('BUILD_CANCELLED', 'Build cancelled');
    controller.abort();
  };
  if (opts.signal) {
    if (opts.signal.aborted) onUpstreamAbort();
    else opts.signal.addEventListener('abort', onUpstreamAbort, { once: true });
  }

  const firstTokenTimer = setTimeout(() => {
    abortWith(
      timeoutError(
        'BUILDER_FIRST_TOKEN_TIMEOUT',
        `Provider produced no output within ${Math.round(budget.firstTokenMs / 1000)}s`,
      ),
    );
  }, budget.firstTokenMs);

  const generationTimer = setTimeout(() => {
    abortWith(
      timeoutError(
        'BUILDER_GENERATION_TIMEOUT',
        `Provider did not finish within ${Math.round(budget.generationMs / 1000)}s`,
      ),
    );
  }, budget.generationMs);

  const onToken = (chunk: string) => {
    if (firstTokenAt === null) {
      firstTokenAt = Date.now();
      clearTimeout(firstTokenTimer);
    }
    outputChars += chunk.length;
    if (outputChars > budget.maxOutputChars) {
      abortWith(
        timeoutError('BUILDER_OUTPUT_LIMIT', `Provider exceeded ${budget.maxOutputChars} characters`),
      );
    }
  };

  try {
    const value = await run({ signal: controller.signal, onToken });
    // A deadline that fired while the provider was mid-flush must still win — the
    // attempt is over budget even if a result arrived a moment later.
    if (failure) throw failure;
    return {
      value,
      outputChars,
      firstTokenMs: firstTokenAt === null ? null : firstTokenAt - startedAt,
    };
  } catch (error) {
    // Our own deadline is the real cause; the provider's own abort error is the
    // symptom, and reporting the symptom would classify a timeout as "cancelled".
    if (failure) throw failure;
    throw error;
  } finally {
    clearTimeout(firstTokenTimer);
    clearTimeout(generationTimer);
    opts.signal?.removeEventListener('abort', onUpstreamAbort);
  }
}

/**
 * The user-facing summary when every route failed.
 *
 * States what was tried and what did not happen, with no vendor error text and no
 * suggestion that anything was written or deployed.
 */
export function describeBuilderExhaustion(attempts: readonly BuilderAttemptRecord[]): string {
  const lines = attempts.map(
    (attempt) => `• ${attempt.model} — ${BUILDER_FAILURE_LABEL[attempt.failure]}`,
  );
  return [
    'Build generation failed',
    '',
    'Attempted:',
    ...lines,
    '',
    'No files were written.',
    'No GitHub repository was modified.',
    'No deployment was created.',
  ].join('\n');
}
