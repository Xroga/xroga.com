import {
  Router,
} from 'express';

import type {
  AuthRequest,
} from '../middleware/auth.js';

import {
  getUsage,
  usageToTokenUsage,
} from '../ai/quota.js';

import {
  goalContractSchema,
} from '../ai/universal/goalContract.js';

import {
  getSupabaseAdmin,
} from '../config/supabase.js';

import {
  cancelBusinessActionConfirmation,
  confirmBusinessAction,
} from '../services/integrations/businessActionConfirmations.js';

import {
  canUserAccessComposioToolkit,
  createReadOnlyComposioSession,
  getComposioCatalogToolkit,
  isComposioConfigured,
  listComposioCatalog,
  listConnectedComposioToolkits,
} from '../services/integrations/composioClient.js';
import { connectionSearchTerms } from '../services/integrations/businessConnectionIntent.js';
import { connectionCardMarkdown } from '../services/integrations/businessConnectionUi.js';

const router =
  Router();

interface PendingConfirmationRow {
  id: string;
  summary: string;
  toolkit: string;
  risk: string;
  created_at: string;
  expires_at: string;
}

function requireUserId(
  req: AuthRequest,
): string | null {
  const userId =
    req.userId?.trim();

  return userId ||
    null;
}

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

async function connectionStatusResponse(userId: string, target: string): Promise<string> {
  if (!isComposioConfigured()) {
    return 'Xroga Connect is not configured on this server, so I cannot verify app connections right now.';
  }

  const session = await createReadOnlyComposioSession(userId);
  const connected = await listConnectedComposioToolkits(userId, {
    sessionId: session.session_id,
    mode: 'read',
  });
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
async function connectionRequestResponse(userId: string, message: string, terms: string[]): Promise<string> {
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
      const item = await getComposioCatalogToolkit(term);
      if (!item.deprecated && canUserAccessComposioToolkit(userId, item.slug)) {
        possible.set(item.slug, { toolkit: item.slug, name: item.name, description: item.description, logo: item.logo, recommended: true });
        exact = item.slug;
        break;
      }
    } catch {
      // An unrecognized slug can still match the provider's name/description
      // search; do not present an unverified catalog candidate.
    }
  }
  if (!exact) {
    for (const term of terms) {
      const page = await listComposioCatalog({ search: term, limit: 100 });
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
    const session = await createReadOnlyComposioSession(userId);
    const connected = await listConnectedComposioToolkits(userId, { sessionId: session.session_id, mode: 'read', toolkits: candidates.map((item) => item.toolkit) });
    if (candidates.length === 1 && connected.some((item) => item.connected && item.toolkit.toLowerCase() === candidates[0]!.toolkit)) {
      return `${candidates[0]!.name} is already connected. [Set up a connected-app automation](/dashboard/automations#scheduled-tasks), or tell Xroga the exact email you want sent.`;
    }
  } catch {
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

export function explicitConfirmationIntent(
  message: string,
):
  | 'confirm'
  | 'cancel'
  | null {
  const normalized =
    message
      .trim()
      .replace(
        /[“”]/g,
        '"',
      )
      .replace(
        /\s+/g,
        ' ',
      )
      .toLowerCase();

  if (
    /^(?:yes[\s,.-]*)?(?:confirm|approve|proceed|go ahead|do it|execute it)(?:\b.*)?$/i.test(
      normalized,
    ) ||
    /^(?:i|we)\s+(?:have\s+)?review(?:ed)?\s+(?:it\s+)?and\s+confirm(?:\b.*)?$/i.test(
      normalized,
    )
  ) {
    return 'confirm';
  }

  if (
    /^(?:no[\s,.-]*)?(?:cancel|reject|stop)(?:\b.*)?$/i.test(
      normalized,
    ) ||
    /^(?:do not|don't)\s+(?:do|execute|continue|proceed)(?:\b.*)?$/i.test(
      normalized,
    )
  ) {
    return 'cancel';
  }

  return null;
}

async function latestPendingConfirmation(
  userId: string,
): Promise<
  PendingConfirmationRow |
  null
> {
  const db =
    getSupabaseAdmin();

  const {
    data,
    error,
  } =
    await db
      .from(
        'business_action_confirmations',
      )
      .select(
        'id,summary,toolkit,risk,created_at,expires_at',
      )
      .eq(
        'user_id',
        userId,
      )
      .eq(
        'status',
        'pending',
      )
      .order(
        'created_at',
        {
          ascending:
            false,
        },
      )
      .limit(
        5,
      );

  if (
    error
  ) {
    return null;
  }

  const rows =
    (
      data ??
      []
    ) as
      PendingConfirmationRow[];

  const now =
    Date.now();

  return (
    rows.find(
      (row) =>
        new Date(
          row.expires_at,
        ).getTime() >
        now,
    ) ??
    null
  );
}

async function makeBusinessPlan(
  userId: string,
  message: string,
  options: {
    directResponse?: string;
    rationale: string;
    confidence?: number;
  },
) {
  const goalContract =
    goalContractSchema.parse(
      {
        version:
          '1.0',

        goal:
          message,

        desiredOutcome:
          message,

        semanticIntent:
          'EXTERNAL_ACTION',

        constraints: [
          'Execute only the explicit connected-business action requested by the authenticated user.',
          'Never broaden recipients, targets, amounts, permissions, destinations, content, or scope.',
          'High-risk or destructive actions must remain behind the persisted Xroga confirmation boundary.',
        ],

        acceptance: [
          'Use only a provider tool discovered inside the authenticated Xroga Connect session.',
          'Report completion only after real provider execution evidence exists.',
        ],

        historyContext:
          [],

        projectContext:
          null,

        deliverables:
          [],

        requiredCapabilities: [
          'business.action',
        ],

        requiredAuthorities: [
          'model:execute',
        ],

        freshnessRequirement:
          'NONE',

        sourcePolicy: {
          mode:
            'any',

          scope:
            'public_web',

          officialDomains:
            [],
        },

        previewRequirement:
          'NONE',

        deploymentRequirement:
          'NONE',

        risks: [
          'This request can change state in a connected external application.',
        ],

        confidence:
          options.confidence ??
          0.99,

        blockers:
          [],

        contextComplexity:
          'low',
      },
    );

  const usage =
    usageToTokenUsage(
      await getUsage(
        userId,
      ),
    );

  return {
    goalContract,

    dispatch:
      'chat' as const,

    capabilityIds: [
      'business.action',
    ],

    rationale:
      options.rationale,

    blockers:
      [],

    usage,

    ...(options.directResponse
      ? {
          directResponse:
            options.directResponse,
        }
      : {}),
  };
}

/**
 * Confirmation continuity for an already
 * prepared Xroga Connect action.
 *
 * This router is mounted before the normal semantic planner. It handles
 * authenticated connection-status checks and explicit confirmation or
 * cancellation of the user's latest pending high-risk action.
 *
 * Everything else falls through unchanged to
 * the normal semantic planner.
 */
router.post(
  '/plan',
  async (
    req: AuthRequest,
    res,
    next,
  ) => {
    const userId =
      requireUserId(
        req,
      );

    if (
      !userId
    ) {
      return next();
    }

    const message =
      typeof req.body
        ?.message ===
      'string'
        ? req.body
            .message
            .trim()
        : '';

    if (
      !message
    ) {
      return next();
    }

    const statusTarget = connectionStatusTarget(message);
    if (statusTarget) {
      try {
        const response = await connectionStatusResponse(userId, statusTarget);
        return res.json(await makeConnectionStatusPlan(userId, message, response));
      } catch {
        return res.json(await makeConnectionStatusPlan(
          userId,
          message,
          'I could not verify your connected apps right now. Xroga Connect may be temporarily unavailable; please try again or check Plugins in the workspace.',
        ));
      }
    }

    const connectTerms = connectionSearchTerms(message);
    if (connectTerms) {
      try {
        const response = await connectionRequestResponse(userId, message, connectTerms);
        return res.json(await makeBusinessPlan(userId, message, {
          rationale: 'Handled explicit app authorization before connected-app action discovery.',
          directResponse: response,
        }));
      } catch {
        return res.json(await makeBusinessPlan(userId, message, {
          rationale: 'The app directory could not resolve a safe connection candidate.',
          directResponse: `Xroga could not load the app directory right now. [Search Plugins](/dashboard/integrations?q=${encodeURIComponent(connectTerms[0] ?? '')}) and try connecting there. No email was sent.`,
        }));
      }
    }

    const confirmationIntent =
      explicitConfirmationIntent(
        message,
      );

    if (
      confirmationIntent
    ) {
      const pending =
        await latestPendingConfirmation(
          userId,
        );

      if (
        !pending
      ) {
        return res.json(
          await makeBusinessPlan(
            userId,
            message,
            {
              rationale:
                'Handled as an explicit confirmation follow-up without invoking the semantic planner.',

              directResponse:
                'There is no pending connected-app action to confirm or cancel.',
            },
          ),
        );
      }

      try {
        if (
          confirmationIntent ===
          'cancel'
        ) {
          const cancelled =
            await cancelBusinessActionConfirmation(
              userId,
              pending.id,
            );

          return res.json(
            await makeBusinessPlan(
              userId,
              message,
              {
                rationale:
                  'Cancelled the authenticated user’s latest pending connected-app action.',

                directResponse:
                  cancelled.status ===
                    'cancelled'
                    ? `Cancelled — ${cancelled.summary}\n\nNothing was changed.`
                    : `That action is already ${cancelled.status}.`,
              },
            ),
          );
        }

        const confirmed =
          await confirmBusinessAction(
            userId,
            pending.id,
          );

        return res.json(
          await makeBusinessPlan(
            userId,
            message,
            {
              rationale:
                'Executed the authenticated user’s explicitly confirmed pending connected-app action.',

              directResponse:
                `Done — ${confirmed.confirmation.summary}\n\n` +
                `${displayToolkitName(
                  confirmed.execution
                    .toolkit,
                )} confirmed the action completed.`,
            },
          ),
        );
      } catch (
        error
      ) {
        const messageText =
          error instanceof
          Error
            ? error.message
            : 'Xroga could not complete the pending action confirmation.';

        return res.json(
          await makeBusinessPlan(
            userId,
            message,
            {
              rationale:
                'The explicit pending-action confirmation could not be completed safely.',

              directResponse:
                messageText,
            },
          ),
        );
      }
    }

    return next();
  },
);

export default router;
