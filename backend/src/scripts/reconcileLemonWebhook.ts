import {
  inspectRecentLemonTestBilling,
  LemonWebhookReconciliationError,
  reconcileLemonTestWebhook,
} from '../services/lemonWebhookProvisioning.js';

let check = 'lemon_test_webhook';
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
  check = 'lemon_test_billing_state';
  const billingState = await inspectRecentLemonTestBilling();
  console.log(JSON.stringify({ check, ...billingState }));
} catch (error) {
  const reconciliationError = error instanceof LemonWebhookReconciliationError ? error : null;
  console.error(JSON.stringify({
    check,
    status: 'failed',
    category: reconciliationError?.category ?? 'unexpected_failure',
    operation: reconciliationError?.operation ?? 'unknown',
    httpStatus: reconciliationError?.httpStatus ?? null,
  }));
  process.exitCode = 1;
}
