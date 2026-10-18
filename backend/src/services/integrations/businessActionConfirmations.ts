import { isDeepStrictEqual } from 'node:util';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getSupabaseAdmin,
} from '../../config/supabase.js';

import {
  ComposioClientError,
  type XrogaConnectToolRisk,
} from './composioClient.js';

import {
  executePreparedBusinessAction,
  verifyPlanDigest,
  type BusinessActionPlan,
  type BusinessActionExecutionOutcome,
} from './businessAction.js';

const CONFIRMATION_TTL_MS =
  15 * 60 * 1_000;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ConfirmationStatus =
  | 'pending'
  | 'executing'
  | 'consumed'
  | 'cancelled'
  | 'failed'
  | 'expired';

interface ConfirmationRow {
  id: string;
  user_id: string;
  status: ConfirmationStatus;
  plan?: unknown;
  plan_digest: string;
  summary: string;
  toolkit: string;
  risk: string;
  created_at: string;
  expires_at: string;
  claimed_at?: string | null;
  completed_at?: string | null;
  failure_code?: string | null;
}

export interface SafeBusinessActionConfirmation {
  id: string;
  status: ConfirmationStatus;
  summary: string;
  toolkit: string;
  risk: XrogaConnectToolRisk;
  createdAt: string;
  expiresAt: string;
}

function cleanConfirmationId(
  value: string,
): string {
  const clean =
    value.trim();

  if (
    !UUID_PATTERN.test(
      clean,
    )
  ) {
    throw new ComposioClientError(
      'Invalid business-action confirmation.',
      {
        status: 400,
        code:
          'BUSINESS_ACTION_CONFIRMATION_INVALID',
      },
    );
  }

  return clean;
}

function isPlainRecord(
  value: unknown,
): value is Record<
  string,
  unknown
> {
  return Boolean(
    value &&
      typeof value ===
        'object' &&
      !Array.isArray(
        value,
      ),
  );
}

function isBusinessActionPlan(
  value: unknown,
): value is BusinessActionPlan {
  if (
    !isPlainRecord(
      value,
    )
  ) {
    return false;
  }

  const risk =
    value.risk;

  return (
    value.version ===
      '1.0' &&
    typeof value.sessionId ===
      'string' &&
    value.sessionId.startsWith(
      'trs_',
    ) &&
    typeof value.useCase ===
      'string' &&
    value.useCase.length >
      0 &&
    typeof value.toolkit ===
      'string' &&
    value.toolkit.length >
      0 &&
    typeof value.toolSlug ===
      'string' &&
    value.toolSlug.length >
      0 &&
    isPlainRecord(
      value.arguments,
    ) &&
    (
      risk === 'read' ||
      risk === 'write' ||
      risk === 'destructive' ||
      risk === 'unknown'
    ) &&
    typeof value.requiresConfirmation ===
      'boolean' &&
    typeof value.summary ===
      'string' &&
    Array.isArray(
      value.requiredScopes,
    ) &&
    value.requiredScopes.every(
      (item) =>
        typeof item ===
        'string',
    ) &&
    typeof value.planDigest ===
      'string' &&
    /^[a-f0-9]{64}$/i.test(
      value.planDigest,
    )
  );
}

function safeConfirmation(
  row: ConfirmationRow,
): SafeBusinessActionConfirmation {
  const risk =
    row.risk;

  if (
    risk !== 'read' &&
    risk !== 'write' &&
    risk !== 'destructive' &&
    risk !== 'unknown'
  ) {
    throw new ComposioClientError(
      'Stored business-action confirmation is invalid.',
      {
        status: 500,
        code:
          'BUSINESS_ACTION_CONFIRMATION_INVALID',
      },
    );
  }

  return {
    id:
      row.id,

    status:
      row.status,

    summary:
      row.summary,

    toolkit:
      row.toolkit,

    risk,

    createdAt:
      row.created_at,

    expiresAt:
      row.expires_at,
  };
}

async function expireIfNeeded(
  row: ConfirmationRow,
): Promise<
  ConfirmationRow
