export const PUBLIC_MARKETING_NAV = [
  { href: '/features', label: 'Product' },
  { href: '/ai-app-builder', label: 'AI App Builder' },
  { href: '/ai-coding-agent', label: 'AI Coding Agent' },
  { href: '/showcase', label: 'Showcase' },
  { href: '/docs', label: 'Docs' },
  { href: '/pricing', label: 'Pricing' },
] as const;

const PRIVATE_PREFIXES = [
  '/workspace',
  '/dashboard',
  '/admin',
  '/settings',
  '/auth',
  '/onboarding',
  '/share',
  '/ref',
] as const;

/** Public pages receive the brand system; application and private surfaces never do. */
export function isPublicMarketingPath(pathname: string): boolean {
  if (/^\/showcase\/[^/]+\/preview(?:\/|$)/.test(pathname)) return false;
  return !PRIVATE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * These pages already intentionally expose an atmospheric image canvas. Keeping this
 * allowlist explicit prevents article, documentation, pricing, table and legal routes
 * from acquiring decorative imagery merely because they use the public chrome.
 */
const IMAGE_BACKGROUND_PATHS = new Set([
  '/',
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
