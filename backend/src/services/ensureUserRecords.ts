import {
  getApiBudgetUsd,
} from '../config/plans.js';

import {
  getSupabaseAdmin,
} from '../config/supabase.js';

import {
  recordSupabaseCall,
} from '../lib/supabaseCallCounters.js';

import {
  isUserProvisioned,
  markUserProvisioned,
  recordProvisioningSkipped,
} from './userProvisioningCache.js';


function currentPeriodStart(): string {
  const now =
    new Date();

  return (
    `${now.getUTCFullYear()}-${
      String(
        now.getUTCMonth() + 1,
      ).padStart(
        2,
        '0',
      )
    }-01`
  );
}


/**
 * Collapses concurrent first-request
 * provisioning for one user into one pass.
 */
const inFlight =
  new Map<
    string,
    Promise<void>
  >();


/**
 * Ensures the durable profile and
 * usage-accounting record exist after auth.
 *
 * Legacy action balances are deliberately
 * not provisioned here.
 *
 * Xroga usage is handled by:
 *
 * - user_token_usage
 * - xroga_billing_cycles
 * - provider budget reservation/settlement
 *
 * Once records are known to exist,
 * userProvisioningCache avoids unnecessary
 * repeat reads.
 */
export async function ensureUserRecords(
  userId:
    string,

  email?:
    string,
): Promise<void> {

  if (
    isUserProvisioned(
      userId,
    )
  ) {
    recordProvisioningSkipped();

    return;
  }


  const existing =
    inFlight.get(
      userId,
    );


  if (
    existing
  ) {
    return existing;
  }


  const pending =
    provisionUserRecords(
      userId,
      email,
    )
      .finally(
        () => {
          inFlight.delete(
            userId,
          );
        },
      );


  inFlight.set(
    userId,
    pending,
  );


  return pending;
}


async function provisionUserRecords(
  userId:
    string,

  email?:
    string,
): Promise<void> {

  const supabase =
    getSupabaseAdmin();


  /*
   * -------------------------
   * PROFILE
   * -------------------------
   */

  const {
    data:
      profile,

    error:
      profileSelectError,
  } =
    await supabase
      .from(
        'profiles',
      )
      .select(
        'id',
      )
      .eq(
        'id',
        userId,
      )
      .maybeSingle();


  recordSupabaseCall({
    table:
      'profiles',

    operation:
      'select',

    outcome:
      profileSelectError
        ? 'error'
        : 'ok',
  });


  if (
    profileSelectError
  ) {
    throw profileSelectError;
  }


  if (
    !profile
  ) {
    const {
      error:
        profileInsertError,
    } =
      await supabase
        .from(
          'profiles',
        )
        .upsert(
          {
            id:
              userId,

            display_name:
              email
                ?.split(
                  '@',
                )[0] ??
              'User',
          },
          {
            onConflict:
              'id',

            ignoreDuplicates:
              true,
          },
        );


    recordSupabaseCall({
      table:
        'profiles',

      operation:
        'upsert',

      outcome:
        profileInsertError
          ? 'error'
          : 'ok',
    });


    if (
      profileInsertError
    ) {
      throw profileInsertError;
    }
  }


  /*
   * -------------------------
   * USAGE ACCOUNTING
   * -------------------------
   */

  const period =
    currentPeriodStart();


  const {
    data:
      tokenRow,

    error:
      tokenSelectError,
  } =
    await supabase
      .from(
        'user_token_usage',
      )
      .select(
        'user_id, plan_tier',
      )
      .eq(
        'user_id',
        userId,
      )
      .maybeSingle();


  recordSupabaseCall({
    table:
      'user_token_usage',

    operation:
      'select',

    outcome:
      tokenSelectError
        ? 'error'
        : 'ok',
  });


  if (
    tokenSelectError
  ) {
    throw tokenSelectError;
  }


  /*
   * New users begin on Free.
   *
   * A successful Pro payment later changes
   * plan_tier and budget through the billing
   * entitlement flow / syncPlanBudget.
   *
   * NEVER overwrite an existing row with
   * zeros because that could erase real usage.
   */
  if (
    !tokenRow
  ) {
    const planTier =
      'free';


    const {
      error:
        tokenInsertError,
    } =
      await supabase
        .from(
          'user_token_usage',
        )
        .upsert(
          {
            user_id:
              userId,

            input_tokens:
              0,

            output_tokens:
              0,

            emergency_bonus:
              0,

            bonus_tokens:
              0,

            spent_usd:
              0,

            rollover_usd:
              0,

            plan_budget_usd:
              getApiBudgetUsd(
                planTier,
              ),

            plan_tier:
              planTier,

            quota_period_start:
              period,

            updated_at:
              new Date()
                .toISOString(),
          },
          {
            onConflict:
              'user_id',

            ignoreDuplicates:
              true,
          },
        );


    recordSupabaseCall({
      table:
        'user_token_usage',

      operation:
        'upsert',

      outcome:
        tokenInsertError
          ? 'error'
          : 'ok',
    });


    if (
      tokenInsertError
    ) {
      throw tokenInsertError;
    }
  }


  /*
   * Every required durable record is now
   * present. If anything above throws,
   * the user remains unmarked so the
   * next request retries provisioning.
   */
  markUserProvisioned(
    userId,
  );
}