> {
  if (
    row.status !==
      'pending' ||
    new Date(
      row.expires_at,
    ).getTime() >
      Date.now()
  ) {
    return row;
  }

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
      .update(
        {
          status:
            'expired',
        },
      )
      .eq(
        'id',
        row.id,
      )
      .eq(
        'user_id',
        row.user_id,
      )
      .eq(
        'status',
        'pending',
      )
      .select(
        'id,user_id,status,plan_digest,summary,toolkit,risk,created_at,expires_at,claimed_at,completed_at,failure_code',
      )
      .maybeSingle();

  if (
    error
  ) {
    throw new ComposioClientError(
      'Xroga could not update the expired confirmation.',
      {
        status: 503,
        code:
          'BUSINESS_ACTION_CONFIRMATION_STORE_UNAVAILABLE',
      },
    );
  }

  return (
    data as
      | ConfirmationRow
      | null
  ) ??
    {
      ...row,
      status:
        'expired',
    };
}

export async function createBusinessActionConfirmation(
  userId: string,
  plan: BusinessActionPlan,
): Promise<SafeBusinessActionConfirmation> {
  if (!isBusinessActionPlan(plan) || !verifyPlanDigest(plan)) {
    throw new ComposioClientError('The prepared external action changed after planning.', {
      status: 409, code: 'BUSINESS_ACTION_PLAN_CHANGED',
    });
  }
  if (
    !plan.requiresConfirmation
  ) {
    throw new ComposioClientError(
      'This business action does not require an additional confirmation.',
      {
        status: 400,
        code:
          'BUSINESS_ACTION_CONFIRMATION_NOT_REQUIRED',
      },
    );
  }

  const db =
    getSupabaseAdmin();

  const expiresAt =
    new Date(
      Date.now() +
        CONFIRMATION_TTL_MS,
    ).toISOString();

  const {
    data,
    error,
  } =
    await db
      .from(
        'business_action_confirmations',
      )
      .insert(
        {
          user_id:
            userId,

          status:
            'pending',

          plan,

          plan_digest:
            plan.planDigest,

          summary:
            plan.summary,

          toolkit:
            plan.toolkit,

          risk:
            plan.risk,

          expires_at:
            expiresAt,
        },
      )
      .select(
        'id,user_id,status,plan_digest,summary,toolkit,risk,created_at,expires_at,claimed_at,completed_at,failure_code',
      )
      .single();

  if (
    error ||
    !data
  ) {
    throw new ComposioClientError(
      'Xroga could not create the action confirmation.',
      {
        status: 503,
        code:
          'BUSINESS_ACTION_CONFIRMATION_STORE_UNAVAILABLE',
      },
    );
  }

  return safeConfirmation(
    data as
      ConfirmationRow,
  );
}

export async function getBusinessActionConfirmation(
  userId: string,
  confirmationId: string,
): Promise<SafeBusinessActionConfirmation> {
  const id =
    cleanConfirmationId(
      confirmationId,
    );

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
        'id,user_id,status,plan_digest,summary,toolkit,risk,created_at,expires_at,claimed_at,completed_at,failure_code',
      )
      .eq(
        'id',
        id,
      )
      .eq(
        'user_id',
        userId,
      )
      .maybeSingle();

  if (
    error
  ) {
    throw new ComposioClientError(
      'Xroga could not load the action confirmation.',
      {
        status: 503,
        code:
          'BUSINESS_ACTION_CONFIRMATION_STORE_UNAVAILABLE',
      },
    );
  }

  if (
    !data
  ) {
    throw new ComposioClientError(
      'Business-action confirmation was not found.',
      {
        status: 404,
        code:
          'BUSINESS_ACTION_CONFIRMATION_NOT_FOUND',
      },
    );
  }

  return safeConfirmation(
    await expireIfNeeded(
      data as
        ConfirmationRow,
    ),
  );
}

