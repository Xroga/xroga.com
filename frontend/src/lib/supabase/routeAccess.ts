/**
 * Application surfaces that require a signed-in user.
 *
 * Keep this as a protected allowlist rather than a public allowlist. Unknown document
 * paths must reach Next's router so they can produce a real 404; treating every unknown
 * path as private turns misspelled and hallucinated URLs into misleading login redirects.
 */
const PROTECTED_PREFIXES = [
  '/admin',
  '/dashboard',
  '/onboarding',
  '/preview',
  '/settings',
  '/terminal',
  '/workspace',
];

const PUBLIC_API_PATHS = new Set([
  '/api/session',
  '/api/release',
  '/api/showcase/aura/chat',
  '/api/showcase/aura/health',
]);

/**
 * Whether the middleware has to ask the auth server who the visitor is.
 *
 * It used to ask on every request that reached the middleware, then throw the answer
 * away for public pages. For a signed-out visitor that costs nothing — there is no
 * token to check — but a signed-in reader paid a round trip to the auth server on
 * every navigation *and* on every RSC prefetch, including `/terms`, `/robots.txt` and
 * the docs, where the result could not change the response.
 *
 * `/auth` is deliberately not in that saving. It is a public prefix, but the answer
 * decides something there: a signed-in visitor is sent on to the app rather than
 * shown the login form again.
 *
 * Skipping the lookup also skips the session-cookie refresh that comes with it, which
 * is safe here because the browser client owns that too — it is created with
 * `createBrowserClient`, whose `autoRefreshToken` defaults on.
 */
export function requiresUserLookup(pathname: string): boolean {
  if (pathname.startsWith('/auth')) return true;
  return !isPublicPath(pathname);
}

export function isPublicPath(pathname: string): boolean {
  if (pathname === '/') return true;
  // This route reports authenticated=false as JSON; middleware must not replace
  // that contract with an HTML login redirect for signed-out callers.
  if (pathname.startsWith('/api/')) return PUBLIC_API_PATHS.has(pathname);
  if (pathname === '/robots.txt' || pathname === '/sitemap.xml' || pathname === '/llms.txt' || pathname === '/opengraph-image' || pathname === '/manifest.webmanifest') return true;
  if (pathname.startsWith('/auth')) return true;
  return !PROTECTED_PREFIXES.some((prefix) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}
