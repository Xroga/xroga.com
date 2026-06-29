import { withRetry, type RetryOptions } from './retry.js';
import { circuitBreaker } from './circuitBreaker.js';
import { logSystemError } from '../../services/systemErrorLog.js';

export interface FallbackCallContext {
  userId?: string;
  sessionId?: string;
  runId?: string;
  apiType: string;
  provider: string;
}

export async function callWithFallback<T>(
  providers: Array<{
    name: string;
    call: () => Promise<T>;
    isValid?: (result: T) => boolean;
  }>,
  finalFallback: () => T | Promise<T>,
  ctx: Omit<FallbackCallContext, 'provider'>,
  retryOpts?: RetryOptions
): Promise<{ result: T; provider: string; usedFallback: boolean }> {
  for (const provider of providers) {
    try {
      const result = await circuitBreaker(
        `${ctx.apiType}:${provider.name}`,
        () => withRetry(provider.call, { ...retryOpts, label: provider.name }),
        async () => {
          throw new Error('circuit open');
        }
      );
      if (provider.isValid && !provider.isValid(result)) continue;
      return { result, provider: provider.name, usedFallback: false };
    } catch (err) {
      await logSystemError({
        api: provider.name,
        errorMessage: (err as Error).message,
        fallbackUsed: 'trying next provider',
        severity: 'warning',
        userId: ctx.userId,
        sessionId: ctx.sessionId,
        runId: ctx.runId,
        metadata: { apiType: ctx.apiType },
      });
    }
  }

  const result = await finalFallback();
  await logSystemError({
    api: ctx.apiType,
    errorMessage: 'All providers exhausted',
    fallbackUsed: 'heuristic/cache fallback',
    severity: 'error',
    userId: ctx.userId,
    sessionId: ctx.sessionId,
    runId: ctx.runId,
  });
  return { result, provider: 'fallback', usedFallback: true };
}
