import { nextRedirects } from './redirects.mjs';
import { readFileSync } from 'node:fs';
import { resolveAuthBuildConfiguration } from './src/lib/supabase/authBuildRealm.mjs';
import {browserProxyHeaders,imageProxyHeaders} from './src/lib/untrustedProxyResponsePolicy.mjs';
const stagingManifest=process.env.XROGA_STAGING_AUTH_BUILD==='1'?JSON.parse(readFileSync(process.env.XROGA_STAGING_MANIFEST_PATH??'', 'utf8')):undefined;
const authBuildConfiguration = resolveAuthBuildConfiguration(process.env,stagingManifest);

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

// Xroga Drive uploads go straight from the browser to the private R2 bucket through short-lived signed URLs. Allow exactly that bucket's
// origin (never a wildcard) and only when the Drive screen is switched on; the bucket's own CORS rules still limit methods and origins.
const driveStorageOrigin = process.env.NEXT_PUBLIC_XROGA_DRIVE === '1'
  ? 'https://xroga-drive-prod.f14d36fd540c59ad410272122edc1a7e.r2.cloudflarestorage.com'
  : null;

const connectSources = (authBuildConfiguration.projectRef==='self-hosted-staging' ? [
  "'self'", configuredApiOrigin, authBuildConfiguration.url,
  authBuildConfiguration.url.replace(/^https:/,'wss:'),
] : [
  "'self'",
  'https://api.xroga.com',
  'wss://api.xroga.com',
  'https://*.supabase.co',
  'wss://*.supabase.co',
  'https://api.github.com',
  'https://api.vercel.com',
  'https://*.google-analytics.com',
  'https://*.analytics.google.com',
  'https://www.googletagmanager.com',
  'https://*.clarity.ms',
  'https://c.bing.com',
  'https://analytics.ahrefs.com',
  configuredApiOrigin,
  driveStorageOrigin,
  ...(authBuildConfiguration.projectRef === 'local-disposable' ? ['http://127.0.0.1:54321', 'ws://127.0.0.1:54321'] : []),
]).filter(Boolean).join(' ');

const scriptSources = [
  "'self'",
  "'unsafe-inline'",
  'https://www.googletagmanager.com',
  'https://www.clarity.ms',
  'https://*.clarity.ms',
  'https://analytics.ahrefs.com',
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

// Next's configured headers can replace route headers. Keep each proxy's
// sandbox effective without changing the policy of any application document.
/** @param {Readonly<Record<string,string>>} policy */
const proxySecurityHeaders = (policy) => [
  ...baseSecurityHeaders.filter(header=>!Object.keys(policy).some(key=>key.toLowerCase()===header.key.toLowerCase())),
  ...Object.entries(policy).map(([key,value])=>({key,value})),
];

const freshMarketingHeaders = [
  ...securityHeaders,
  { key: 'Cache-Control', value: 'no-store, max-age=0' },
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
const CRYPTO_SHOWCASE_SOURCE = '/showcase/black-hole-vinfinity-crypto';
const CLARITY_DEMO_SOURCE = '/demos/xroga-clarity-workflow.html';
const BROWSER_EMPLOYEES_DEMO_SOURCE = '/demos/xroga-browser-employees-exact.html';
const NON_PREVIEW_SOURCE = '/((?!(?:$|about$|api/(?:browser-view|image-fetch)/?$|showcase/[^/]+/preview$|showcase/black-hole-vinfinity-crypto$|demos/xroga-clarity-workflow[.]html$|demos/xroga-browser-employees-exact[.]html$)).*)';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next inlines this validated public issuer in both server and browser builds.
  // Runtime hosting URLs/body/query parameters cannot redirect credentials.
  env: { NEXT_PUBLIC_XROGA_AUTH_PROJECT_REF: authBuildConfiguration.projectRef,NEXT_PUBLIC_XROGA_AUTH_BASE_URL:authBuildConfiguration.url },
  webpack(config, { isServer, webpack }) {
    if (!isServer) {
      // PptxGenJS guards these Node-only imports at runtime, but webpack still
      // attempts to resolve their node: specifiers in the browser bundle.
      config.plugins.push(new webpack.IgnorePlugin({ resourceRegExp: /^node:(fs|https)$/ }));
    }
    return config;
  },
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
      { source: '/', headers: freshMarketingHeaders },
      { source: '/about', headers: freshMarketingHeaders },
      { source: '/api/browser-view', headers: proxySecurityHeaders(browserProxyHeaders) },
      { source: '/api/image-fetch', headers: proxySecurityHeaders(imageProxyHeaders) },
      { source: PREVIEW_SOURCE, headers: framableSecurityHeaders },
      { source: CRYPTO_SHOWCASE_SOURCE, headers: framableSecurityHeaders },
      { source: CLARITY_DEMO_SOURCE, headers: framableSecurityHeaders },
      { source: BROWSER_EMPLOYEES_DEMO_SOURCE, headers: framableSecurityHeaders },
      { source: NON_PREVIEW_SOURCE, headers: securityHeaders },
    ];
  },
  async redirects() {
    return nextRedirects();
  },
};

export default nextConfig;
