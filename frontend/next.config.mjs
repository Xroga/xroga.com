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

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  {
    key: 'Content-Security-Policy',
    value: `default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; media-src 'self' data: blob: https:; connect-src ${connectSources}; frame-src 'self' https:; worker-src 'self' blob:; upgrade-insecure-requests`,
  },
];

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
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
  async redirects() {
    return [
      { source: '/login', destination: '/auth/login', permanent: true },
      { source: '/signin', destination: '/auth/login', permanent: true },
      { source: '/signup', destination: '/auth/signup', permanent: true },
      { source: '/register', destination: '/auth/signup', permanent: true },
      { source: '/sign-up', destination: '/auth/signup', permanent: true },
      { source: '/sign-in', destination: '/auth/login', permanent: true },
      { source: '/droga-ai', destination: '/droga', permanent: true },
      { source: '/drogaai', destination: '/droga', permanent: true },
      { source: '/roga', destination: '/droga', permanent: true },
      { source: '/roga-ai', destination: '/droga', permanent: true },
      { source: '/zroga', destination: '/droga', permanent: true },
      { source: '/zroga-ai', destination: '/droga', permanent: true },
      { source: '/xroga-ai', destination: '/', permanent: true },
      { source: '/ai-image-generator', destination: '/features/ai-image-generation', permanent: true },
      { source: '/ai-image-generation', destination: '/features/ai-image-generation', permanent: true },
      { source: '/ai-chat', destination: '/features/ai-chat', permanent: true },
      { source: '/github-deploy', destination: '/features/github-auto-deploy', permanent: true },
      { source: '/vercel-deploy', destination: '/features/vercel-netlify-deploy', permanent: true },
      { source: '/netlify-deploy', destination: '/features/vercel-netlify-deploy', permanent: true },
      { source: '/ai-debugging', destination: '/features/code-debugging', permanent: true },
      { source: '/build-apps', destination: '/features/build-websites-apps-games', permanent: true },
    ];
  },
};

export default nextConfig;
