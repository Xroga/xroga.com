/**
 * Provision the rows a user needs the first time we see them, and never again.
 *
 * Why this exists
 * ---------------
 * `ensureUserRecords` was called from the auth middleware on *every* authenticated
 * request. Its cheapest possible path is three sequential SELECTs — `profiles`,
 * `user_actions`, `user_token_usage` — so a single page load that issues a dozen
 * API calls performed thirty-six reads whose only purpose was to confirm rows that
 * had existed since the user signed up. Those three tables are exactly three of the
 * five that Supabase flagged as hot.
 *
 * What this changes
 * -----------------
 * Provisioning is now a once-per-process-per-user operation. After the rows are
 * confirmed present, the user is recorded here and the reads stop. This is a cache
 * of *existence*, not of identity, permission, plan tier, quota or balance:
 *
 *   - Nothing here decides what a user may do.
 *   - No route reads plan or quota from here; billing and action limits continue to
 *     query live rows on every request, as before.
 *   - The only claim held is "these rows exist", which is monotonic. Rows are created,
 *     never deleted, while a user is active. A stale entry cannot grant anything.
 *
 * On account deletion the entry is dropped explicitly (`forgetProvisionedUser`) so a
 * user who deletes and re-creates an account is provisioned again.
 *
 * The cache is per-process and in-memory: a deploy or restart clears it, and each
 * instance re-verifies once per user. That is the correct failure direction — worst
 * case we do the old work once more, never less than once.
 */

import { recordSupabaseCall } from '../lib/supabaseCallCounters.js';

/** userId → epoch ms at which provisioning was confirmed. */
const provisioned = new Map<string, number>();

/**
 * Re-verify periodically so a row deleted out-of-band (manual DB surgery, a failed
 * migration) is healed without needing a deploy. Long enough that steady-state
 * traffic performs no reads; short enough that a mistake self-corrects same-day.
 */
const REVERIFY_AFTER_MS = 6 * 60 * 60 * 1000;

/** Bound memory on an instance that serves many users before restarting. */
const MAX_TRACKED_USERS = 50_000;

export function isUserProvisioned(userId: string): boolean {
  const at = provisioned.get(userId);
  if (at === undefined) return false;
  if (Date.now() - at > REVERIFY_AFTER_MS) {
    provisioned.delete(userId);
    return false;
  }
  return true;
}

export function markUserProvisioned(userId: string): void {
  if (provisioned.size >= MAX_TRACKED_USERS) {
    // Oldest-first eviction. Evicting simply costs one more provisioning check.
    const oldest = provisioned.keys().next();
    if (!oldest.done) provisioned.delete(oldest.value);
  }
  provisioned.set(userId, Date.now());
  recordSupabaseCall({ table: 'provisioning', operation: 'select', outcome: 'ok' });
}

/** Called on account deletion so a re-created account provisions cleanly. */
export function forgetProvisionedUser(userId: string): void {
  provisioned.delete(userId);
}

/** Records that a request avoided provisioning reads entirely. */
export function recordProvisioningSkipped(): void {
  recordSupabaseCall({ table: 'provisioning', operation: 'select', outcome: 'skipped_cache' });
}

/** Test-only. */
export function resetProvisioningCache(): void {
  provisioned.clear();
}
