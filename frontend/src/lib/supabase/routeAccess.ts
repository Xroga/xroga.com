/** Routes that remain available when authentication is not configured or unavailable. */
const PUBLIC_PREFIXES = [
  '/features',
  '/integrations',
  '/droga',
  '/pricing',
  '/about',
  '/contact',
  '/docs',
  '/community',
  '/research',
  // `/crypto`, not `/crypto-builder`. The route here named a page that has never
  // existed, so the real crypto page was not on this list — a public marketing page
  // that bounced every signed-out visitor to the login screen.
  '/crypto',
  '/game-builder',
  '/video',
  '/ai-coding-agent',
  '/ai-app-builder',
  '/software',
  '/ai-website-builder',
  '/build-saas-with-ai',
  '/github-ai-coding-agent',
  '/vercel-ai-deployment',
  '/terms',
  '/privacy',
  '/refund',
  // Anyone may browse and preview the showcase; only customizing or exporting needs auth.
  '/showcase',
  // Opaque private links and public message shares must open without an account.
  '/share',
];

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
  if (
    pathname === '/api/session' ||
    pathname === '/api/release' ||
    pathname === '/api/showcase/aura/chat' ||
    pathname === '/api/showcase/aura/health'
  ) return true;
  if (pathname === '/robots.txt' || pathname === '/sitemap.xml' || pathname === '/llms.txt' || pathname === '/opengraph-image' || pathname === '/manifest.webmanifest') return true;
  if (pathname.startsWith('/auth')) return true;
  return PUBLIC_PREFIXES.some((prefix) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}
