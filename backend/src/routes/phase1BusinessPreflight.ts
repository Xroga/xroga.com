import {isTerminalModelFailure} from '../ai/providerRuntime.js';
import type {TenantContext} from '../security/tenantContext.js';
import { Router } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { getUsage, usageToTokenUsage } from '../ai/quota.js';
import { goalContractSchema } from '../ai/universal/goalContract.js';

import { requireTenantContext } from '../security/tenantContext.js';
import { canUserAccessComposioToolkit, createReadOnlyComposioSession, getComposioCatalogToolkit, isComposioConfigured, listComposioCatalog, listConnectedComposioToolkits } from '../services/integrations/composioClient.js';
import { connectionSearchTerms } from '../services/integrations/businessConnectionIntent.js';
import { connectionCardMarkdown } from '../services/integrations/businessConnectionUi.js';

const router = Router();

function displayToolkitName(
  toolkit: string,
): string {
  return toolkit
    .split(
      /[_-]/g,
    )
    .filter(
      Boolean,
    )
    .map(
      (part) =>
        part
          .charAt(0)
          .toUpperCase() +
        part.slice(1),
    )
    .join(
      ' ',
    );
}

/** Only a question about connection state belongs on this direct read path. */
export function connectionStatusTarget(message: string): string | null {
  const normalized = message.trim().replace(/[?.!]+$/, '').trim();
  if (!/\b(?:connected|linked)\b/i.test(normalized)) return null;

  if (
    /^(?:which|what|show|list|tell me)\b.*\b(?:apps|plugins|integrations|connections)\b.*\b(?:connected|linked)(?:\s+(?:to|with)\s+xroga)?$/i.test(normalized)
  ) {
    return '*';
  }

  const match = normalized.match(
    /^(?:(?:can you|please)\s+)?(?:check|verify|tell me if|tell me whether|is|are)\s+(?:if\s+|whether\s+)?(.+?)\s+(?:(?:is|are)\s+)?(?:currently\s+)?(?:connected|linked)(?:\s+(?:to|with)\s+xroga)?$/i,
  );
  if (!match) return null;

  const target = match[1]!
    .replace(/^(?:my|the|our)\s+/i, '')
    .replace(/\s+(?:app|plugin|integration)$/i, '')
    .replace(/[^a-z0-9 _-]/gi, '')
    .trim();

  if (/^(?:apps|plugins|integrations|connections)$/i.test(target)) return '*';
  return target.length >= 2 && target.length <= 60 ? target : null;
}

async function connectionStatusResponse(userId: string, target: string,tenantContext:TenantContext): Promise<string> {
  if (!isComposioConfigured()) {
    return 'Xroga Connect is not configured on this server, so I cannot verify app connections right now.';
  }

  const session = await createReadOnlyComposioSession(userId,tenantContext);
  const connected = await listConnectedComposioToolkits(userId, {
    sessionId: session.session_id,
    mode: 'read',
  },tenantContext);
  const names = connected.map((item) => ({
    normalized: item.toolkit.toLowerCase().replace(/[^a-z0-9]/g, ''),
    name: displayToolkitName(item.toolkit),
  }));

  if (target === '*') {
    return names.length
      ? `Connected apps: ${names.slice(0, 30).map((item) => item.name).join(', ')}${names.length > 30 ? `, and ${names.length - 30} more` : ''}.`
      : 'I could not find an active connected app in your Xroga Connect account. [Browse Plugins](/dashboard/integrations) to connect one.';
  }

  const key = target.toLowerCase().replace(/[^a-z0-9]/g, '');
  const match = names.find((item) => item.normalized === key || item.name.toLowerCase().replace(/[^a-z0-9]/g, '') === key);
  return match
    ? `${match.name} is connected to your Xroga Connect account.`
    : `I could not find an active ${target} connection in your Xroga Connect account. [Find this plugin](/dashboard/integrations?q=${encodeURIComponent(target)}) to connect or re-authorize it.`;
}

