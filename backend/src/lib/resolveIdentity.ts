/**
 * Resolve the caller's identity from a bearer token without spending a Supabase
 * Auth round trip on every request.
 *
 * Why this exists
 * ---------------
 * The previous order was: call `supabase.auth.getUser(token)` first whenever a
 * service role key is configured (which is always, in production), and only fall
 * back to local verification if that failed. That made `/auth/v1/user` a hard
 * dependency of *every* authenticated request — roughly thirty route groups —
 * and it is the single largest contributor to the uncached egress overrun.
 *
 * What changed
 * ------------
 * Local verification now runs first. It is not a weaker check: `jwtVerify`
 * validates the RS256/HS256 signature against Supabase's own JWKS (or the project
 * JWT secret), the `iss` claim, the `aud` claim and the `exp` claim. A token that
 * passes has provably been minted by this Supabase project and has not expired.
 * The network call remains, unchanged, as the fallback for tokens local
 * verification cannot judge.
 *
 * The tradeoff, stated plainly
 * ----------------------------
 * `getUser` additionally reflects server-side revocation: a user who signs out or
 * is deleted is rejected immediately, whereas a locally-verified token stays
 * acceptable until its `exp`. Supabase access tokens are short-lived (one hour by
 * default), so the exposure is bounded by that lifetime. `REQUIRE_REMOTE_AUTH_CHECK`
 * restores the old always-remote behaviour if that bound is ever judged too loose
 * for a particular deployment.
 *
 * Nothing here caches an authorization decision. It caches nothing about *what a
 * user may do* — every route still evaluates permission itself, per request,
 * against live data. The only reuse is of in-flight remote verifications of a
 * byte-identical token, which collapses a stampede into one call and cannot
 * outlive the request that started it.
 */

import { createHash } from 'node:crypto';
import { getSupabaseAdmin } from '../config/supabase.js';
import { verifySupabaseAccessToken } from './verifyJwt.js';
import { recordSupabaseCall } from './supabaseCallCounters.js';

export interface ResolvedIdentity {
  userId: string;
  email?: string;
  /** How this identity was established — surfaced for counters and tests only. */
  via: 'local_jwt' | 'remote_getuser' | 'deduplicated';
}

/**
 * Set to '1' to force the pre-existing behaviour of verifying every request
 * against Supabase Auth. Costs one round trip per request; use only if immediate
 * revocation matters more than egress.
 */
function remoteCheckRequired(): boolean {
  return process.env.REQUIRE_REMOTE_AUTH_CHECK === '1';
}

/** Never key a map on the raw credential. */
function tokenFingerprint(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Concurrent requests carrying the same token share one remote verification.
 * Entries are deleted as soon as the promise settles, so nothing survives the
 * requests that created it.
 */
const inFlightRemote = new Map<string, Promise<ResolvedIdentity | null>>();

async function verifyRemotely(token: string): Promise<ResolvedIdentity | null> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null;

  const supabase = getSupabaseAdmin();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    recordSupabaseCall({ table: 'auth.users', operation: 'auth_verify', outcome: 'error' });
    if (error) console.warn('[auth] supabase.auth.getUser failed:', error.message);
    return null;
  }

  recordSupabaseCall({ table: 'auth.users', operation: 'auth_verify', outcome: 'ok' });
  return { userId: user.id, email: user.email, via: 'remote_getuser' };
}

function verifyRemotelyDeduplicated(token: string): Promise<ResolvedIdentity | null> {
  const fingerprint = tokenFingerprint(token);
  const existing = inFlightRemote.get(fingerprint);
  if (existing) {
    recordSupabaseCall({
      table: 'auth.users',
      operation: 'auth_verify',
      outcome: 'deduplicated',
    });
    return existing.then((result) =>
      result ? { ...result, via: 'deduplicated' as const } : null
    );
  }

  const pending = verifyRemotely(token).finally(() => {
    inFlightRemote.delete(fingerprint);
  });
  inFlightRemote.set(fingerprint, pending);
  return pending;
}

/**
 * Establish who is calling. Throws when the token cannot be trusted by any route.
 */
export async function resolveIdentity(token: string): Promise<ResolvedIdentity> {
  if (!process.env.SUPABASE_URL) {
    throw new Error('SUPABASE_URL must be set on Fly.io');
  }
  if (!token || token.length < 20) {
    throw new Error('Invalid or expired token');
  }

  if (!remoteCheckRequired()) {
    try {
      // Cryptographic verification: signature, issuer, audience and expiry.
      // No network call, so no egress, and no cached decision to go stale.
      const verified = await verifySupabaseAccessToken(token);
      recordSupabaseCall({
        table: 'auth.users',
        operation: 'auth_verify',
        outcome: 'skipped_cache',
      });
      return { userId: verified.userId, email: verified.email, via: 'local_jwt' };
    } catch {
      // Fall through: a token this server cannot verify locally still deserves
      // the authoritative answer before it is rejected.
    }
  }

  const remote = await verifyRemotelyDeduplicated(token);
  if (remote) return remote;

  // Reached when local verification could not judge the token and the remote check
  // declined it (or no service role key is configured to ask with). Either way the
  // token is not usable, and the message stays identical in both cases so it never
  // reveals which check rejected it.
  throw new Error(
    'Invalid or expired token. Sign out and sign in again to refresh your session.'
  );
}

/** Test-only: drop any in-flight sharing so cases start isolated. */
export function resetIdentityResolution(): void {
  inFlightRemote.clear();
}
