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
  console.error(JSON.stringify({
    check: 'lemon_test_webhook',
    status: 'failed',
    category: error instanceof LemonWebhookReconciliationError ? error.category : 'unexpected_failure',
  }));
  process.exitCode = 1;
}
