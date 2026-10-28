const COOKIE_NAME = 'xroga_oauth_next';

export function safeAuthNextPath(value: string | null | undefined, fallback = '/workspace'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || /[\r\n]/.test(value)) return fallback;
  return value;
}

/** Navigation hint only, never authorization. A fixed callback URL stays allowlisted. */
export function rememberOAuthNextPath(next: string): void {
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(safeAuthNextPath(next))}; Path=/auth/callback; Max-Age=600; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
}

export const OAUTH_NEXT_COOKIE = COOKIE_NAME;
