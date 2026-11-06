import { OAUTH_NEXT_COOKIE, safeAuthNextPath } from './oauthReturn';

/** Where a verified recovery lands, and the only place that marker is honoured. */
export const RECOVERY_PATH = '/auth/reset-password';
/** httpOnly marker set by the server callback after it verified a recovery link for one specific user. */
export const RECOVERY_COOKIE = 'xroga_recovery_ok';
export const RECOVERY_MAX_AGE_SECONDS = 15 * 60;

export interface CallbackAuth {
  exchangeCodeForSession(code: string): Promise<{ data: { user: { id: string } | null } | null; error: unknown }>;
  verifyOtp(input: { token_hash: string; type: 'recovery' }): Promise<{ data: { user: { id: string } | null } | null; error: unknown }>;
}

export type CallbackOutcome =
  | { kind: 'redirect'; path: string; recoveryUserId?: string; checkPhonePrompt: boolean }
  | { kind: 'failed'; path: string };

/**
 * One canonical redemption path for the auth callback. A reset link is redeemed exactly once, here, on the
 * server: either a PKCE `code`, or a `token_hash` whose type is `recovery`. Anything else fails closed.
 * The recovery marker is only issued when the verified link was bound for the reset page.
 */
export async function redeemAuthCallback(
  params: { code: string | null; tokenHash: string | null; type: string | null; next: string | null; cookieNext?: string },
  auth: CallbackAuth,
): Promise<CallbackOutcome> {
  const failed: CallbackOutcome = { kind: 'failed', path: '/auth/login?error=auth_callback_failed' };
  let decoded: string | undefined;
  try { decoded = params.cookieNext ? decodeURIComponent(params.cookieNext) : undefined; } catch { decoded = undefined; }
  const next = safeAuthNextPath(params.next ?? decoded, '/dashboard');
  const isRecoveryLink = Boolean(params.tokenHash) && params.type === 'recovery';
  if (!params.code && !isRecoveryLink) return failed;
  let result;
  try {
    result = params.code
      ? await auth.exchangeCodeForSession(params.code)
      : await auth.verifyOtp({ token_hash: params.tokenHash!, type: 'recovery' });
  } catch { return failed; }
  if (result.error) return failed;
  const userId = result.data?.user?.id;
  if (next === RECOVERY_PATH) {
    if (!userId) return failed;
    return { kind: 'redirect', path: RECOVERY_PATH, recoveryUserId: userId, checkPhonePrompt: false };
  }
  return { kind: 'redirect', path: next, checkPhonePrompt: true };
}

/** The reset form may open only for the user the callback verified, and only while the marker is fresh. */
export function recoveryReady(userId: string | null | undefined, marker: string | undefined): boolean {
  return Boolean(userId && marker && marker === userId);
}

export { OAUTH_NEXT_COOKIE };