export async function cancelBusinessActionConfirmation(
  userId: string,
  confirmationId: string,
): Promise<SafeBusinessActionConfirmation> {
  const id =
    cleanConfirmationId(
      confirmationId,
    );

  const current =
    await getBusinessActionConfirmation(
      userId,
      id,
    );

  if (
    current.status !==
    'pending'
  ) {
    return current;
  }

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
      .update(
        {
          status:
            'cancelled',

          completed_at:
            new Date()
              .toISOString(),
        },
      )
      .eq(
        'id',
        id,
      )
      .eq(
        'user_id',
        userId,
      )
      .eq(
        'status',
        'pending',
      )
      .select(
        'id,user_id,status,plan_digest,summary,toolkit,risk,created_at,expires_at,claimed_at,completed_at,failure_code',
      )
      .maybeSingle();

  if (
    error
  ) {
    throw new ComposioClientError(
      'Xroga could not cancel the pending action.',
      {
        status: 503,
        code:
          'BUSINESS_ACTION_CONFIRMATION_STORE_UNAVAILABLE',
      },
    );
  }

  if (
    !data
  ) {
    return getBusinessActionConfirmation(
      userId,
      id,
    );
  }

  return safeConfirmation(
    data as
      ConfirmationRow,
  );
}

async function finishClaimedConfirmation(
  db: SupabaseClient, userId: string, id: string, expected: ConfirmationRow, status: 'consumed' | 'failed', failureCode?: unknown,
): Promise<ConfirmationRow> {
  const code = status === 'consumed' ? null
    : typeof failureCode === 'string' && /^[A-Za-z0-9_.:-]{1,120}$/.test(failureCode) ? failureCode : 'execution_failed';
  if (expected.id !== id || expected.user_id !== userId || expected.status !== 'executing'
    || typeof expected.claimed_at !== 'string' || !Number.isFinite(Date.parse(expected.claimed_at))) {
    throw new ComposioClientError('The claimed action record could not be verified.', {
      status: 503, code: 'BUSINESS_ACTION_CONFIRMATION_FINALIZE_FAILED',
    });
  }
  const { data, error } = await db.rpc('finish_business_action_confirmation', {
    p_owner: userId, p_expected: expected, p_status: status, p_failure_code: code,
  }).maybeSingle<ConfirmationRow>();
  if (error || !data || data.id !== id || data.user_id !== userId || data.status !== status || data.failure_code !== code
    || typeof data.completed_at !== 'string' || !Number.isFinite(Date.parse(data.completed_at))
    || !['plan','plan_digest','summary','toolkit','risk','created_at','expires_at','claimed_at']
      .every(key => isDeepStrictEqual(data[key as keyof ConfirmationRow], expected[key as keyof ConfirmationRow]))) {
    throw new ComposioClientError('Xroga could not finalize the claimed action record. Its execution outcome may require recovery.', {
      status: 503, code: 'BUSINESS_ACTION_CONFIRMATION_FINALIZE_FAILED',
    });
  }
  return data as ConfirmationRow;
}

