/**
 * §36 — which failures are worth retrying.
 *
 * The section's two lists are really one rule: retry a failure that a later identical attempt
 * could plausibly survive, and never retry one that it could not. A rate limit clears. A
 * timeout may have been a slow moment. An invalid API key will still be invalid in four
 * seconds, and retrying it turns one clear error into four identical ones plus latency — and,
 * on a policy violation, into four attempts at something the platform already refused.
 *
 * ## Classification is by cause, not by status code alone
 *
 * A 400 is not retryable and a 429 is, but a 500 is genuinely ambiguous: it is usually
 * transient and occasionally a deterministic server-side rejection of this exact payload. §36
 * puts transient 5xx on the retry list, so that is the default here — with the bound doing the
 * work of limiting the damage when the guess is wrong.
 *
 * ## Jitter is not decoration
 *
 * Every caller retrying a 429 on the same schedule reconverges on the provider at the same
 * instant and reproduces the rate limit that caused the retry. Full jitter across the whole
 * window is what breaks that synchronisation.
 */

export type RetryDecision =
  | { readonly retry: true; readonly reason: string; readonly delayMs: number }
  | { readonly retry: false; readonly reason: string };

export interface RetryableErrorShape {
  readonly status?: number;
  readonly code?: string;
  readonly name?: string;
  readonly message?: string;
}

export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  /** Injected in tests so backoff is assertable rather than probabilistic. */
  readonly random?: () => number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 8_000,
};

/** Failures that a later identical attempt could plausibly survive. */
const TRANSIENT_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  'EAI_AGAIN',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]);

/** Failures that will fail identically no matter how many times they are repeated. */
const PERMANENT_MESSAGE_RE =
  /\b(invalid|incorrect|expired|revoked)\s+(?:api\s*)?key|unauthori[sz]ed|forbidden|model\s+not\s+found|unsupported\s+model|does\s+not\s+exist|content\s+policy|safety|policy\s+violation|invalid\s+request|malformed|validation\s+(?:error|failed)|context\s+length\s+exceeded|too\s+many\s+tokens/i;

function statusOf(error: RetryableErrorShape): number | null {
  return typeof error.status === 'number' ? error.status : null;
}

/**
 * Whether this failure should be retried, and after how long.
 *
 * Takes the attempt number so the caller need not track backoff state, and returns the reason
 * either way — a retry decision nobody can explain is one nobody can tune when a provider
 * starts behaving differently.
 */
export function decideRetry(
  error: RetryableErrorShape,
  attempt: number,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
): RetryDecision {
  if (attempt >= policy.maxAttempts) {
    return { retry: false, reason: `attempt ${attempt} of ${policy.maxAttempts}: budget exhausted` };
  }

  const status = statusOf(error);
  const message = error.message ?? '';
  const code = error.code ?? '';
  const name = error.name ?? '';

  // Permanent failures first. A 401 that also happens to mention "timeout" in its body must be
  // classified by the status, not by whichever pattern is checked first.
  if (status === 401 || status === 403) {
    return { retry: false, reason: 'authentication or authorization failure: identical on retry' };
  }
  if (status === 404) {
    return { retry: false, reason: 'unknown model or endpoint: identical on retry' };
  }
  if (status === 422 || status === 400) {
    return { retry: false, reason: 'malformed or rejected request: identical on retry' };
  }
  if (PERMANENT_MESSAGE_RE.test(message)) {
    return { retry: false, reason: 'the provider rejected the request itself, not its timing' };
  }

  const delayMs = backoffDelay(attempt, policy);

  if (status === 429) {
    return { retry: true, reason: 'rate limited', delayMs };
  }
  if (status !== null && status >= 500 && status < 600) {
    return { retry: true, reason: `transient provider error ${status}`, delayMs };
  }
  if (name === 'TimeoutError' || name === 'AbortError' || /timed?\s*out/i.test(message)) {
    // AbortError from a user cancellation must never reach here — the caller checks the signal
    // before consulting this policy, because a cancelled run must not be retried at all.
    return { retry: true, reason: 'timeout', delayMs };
  }
  if (TRANSIENT_CODES.has(code)) {
    return { retry: true, reason: `transient network failure (${code})`, delayMs };
  }

  // Unknown failures are not retried. The alternative — retrying anything unrecognised — is how
  // a policy violation gets attempted three times.
  return { retry: false, reason: 'unrecognised failure: not retried' };
}

/**
 * Bounded exponential backoff with full jitter.
 *
 * Full jitter rather than a fixed fraction: it is the variant that actually decorrelates
 * concurrent clients, which is the entire point when the failure being retried is a rate limit
 * caused by concurrency.
 */
export function backoffDelay(attempt: number, policy: RetryPolicy = DEFAULT_RETRY_POLICY): number {
  const exponential = Math.min(policy.baseDelayMs * 2 ** Math.max(0, attempt - 1), policy.maxDelayMs);
  const random = policy.random ?? Math.random;
  return Math.round(random() * exponential);
}
