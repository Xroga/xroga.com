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
  listConnectedComposioToolkits,
  searchComposioActionTools,
  type XrogaConnectTool,
} from '../services/integrations/composioClient.js';

const router =
  Router();

const NATIVE_INFRA_TOOLKITS =
  new Set([
    'github',
    'vercel',
    'supabase',
  ]);

const MUTATION_LANGUAGE =
  /\b(?:send|reply|create|add|update|edit|delete|remove|archive|unarchive|upload|publish|unpublish|move|rename|invite|grant|revoke|refund|transfer|charge|pay|cancel|schedule|reschedule|post|react|mark|set|enable|disable|approve|reject|accept|decline|submit|close|reopen|assign|unassign|fulfill|ship|pause|resume)\b/i;

const WORD_STOPLIST =
  new Set([
    'a',
    'an',
    'and',
    'are',
    'as',
    'at',
    'be',
    'by',
    'for',
    'from',
    'in',
    'into',
    'is',
    'it',
    'my',
    'now',
    'of',
    'on',
    'or',
    'please',
    'that',
    'the',
    'this',
    'to',
    'using',
    'via',
    'with',
    'you',
    'your',
  ]);

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

function normalizeWords(
  value: string,
): string[] {
  return (
    value
      .replace(
        /([a-z])([A-Z])/g,
        '$1 $2',
      )
      .toLowerCase()
      .match(
        /[a-z0-9]+/g,
      ) ??
    []
  )
    .filter(
      (word) =>
        word.length >=
          3 &&
        !WORD_STOPLIST.has(
          word,
        ),
    );
}

function explicitConfirmationIntent(
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

function actionToolScore(
  message: string,
  tool: XrogaConnectTool,
): number {
  const messageWords =
    new Set(
      normalizeWords(
        message,
      ),
    );

  const toolWords =
    new Set(
      normalizeWords(
        [
          tool.slug,
          tool.toolkit,
          tool.description ??
            '',
        ].join(
          ' ',
        ),
      ),
    );

  let overlap =
    0;

  for (
    const word of
      messageWords
  ) {
    if (
      toolWords.has(
        word,
      )
    ) {
      overlap +=
        1;
    }
  }

  const toolkitWords =
    normalizeWords(
      tool.toolkit,
    );

  if (
    toolkitWords.some(
      (word) =>
        messageWords.has(
          word,
        ),
    )
  ) {
    overlap +=
      2;
  }

  return overlap;
}

async function authoritativeConnected(
  userId: string,
  sessionId: string,
  toolkit: string,
): Promise<boolean> {
  try {
    const connected =
      await listConnectedComposioToolkits(
        userId,
        {
          sessionId,
          mode:
            'action',
          toolkits: [
            toolkit,
          ],
        },
      );

    return connected.some(
      (item) =>
        item.connected &&
        item.toolkit
          .toLowerCase() ===
          toolkit
            .toLowerCase(),
    );
  } catch {
    return false;
  }
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
 * Confirmation continuity and a narrow
 * Xroga Connect action fast path.
 *
 * This router is mounted before the normal
 * semantic planner. It handles only:
 *
 * 1. explicit confirmation/cancellation of
 *    the authenticated user's latest pending
 *    high-risk action; or
 * 2. high-confidence connected-app mutations
 *    that Composio itself semantically matches.
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

    if (
      message.length >
        500 ||
      /^\/build\b/i.test(
        message,
      ) ||
      !MUTATION_LANGUAGE.test(
        message,
      )
    ) {
      return next();
    }

    try {
      const discovery =
        await searchComposioActionTools(
          userId,
          {
            query:
              message,
          },
        );

      const candidates =
        discovery.tools
          .filter(
            (tool) =>
              tool.risk !==
                'read' &&
              !NATIVE_INFRA_TOOLKITS.has(
                tool.toolkit
                  .toLowerCase(),
              ),
          )
          .map(
            (tool) => ({
              tool,
              score:
                actionToolScore(
                  message,
                  tool,
                ),
            }),
          )
          .sort(
            (
              left,
              right,
            ) =>
              right.score -
              left.score,
          );

      const best =
        candidates[0];

      if (
        !best ||
        best.score <=
          0
      ) {
        return next();
      }

      let highConfidence =
        best.score >=
        2;

      if (
        !highConfidence &&
        best.score ===
          1 &&
        best.tool.risk ===
          'destructive'
      ) {
        highConfidence =
          await authoritativeConnected(
            userId,
            discovery.sessionId,
            best.tool.toolkit,
          );
      }

      if (
        !highConfidence
      ) {
        return next();
      }

      return res.json(
        await makeBusinessPlan(
          userId,
          message,
          {
            rationale:
              `Xroga Connect matched this explicit state-changing request to the ${best.tool.toolkit} action surface before the general planner.`,

            confidence:
              Math.min(
                0.99,
                0.88 +
                  best.score *
                    0.03,
              ),
          },
        ),
      );
    } catch {
      /*
       * The preflight is deliberately
       * best-effort. A Composio lookup
       * problem must never replace the
       * canonical semantic planner with
       * a new failure mode.
       */
      return next();
    }
  },
);

export default router;
