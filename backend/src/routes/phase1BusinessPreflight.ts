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
 * This router is mounted before the normal
 * semantic planner. It handles only:
 *
 * It handles only explicit confirmation or
 * cancellation of the authenticated user's
 * latest pending high-risk action.
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
