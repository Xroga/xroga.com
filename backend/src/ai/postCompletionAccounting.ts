import { randomUUID } from 'node:crypto';
import { getUsage, poolRoleFor, type UsageSnapshot } from './quota.js';
import { costUsdForTokens, type ModelId } from './models.js';
import { persistUsageAccounting } from './usageAccounting.js';
import { createTenantContext } from '../security/tenantContext.js';

/** Provider completion and accounting failure are different outcomes. This
 * error must never be interpreted as permission to retry provider execution. */
export class PostCompletionAccountingError extends Error {
  readonly code = 'POST_COMPLETION_ACCOUNTING_UNCERTAIN';
  readonly statusCode = 503;
  readonly providerCompleted = true;
  readonly accountingUncertain = true;
  readonly retryable = false;
  constructor() { super('The provider completed, but usage accounting could not be verified. No further action was authorized.'); }
}

export function isPostCompletionAccountingError(error: unknown): error is PostCompletionAccountingError {
  return error instanceof PostCompletionAccountingError;
}

/** Call only after provider completion. Each completed attempt, including a
 * malformed model result, has one receipt. Never replay the provider on failure.
 * Cross-request provider deduplication still requires upstream operation identity. */
export async function recordCompletedProviderUsage(userId: string, modelId: ModelId, inputTokens: number, outputTokens: number): Promise<UsageSnapshot> {
  try {
    await persistUsageAccounting(createTenantContext({ userId, via: 'persisted_owner' }), {
      receiptId: randomUUID(), modelId, poolRole: poolRoleFor(modelId), inputTokens, outputTokens,
      costUsd: costUsdForTokens(modelId, inputTokens, outputTokens),
    });
    return await getUsage(userId);
  }
  catch { throw new PostCompletionAccountingError(); }
}
