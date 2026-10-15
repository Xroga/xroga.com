import { getTenantSupabaseAdmin } from '../security/serviceRoleGuard.js';
import type { TenantContext } from '../security/tenantContext.js';

/** Prepared primitive, deliberately not wired into post-provider consumers. */
export interface UsageAccountingInput {
  receiptId: string;
  modelId: string;
  poolRole: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}
export interface UsageAccountingReceipt extends UsageAccountingInput {
  ledgerId: string;
  userId: string;
  period: string;
  replayed: boolean;
  usage: Record<string, unknown>;
}
function unavailable(): Error {
  return Object.assign(new Error('Usage accounting receipt could not be verified.'), {
    code: 'USAGE_ACCOUNTING_UNCERTAIN', statusCode: 503,
  });
}

/** Retrying this operation requires the same receiptId and identical evidence.
 * Never retry provider execution because this operation has an uncertain result. */
export async function persistUsageAccounting(context: TenantContext, input: UsageAccountingInput): Promise<UsageAccountingReceipt> {
  const db = getTenantSupabaseAdmin(context);
  const expected = { ...input };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(expected.receiptId)
    || !/^[a-z0-9_]{1,80}$/.test(expected.modelId) || !/^[a-z0-9_]{1,80}$/.test(expected.poolRole)
    || !Number.isSafeInteger(expected.inputTokens) || expected.inputTokens < 0
    || !Number.isSafeInteger(expected.outputTokens) || expected.outputTokens < 0
    || !Number.isSafeInteger(expected.inputTokens + expected.outputTokens)
    || !Number.isFinite(expected.costUsd) || expected.costUsd < 0 || expected.costUsd > 99999999.999999) throw unavailable();
  // Persist one canonical numeric scale, exactly the same value on every retry.
  expected.costUsd = Number(expected.costUsd.toFixed(6));
  expected.receiptId = expected.receiptId.toLowerCase();
  try {
    const { data, error } = await db.rpc('record_ai_usage_atomic', {
      p_user_id: context.userId, p_receipt_id: expected.receiptId, p_model_id: expected.modelId,
      p_pool_role: expected.poolRole, p_input: expected.inputTokens, p_output: expected.outputTokens, p_cost_usd: expected.costUsd,
    });
    if (error || !data || typeof data !== 'object' || Array.isArray(data)
      || data.userId !== context.userId || data.receiptId !== expected.receiptId
      || data.modelId !== expected.modelId || data.poolRole !== expected.poolRole
      || data.inputTokens !== expected.inputTokens || data.outputTokens !== expected.outputTokens
      || data.costUsd !== expected.costUsd || typeof data.replayed !== 'boolean'
      || typeof data.ledgerId !== 'string' || !/^[1-9][0-9]*$/.test(data.ledgerId)
      || typeof data.period !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])-01$/.test(data.period)
      || !data.usage || typeof data.usage !== 'object' || Array.isArray(data.usage)
      || data.usage.user_id !== context.userId) throw unavailable();
    return data as UsageAccountingReceipt;
  } catch { throw unavailable(); }
}
