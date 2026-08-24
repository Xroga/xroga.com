/**
 * Where an OAuth round trip should come back to.
 *
 * GitHub's authorize leaves the tab entirely — `openGitHubOAuthPopup` assigns
 * `window.location` — and its callback then sends the reader to the integrations
 * page, which is right when that is where they started and wrong when they were
 * halfway through onboarding.
 *
 * A marker in `sessionStorage` rather than a query parameter or a change to the
 * backend's OAuth state: it survives the full round trip, it is scoped to the tab
 * that started it, and it leaves the provider's state parameter alone. It is cleared
 * as it is read, so a stale marker cannot capture a later, unrelated connect.
 */

const KEY = 'xroga-oauth-return';

/** Paths that may be returned to. An open redirect here would be an open redirect. */
const ALLOWED = ['/onboarding'];

export function rememberOAuthReturn(path: string): void {
  if (!ALLOWED.includes(path)) return;
  try {
    sessionStorage.setItem(KEY, path);
  } catch {
    /* private mode: the callback simply uses its default destination */
  }
}

/** Reads and clears. Returns null when nothing asked to be returned to. */
export function takeOAuthReturn(): string | null {
  try {
    const value = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return value && ALLOWED.includes(value) ? value : null;
  } catch {
    return null;
  }
}

/** Peek without consuming, for a caller deciding whether it owns this return. */
export function peekOAuthReturn(): string | null {
  try {
    const value = sessionStorage.getItem(KEY);
    return value && ALLOWED.includes(value) ? value : null;
  } catch {
    return null;
  }
}