/** Connection requests must not require an already-authorized action tool. */
async function connectionRequestResponse(userId: string, message: string, terms: string[],tenantContext:TenantContext): Promise<string> {
  if (!isComposioConfigured()) {
    return 'Xroga Connect is not configured on this server, so I cannot start app authorization yet. [Browse Plugins](/dashboard/integrations) once it is available.';
  }
  if (!terms.length) {
    return 'Which app would you like to connect? [Browse Plugins](/dashboard/integrations) to search all available apps.';
  }

  const possible = new Map<string, { toolkit: string; name: string; description?: string; logo?: string; recommended: boolean }>();
  let exact: string | null = null;
  // A named app should be resolved by its verified toolkit slug first. The
  // provider's free-text catalog search can return an empty page even while
  // direct toolkit lookup and the marketplace both know the app exists.
  for (const term of terms) {
    if (!/^[a-z][a-z0-9_-]{1,59}$/.test(term)) continue;
    try {
      const item = await getComposioCatalogToolkit(term,tenantContext);
      if (!item.deprecated && canUserAccessComposioToolkit(userId, item.slug)) {
        possible.set(item.slug, { toolkit: item.slug, name: item.name, description: item.description, logo: item.logo, recommended: true });
        exact = item.slug;
        break;
      }
    } catch(error) {
      if(isTerminalModelFailure(error))throw error;
      // An unrecognized slug can still match the provider's name/description
      // search; do not present an unverified catalog candidate.
    }
  }
  if (!exact) {
    for (const term of terms) {
      const page = await listComposioCatalog({ search: term, limit: 100 },tenantContext);
      const normalized = term.replace(/[^a-z0-9]/g, '');
      for (const item of page.items) {
        if (item.deprecated || !canUserAccessComposioToolkit(userId, item.slug)) continue;
        const key = item.slug.replace(/[^a-z0-9]/g, '');
        const name = item.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!possible.has(item.slug)) possible.set(item.slug, {
          toolkit: item.slug, name: item.name, description: item.description, logo: item.logo, recommended: false,
        });
        if (key === normalized || name === normalized) { exact = item.slug; break; }
      }
      if (exact) break;
    }
  }
  const candidates = exact
    ? [possible.get(exact)!]
    : [...possible.values()].slice(0, 4);
  if (!candidates.length) {
    return `I could not find a verified app match for that connection request. [Search Plugins](/dashboard/integrations?q=${encodeURIComponent(terms[0]!)}) and choose the app there.`;
  }
  candidates[0]!.recommended = true;

  try {
    const session = await createReadOnlyComposioSession(userId,tenantContext);
    const connected = await listConnectedComposioToolkits(userId, { sessionId: session.session_id, mode: 'read', toolkits: candidates.map((item) => item.toolkit) },tenantContext);
    if (candidates.length === 1 && connected.some((item) => item.connected && item.toolkit.toLowerCase() === candidates[0]!.toolkit)) {
      return `${candidates[0]!.name} is already connected. [Set up a connected-app automation](/dashboard/automations#scheduled-tasks), or tell Xroga the exact email you want sent.`;
    }
  } catch(error) {
    if(isTerminalModelFailure(error))throw error;
    // Catalog identity is enough to offer authorization; the click performs
    // a fresh authenticated session check and may report an upstream outage.
  }

  return connectionCardMarkdown({
    mode: 'action', task: message,
    message: candidates.length === 1
      ? `Connect ${candidates[0]!.name} to Xroga first. After authorization, you can set up the email workflow.`
      : 'Choose the app you want to connect to Xroga.',
    candidates,
  });
}

async function makeConnectionStatusPlan(userId: string, message: string, directResponse: string) {
  const goalContract = goalContractSchema.parse({
    version: '1.0',
    goal: message,
    desiredOutcome: 'Report the current connected-app status for the authenticated user.',
    semanticIntent: 'INVESTIGATE',
    constraints: ['Read only the authenticated user’s connection status. Do not execute a provider app tool or change external state.'],
    acceptance: ['Report only connection state returned by the authenticated Xroga Connect session.'],
    historyContext: [],
    projectContext: null,
    deliverables: [],
    requiredCapabilities: ['business.read'],
    requiredAuthorities: ['model:execute'],
    freshnessRequirement: 'CURRENT_REQUIRED',
    sourcePolicy: { mode: 'any', scope: 'public_web', officialDomains: [] },
    previewRequirement: 'NONE',
    deploymentRequirement: 'NONE',
    risks: [],
    confidence: 1,
    blockers: [],
    contextComplexity: 'low',
  });

  return {
    goalContract,
    dispatch: 'chat' as const,
    capabilityIds: ['business.read'],
    rationale: 'Checked the authenticated user’s live connected-app status without tool search or mutation.',
    blockers: [],
    usage: usageToTokenUsage(await getUsage(userId)),
    directResponse,
  };
}


/** Preserve current-main app discovery without restoring latest-action mutation. */
router.post('/plan', async (req: AuthRequest, res, next) => {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  const statusTarget = connectionStatusTarget(message);
  const connectTerms = statusTarget ? null : connectionSearchTerms(message);
  if (!statusTarget && !connectTerms) return next();
  try {
    const actor = requireTenantContext(req.tenantContext);
    if (actor.userId !== req.userId) return res.status(403).json({ error: 'Connection scope is unavailable.' });
    const response = statusTarget
      ? await connectionStatusResponse(actor.userId, statusTarget,actor)
      : await connectionRequestResponse(actor.userId, message, connectTerms!,actor);
    return res.json(await makeConnectionStatusPlan(actor.userId, message, response));
  } catch {
    return res.status(503).json({ error: 'Xroga could not verify or prepare this app connection. No action was executed.' });
  }
});


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
