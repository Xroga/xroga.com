import { Router } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { getUsage, usageToTokenUsage } from '../ai/quota.js';
import { goalContractSchema } from '../ai/universal/goalContract.js';

const router = Router();

export function explicitConfirmationIntent(message: string): 'confirm' | 'cancel' | null {
  const normalized = message.trim().replace(/[“”]/g, '"').replace(/\s+/g, ' ').toLowerCase();
  if (/^(?:yes[\s,.-]*)?(?:confirm|approve|proceed|go ahead|do it|execute it)(?:\b.*)?$/i.test(normalized)
    || /^(?:i|we)\s+(?:have\s+)?review(?:ed)?\s+(?:it\s+)?and\s+confirm(?:\b.*)?$/i.test(normalized)) return 'confirm';
  if (/^(?:no[\s,.-]*)?(?:cancel|reject|stop)(?:\b.*)?$/i.test(normalized)
    || /^(?:do not|don't)\s+(?:do|execute|continue|proceed)(?:\b.*)?$/i.test(normalized)) return 'cancel';
  return null;
}

/** A chat phrase has no displayed action identity. Never choose the latest row
 * across conversations. Existing exact-ID review/confirm/cancel routes remain
 * the authority boundary, including their persisted one-use claim and digest. */
router.post('/plan', async (req: AuthRequest, res, next) => {
  const userId = req.userId?.trim();
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!userId || !message) return next();
  const intent = explicitConfirmationIntent(message);
  if (!intent) return next();
  try {
    const goalContract = goalContractSchema.parse({
      version: '1.0', goal: message, desiredOutcome: message, semanticIntent: 'EXTERNAL_ACTION',
      constraints: [
        'Execute only the explicit connected-business action requested by the authenticated user.',
        'Never broaden recipients, targets, amounts, permissions, destinations, content, or scope.',
        'High-risk or destructive actions must remain behind the persisted Xroga confirmation boundary.',
      ],
      acceptance: [
        'Use only a provider tool discovered inside the authenticated Xroga Connect session.',
        'Report completion only after real provider execution evidence exists.',
      ],
      historyContext: [], projectContext: null, deliverables: [],
      requiredCapabilities: ['business.action'], requiredAuthorities: ['model:execute'],
      freshnessRequirement: 'NONE', sourcePolicy: { mode: 'any', scope: 'public_web', officialDomains: [] },
      previewRequirement: 'NONE', deploymentRequirement: 'NONE',
      risks: ['This request can change state in a connected external application.'],
      confidence: 0.99, blockers: [], contextComplexity: 'low',
    });
    return res.json({
      goalContract, dispatch: 'chat', capabilityIds: ['business.action'],
      rationale: 'An exact reviewed action is required. A chat phrase cannot select an action across conversations.',
      blockers: [], usage: usageToTokenUsage(await getUsage(userId)),
      directResponse: intent === 'confirm'
        ? 'Open the Review link on the specific connected-app action, check its details, and confirm there. No action was executed from this message.'
        : 'Open the Review link on the specific connected-app action and cancel it there. No action was cancelled or executed from this message.',
    });
  } catch {
    // Never fall through to model execution on a preflight or usage-read error.
    return res.status(503).json({ error: 'Open the specific action review to confirm or cancel it. This message did not change an action.' });
  }
});

export default router;
