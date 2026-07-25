export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  timeoutMs?: number;
  label?: string;
  shouldRetry?: (error: unknown) => boolean;
  signal?: AbortSignal;
}

const DEFAULTS = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 8000,
  timeoutMs: 15000,
  label: 'api',
} satisfies Omit<Required<RetryOptions>, 'shouldRetry' | 'signal'>;

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason ?? new DOMException('Cancelled', 'AbortError'));
    }, { once: true });
  });
}

export async function withRetry<T>(
  fn: (signal?: AbortSignal) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULTS, ...options };
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      if (opts.signal?.aborted) throw opts.signal.reason ?? new DOMException('Cancelled', 'AbortError');
      const controller = new AbortController();
      const parentAbort = () => controller.abort(opts.signal?.reason);
      opts.signal?.addEventListener('abort', parentAbort, { once: true });
      const timer = setTimeout(
        () => controller.abort(new Error(`${opts.label} timeout after ${opts.timeoutMs}ms`)),
        opts.timeoutMs,
      );
      const aborted = new Promise<never>((_, reject) => {
        controller.signal.addEventListener(
          'abort',
          () => reject(controller.signal.reason ?? new DOMException('Cancelled', 'AbortError')),
          { once: true },
        );
      });
      const result = await Promise.race([fn(controller.signal), aborted]).finally(() => {
          clearTimeout(timer);
          opts.signal?.removeEventListener('abort', parentAbort);
        });
      return result;
    } catch (err) {
      lastError = err as Error;
      if (attempt === opts.maxRetries || opts.shouldRetry?.(err) === false) break;
      const exponential = Math.min(opts.baseDelayMs * 2 ** attempt, opts.maxDelayMs);
      const jitter = Math.floor(Math.random() * Math.max(1, exponential * 0.25));
      await sleep(exponential + jitter, opts.signal);
    }
  }

  throw lastError ?? new Error(`${opts.label} failed after retries`);
}
