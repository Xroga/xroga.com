import { LemonWebhookReconciliationError, reconcileLemonTestWebhook } from '../services/lemonWebhookProvisioning.js';

try {
  const result = await reconcileLemonTestWebhook();
  console.log(JSON.stringify({
    check: 'lemon_test_webhook',
    status: result.status,
    action: result.action,
    webhookId: result.webhookId,
    testMode: result.testMode,
    eventCount: result.eventCount,
    lastSentAtPresent: Boolean(result.lastSentAt),
  }));
} catch (error) {
  const reconciliationError = error instanceof LemonWebhookReconciliationError ? error : null;
  console.error(JSON.stringify({
    check: 'lemon_test_webhook',
    status: 'failed',
    category: reconciliationError?.category ?? 'unexpected_failure',
    operation: reconciliationError?.operation ?? 'unknown',
    httpStatus: reconciliationError?.httpStatus ?? null,
  }));
  process.exitCode = 1;
}