export async function confirmBusinessAction(
  userId: string,
  confirmationId: string,
): Promise<{
  confirmation:
    SafeBusinessActionConfirmation;

  execution:
    Extract<
      BusinessActionExecutionOutcome,
      {
        status: 'success';
      }
    >;
}> {
  const id =
    cleanConfirmationId(
      confirmationId,
    );

  const db =
    getSupabaseAdmin();

  const {
    data: existing,
    error: readError,
  } =
    await db
      .from(
        'business_action_confirmations',
      )
      .select(
        'id,user_id,status,plan,plan_digest,summary,toolkit,risk,created_at,expires_at,claimed_at,completed_at,failure_code',
      )
      .eq(
        'id',
        id,
      )
      .eq(
        'user_id',
        userId,
      )
      .maybeSingle();

  if (
    readError
  ) {
    throw new ComposioClientError(
      'Xroga could not load the action confirmation.',
      {
        status: 503,
        code:
          'BUSINESS_ACTION_CONFIRMATION_STORE_UNAVAILABLE',
      },
    );
  }

  if (
    !existing
  ) {
    throw new ComposioClientError(
      'Business-action confirmation was not found.',
      {
        status: 404,
        code:
          'BUSINESS_ACTION_CONFIRMATION_NOT_FOUND',
      },
    );
  }

  const row =
    await expireIfNeeded(
      existing as
        ConfirmationRow,
    );

  if (
    row.status ===
    'expired'
  ) {
    throw new ComposioClientError(
      'This action confirmation expired. Ask Xroga to prepare the action again.',
      {
        status: 409,
        code:
          'BUSINESS_ACTION_CONFIRMATION_EXPIRED',
      },
    );
  }

  if (
    row.status !==
    'pending'
  ) {
    throw new ComposioClientError(
      'This action confirmation is no longer pending.',
      {
        status: 409,
        code:
          'BUSINESS_ACTION_CONFIRMATION_ALREADY_USED',
      },
    );
  }

  if (
    !isBusinessActionPlan(
      row.plan,
    ) ||
    row.plan.planDigest !==
      row.plan_digest ||
    row.summary !== row.plan.summary ||
    row.toolkit !== row.plan.toolkit ||
    row.risk !== row.plan.risk
  ) {
    throw new ComposioClientError(
      'Stored business-action confirmation is invalid.',
      {
        status: 409,
        code:
          'BUSINESS_ACTION_CONFIRMATION_INVALID',
      },
    );
  }

  const {
    data: claimed,
    error: claimError,
  } =
    await db
      .rpc('claim_business_action_confirmation', {
        p_owner: userId, p_id: id, p_digest: row.plan_digest,
        p_plan: row.plan, p_expires: row.expires_at,
      })
      .maybeSingle();

  if (
    claimError
  ) {
    throw new ComposioClientError(
      'Xroga could not claim the pending action.',
      {
        status: 503,
        code:
          'BUSINESS_ACTION_CONFIRMATION_STORE_UNAVAILABLE',
      },
    );
  }

  if (
    !claimed
  ) {
    throw new ComposioClientError(
      'This action confirmation was already claimed or cancelled.',
      {
        status: 409,
        code:
          'BUSINESS_ACTION_CONFIRMATION_ALREADY_USED',
      },
    );
  }

  const claimedRow =
    claimed as
      ConfirmationRow;

  if (
    !isBusinessActionPlan(
      claimedRow.plan,
    ) ||
    claimedRow.plan.planDigest !==
      claimedRow.plan_digest ||
    claimedRow.plan_digest !== row.plan_digest ||
    claimedRow.summary !== claimedRow.plan.summary ||
    claimedRow.toolkit !== claimedRow.plan.toolkit ||
    claimedRow.risk !== claimedRow.plan.risk ||
    !isDeepStrictEqual(claimedRow.plan, row.plan) ||
    claimedRow.created_at !== row.created_at ||
    claimedRow.expires_at !== row.expires_at ||
    typeof claimedRow.claimed_at !== 'string' ||
    !Number.isFinite(Date.parse(claimedRow.claimed_at)) ||
    claimedRow.user_id !== userId ||
    claimedRow.id !== id ||
    claimedRow.status !== 'executing'
  ) {
    throw new ComposioClientError(
      'Stored business-action confirmation is invalid.',
      {
        status: 409,
        code:
          'BUSINESS_ACTION_CONFIRMATION_INVALID',
      },
    );
  }

  try {
    const execution =
      await executePreparedBusinessAction(
        {
          userId,

          plan:
            claimedRow.plan,

          authorization: {
            explicitUserAuthorization:
              true,

            confirmedHighRisk:
              true,
          },
        },
      );

    if (
      execution.status !==
      'success'
    ) {
      throw new ComposioClientError(
        'The confirmed action could not be executed.',
        {
          status: 409,
          code:
            'BUSINESS_ACTION_CONFIRMATION_EXECUTION_BLOCKED',
        },
      );
    }

    const completed = await finishClaimedConfirmation(db, userId, id, claimedRow, 'consumed');

    return {
      confirmation:
        safeConfirmation(
          completed as
            ConfirmationRow,
        ),

      execution,
    };
  } catch (error) {
    /*
     * If execution itself failed, consume
     * the one-time confirmation as failed.
     *
     * Do not silently retry a destructive
     * or financial action after uncertainty.
     */
    if (
      !(
        error instanceof
          ComposioClientError &&
        error.code ===
          'BUSINESS_ACTION_CONFIRMATION_FINALIZE_FAILED'
      )
    ) {
      await finishClaimedConfirmation(db, userId, id, claimedRow, 'failed', (error as { code?: unknown })?.code);
    }

    throw error;
  }
}
