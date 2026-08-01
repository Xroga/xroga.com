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
  '/crypto-builder',
  '/game-builder',
  '/ai-coding-agent',
  '/ai-app-builder',
  '/ai-website-builder',
  '/build-saas-with-ai',
  '/github-ai-coding-agent',
  '/vercel-ai-deployment',
  '/terms',
  '/privacy',
  '/refund',
  // Anyone may browse and preview the showcase; only customizing or exporting needs auth.
  '/showcase',
];

export function isPublicPath(pathname: string): boolean {
  if (pathname === '/') return true;
  // This route reports authenticated=false as JSON; middleware must not replace
  // that contract with an HTML login redirect for signed-out callers.
  if (pathname === '/api/session' || pathname === '/api/release') return true;
  if (pathname === '/robots.txt' || pathname === '/sitemap.xml' || pathname === '/llms.txt') return true;
  if (pathname.startsWith('/auth')) return true;
  return PUBLIC_PREFIXES.some((prefix) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}
