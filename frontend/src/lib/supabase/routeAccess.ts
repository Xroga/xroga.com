/** Routes that remain available when authentication is not configured or unavailable. */
const PUBLIC_PREFIXES = [
  '/features',
  '/integrations',
  '/droga',
  '/pricing',
  '/about',
  '/contact',
  '/docs',
  '/terms',
  '/privacy',
  '/refund',
];

export function isPublicPath(pathname: string): boolean {
  if (pathname === '/') return true;
  // This route reports authenticated=false as JSON; middleware must not replace
  // that contract with an HTML login redirect for signed-out callers.
  if (pathname === '/api/session' || pathname === '/api/release') return true;
  if (pathname === '/robots.txt' || pathname === '/sitemap.xml') return true;
  if (pathname.startsWith('/auth')) return true;
  return PUBLIC_PREFIXES.some((prefix) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}
