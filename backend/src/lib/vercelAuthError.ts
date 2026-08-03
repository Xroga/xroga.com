/**
 * Vercel deploy failures that mean "reconnect", not "your code is broken".
 *
 * Production run `85681d10`, prompt "build a landing page of dental clinic". The code
 * was generated and the GitHub push succeeded. Then the user was handed this as the
 * reason nothing went live:
 *
 *   Vercel deploy failed: Vercel: Vercel deploy failed: 403
 *   {"error":{"code":"forbidden","message":"Not authorized","invalidToken":true}}
 *
 * Three things wrong with that. It is a raw API blob, so nobody can act on it. The
 * prefix is duplicated, because the message was wrapped twice on its way up. And it
 * buries the one fact that matters: `invalidToken: true` means the stored Vercel
 * authorization is dead — expired, revoked, or belonging to a disconnected account. No
 * amount of rebuilding will fix it, and the user is the only one who can.
 *
 * Detection is on the shape of the failure — an auth status code, or Vercel's own
 * `invalidToken` marker — rather than on a list of message strings, because Vercel's
 * wording is theirs to change.
 */

/** Vercel's own signal that the bearer token was rejected. */
const INVALID_TOKEN = /"?invalidToken"?\s*:\s*true|\binvalid[_ ]?token\b/i;
/** The HTTP statuses that mean "who are you", as they appear in our thrown messages. */
const AUTH_STATUS = /\b(401|403)\b/;
const AUTH_WORDS = /not authorized|unauthorized|forbidden|token (?:expired|revoked|invalid)/i;

export function isVercelAuthFailure(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error ?? '');
  if (!text) return false;
  if (INVALID_TOKEN.test(text)) return true;
  return AUTH_STATUS.test(text) && AUTH_WORDS.test(text);
}

/**
 * The user-facing reason, when the failure is an authorization one.
 *
 * Says what happened, says what is safe, and gives exactly one action. It deliberately
 * mentions the GitHub repository when there is one: on this run the code *was* pushed,
 * and a person reading "deploy failed" with no other context reasonably assumes their
 * work is gone.
 */
export function describeVercelAuthFailure(opts: { githubRepoName?: string | null } = {}): string {
  const safe = opts.githubRepoName
    ? ` Your code is safe — it was pushed to ${opts.githubRepoName}.`
    : '';
  return `Vercel rejected our authorization, so the deployment could not start. Reconnect Vercel in Integrations and run this again — nothing else needs changing.${safe}`;
}

/**
 * One readable line for any deploy failure.
 *
 * Non-auth failures keep their detail, trimmed and with the duplicated
 * "Vercel deploy failed:" prefixes collapsed. A raw response body is still more useful
 * than nothing when the cause is a real build error, but it should appear once.
 */
export function describeVercelDeployFailure(
  error: unknown,
  opts: { githubRepoName?: string | null } = {},
): string {
  if (isVercelAuthFailure(error)) return describeVercelAuthFailure(opts);
  const raw = (error instanceof Error ? error.message : String(error ?? '')).trim();
  const collapsed = raw.replace(/^(?:Vercel:?\s*)?(?:Vercel deploy failed:\s*)+/i, '').trim();
  const detail = collapsed || 'no detail returned';
  return `Vercel deploy failed — ${detail.slice(0, 240)}`;
}
