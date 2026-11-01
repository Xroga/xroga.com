import type { CookieOptionsWithName } from '@supabase/ssr';

/** Build-approved Auth realm only, never a request parameter or tool setting.
 * __Host- prevents an untrusted Preview subdomain from injecting a parent-domain
 * session cookie. Browser, server and middleware must use this same storage key.
 * There is no fallback from the hosted key to the former unprefixed cookie.
 */
export function authCookieOptions(projectRef: string): Readonly<CookieOptionsWithName> {
  if (projectRef === 'local-disposable') {
    // Existing next.config admission confines this HTTP realm to isolated tests.
    return Object.freeze({ path: '/', sameSite: 'lax', secure: false });
  }
  if (!/^[a-z]{20}$/.test(projectRef) && projectRef !== 'self-hosted-staging') {
    throw new Error('Authentication cookie realm is invalid');
  }
  return Object.freeze({
    name: `__Host-sb-${projectRef}-auth-token`,
    path: '/',
    secure: true,
    sameSite: 'lax',
  });
}
