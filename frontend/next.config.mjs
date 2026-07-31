const configuredApiOrigin = (() => {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_API_URL ?? '');
    const isSafe = url.protocol === 'https:' ||
      (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname));
    return isSafe ? url.origin : null;
  } catch {
    return null;
  }
})();

const connectSources = [
  "'self'",
  'https://xroga-api.fly.dev',
  'wss://xroga-api.fly.dev',
  'https://*.supabase.co',
  'wss://*.supabase.co',
  'https://api.github.com',
  'https://api.vercel.com',
  configuredApiOrigin,
].filter(Boolean).join(' ');

const scriptSources = [
  "'self'",
  "'unsafe-inline'",
  ...(process.env.NODE_ENV === 'development' ? ["'unsafe-eval'"] : []),
].join(' ');

const csp = (frameAncestors) =>
  `default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors ${frameAncestors}; object-src 'none'; script-src ${scriptSources}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; media-src 'self' data: blob: https:; connect-src ${connectSources}; frame-src 'self' https:; worker-src 'self' blob:`;

const baseSecurityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
];

const securityHeaders = [
  ...baseSecurityHeaders,
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: csp("'none'") },
];

/**
 * Showcase product previews are the one surface we frame ourselves: the cards and
 * the device preview embed the real route so they can never advertise something the
 * product does not render.
 *
 * Relaxing this to `'self'` is safe for these paths specifically. A preview page is
 * public, carries no session or account state, is `noindex`, and contains no action
 * that affects a user's account — so there is nothing for a clickjacker to hijack.
 * Third-party framing is still refused, and every other route keeps DENY / 'none'.
 */
const framableSecurityHeaders = [
  ...baseSecurityHeaders,
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Content-Security-Policy', value: csp("'self'") },
];

// Exactly one rule must match any given path, so the catch-all excludes the
// preview paths rather than relying on header-override ordering.
const PREVIEW_SOURCE = '/showcase/:slug/preview';
const NON_PREVIEW_SOURCE = '/((?!showcase/[^/]+/preview$).*)';

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'i.postimg.cc' },
      { protocol: 'https', hostname: 'api.dicebear.com' },
      { protocol: 'https', hostname: 'i.pinimg.com' },
      { protocol: 'https', hostname: 'cdn.simpleicons.org' },
      { protocol: 'https', hostname: 'www.google.com' },
    ],
  },
  async headers() {
    return [
      { source: PREVIEW_SOURCE, headers: framableSecurityHeaders },
      { source: NON_PREVIEW_SOURCE, headers: securityHeaders },
    ];
  },
  async redirects() {
    return [
      // The crypto page is now positioned as a broader Crypto Builder, not a
      // hackathon-only page. The old URL is kept as a permanent redirect so existing
      // links and indexed results still resolve, and it renders no duplicate page.
      { source: '/crypto-hackathon-builder', destination: '/crypto-builder', permanent: true },
      { source: '/login', destination: '/auth/login', permanent: true },
      { source: '/signin', destination: '/auth/login', permanent: true },
      { source: '/signup', destination: '/auth/signup', permanent: true },
      { source: '/register', destination: '/auth/signup', permanent: true },
      { source: '/sign-up', destination: '/auth/signup', permanent: true },
      { source: '/sign-in', destination: '/auth/login', permanent: true },
      { source: '/droga', destination: '/about', permanent: true },
      { source: '/droga-ai', destination: '/about', permanent: true },
      { source: '/drogaai', destination: '/about', permanent: true },
      { source: '/roga', destination: '/about', permanent: true },
      { source: '/roga-ai', destination: '/about', permanent: true },
      { source: '/zroga', destination: '/about', permanent: true },
      { source: '/zroga-ai', destination: '/about', permanent: true },
      { source: '/xroga-ai', destination: '/', permanent: true },
      { source: '/ai-image-generator', destination: '/ai-app-builder', permanent: true },
      { source: '/ai-image-generation', destination: '/ai-app-builder', permanent: true },
      { source: '/ai-chat', destination: '/ai-coding-agent', permanent: true },
      { source: '/github-deploy', destination: '/github-ai-coding-agent', permanent: true },
      { source: '/vercel-deploy', destination: '/vercel-ai-deployment', permanent: true },
      { source: '/netlify-deploy', destination: '/vercel-ai-deployment', permanent: true },
      { source: '/ai-debugging', destination: '/ai-coding-agent', permanent: true },
      { source: '/build-apps', destination: '/ai-app-builder', permanent: true },
      { source: '/features/ai-image-generation', destination: '/ai-app-builder', permanent: true },
      { source: '/features/ai-video-generation', destination: '/ai-app-builder', permanent: true },
      { source: '/features/ai-chat', destination: '/ai-coding-agent', permanent: true },
      { source: '/features/build-websites-apps-games', destination: '/ai-app-builder', permanent: true },
      { source: '/features/code-debugging', destination: '/ai-coding-agent', permanent: true },
      { source: '/features/github-auto-deploy', destination: '/github-ai-coding-agent', permanent: true },
      { source: '/features/vercel-netlify-deploy', destination: '/vercel-ai-deployment', permanent: true },
      { source: '/features/browser-automation', destination: '/ai-coding-agent', permanent: true },
      { source: '/features/xroga-workspace', destination: '/ai-coding-agent', permanent: true },
      { source: '/features/community-hub', destination: '/community', permanent: true },
      { source: '/features/earn-xrg-referrals', destination: '/pricing', permanent: true },
      { source: '/features/integrations', destination: '/integrations', permanent: true },
    ];
  },
};

export default nextConfig;
