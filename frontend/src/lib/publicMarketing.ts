export const PUBLIC_MARKETING_NAV = [
  { href: '/features', label: 'Product' },
  { href: '/build', label: 'Build' },
  { href: '/integrations', label: 'Connect' },
  { href: '/ai-coding-agent', label: 'Develop' },
  { href: '/showcase', label: 'Explore' },
  { href: '/pricing', label: 'Pricing' },
] as const;

export const PRIVATE_PREFIXES = [
  '/workspace',
  '/dashboard',
  '/admin',
  '/settings',
  '/drive',
  '/auth',
  '/onboarding',
  '/share',
  '/ref',
  '/os-preview',
] as const;

/**
 * The public marketing site has exactly one appearance: the approved Xroga dark (Black Titanium) theme. A theme the
 * visitor chose inside the workspace stays stored and is used there; it is never applied to these routes.
 */
export const MARKETING_THEME = 'black' as const;

/** Public pages receive the brand system; application and private surfaces never do. */
export function isPublicMarketingPath(pathname: string): boolean {
  if (/^\/showcase\/[^/]+\/preview(?:\/|$)/.test(pathname)) return false;
  return !PRIVATE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * These pages already intentionally expose an atmospheric image canvas. Keeping this
 * allowlist explicit prevents article, documentation, pricing, table and legal routes
 * from acquiring decorative imagery merely because they use the public chrome.
 *
 * The homepage is not on the list: every section paints its own black/graphite
 * environment (S00 hero through the graphite horizon above the footer), so the theme
 * artwork is never requested there and cannot show through margins or the footer.
 */
const IMAGE_BACKGROUND_PATHS = new Set([
  '/about',
  '/ai-app-builder',
  '/ai-coding-agent',
  '/image',
  '/software',
]);

export function hasPublicImageBackground(pathname: string): boolean {
  return IMAGE_BACKGROUND_PATHS.has(pathname);
}

export const PUBLIC_THEME_BACKGROUNDS = {
  black: {
    desktop: '/backgrounds/xroga-black-portal-hero.webp',
    mobile: '/backgrounds/xroga-black-portal-hero-mobile.webp',
  },
  white: {
    desktop: '/backgrounds/xroga-light-clouds-bg.png',
    mobile: '/backgrounds/xroga-light-clouds-bg-mobile.webp',
  },
  gray: {
    desktop: '/backgrounds/xroga-gray-code-city-bg.webp',
    mobile: '/backgrounds/xroga-gray-code-city-bg-mobile.webp',
  },
  beige: {
    desktop: '/backgrounds/xroga-beige-mars-pyramids-code-bg.webp',
    mobile: '/backgrounds/xroga-beige-mars-pyramids-code-bg-mobile.webp',
  },
} as const;
