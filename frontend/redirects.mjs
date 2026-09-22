/** Central redirect registry shared by Next routing and Growth OS audits. */
/** @type {Array<[string, string, boolean, string]>} */
const redirectRows = [
  ['/crypto-hackathon-builder', '/crypto', true, 'Broader crypto builder positioning'],
  ['/crypto-builder', '/crypto', true, 'Repair the historical redirect destination'],
  ['/login', '/auth/login', true, 'Canonical authentication route'],
  ['/signin', '/auth/login', true, 'Canonical authentication route'],
  ['/signup', '/auth/signup', true, 'Canonical authentication route'],
  ['/register', '/auth/signup', true, 'Canonical authentication route'],
  ['/sign-up', '/auth/signup', true, 'Canonical authentication route'],
  ['/sign-in', '/auth/login', true, 'Canonical authentication route'],
  ['/droga', '/about', true, 'Brand misspelling with an unambiguous destination'],
  ['/droga-ai', '/about', true, 'Brand misspelling with an unambiguous destination'],
  ['/drogaai', '/about', true, 'Brand misspelling with an unambiguous destination'],
  ['/roga', '/about', true, 'Brand misspelling with an unambiguous destination'],
  ['/roga-ai', '/about', true, 'Brand misspelling with an unambiguous destination'],
  ['/zroga', '/about', true, 'Brand misspelling with an unambiguous destination'],
  ['/zroga-ai', '/about', true, 'Brand misspelling with an unambiguous destination'],
  ['/xroga-ai', '/', true, 'Canonical home route'],
  ['/ai-image-generator', '/ai-app-builder', true, 'Retired feature route'],
  ['/ai-image-generation', '/ai-app-builder', true, 'Retired feature route'],
  ['/ai-chat', '/ai-coding-agent', true, 'Retired feature route'],
  ['/github-deploy', '/github-ai-coding-agent', true, 'Canonical capability route'],
  ['/vercel-deploy', '/vercel-ai-deployment', true, 'Canonical capability route'],
  ['/netlify-deploy', '/vercel-ai-deployment', true, 'Retired deployment route'],
  ['/ai-debugging', '/ai-coding-agent', true, 'Canonical capability route'],
  ['/build-apps', '/ai-app-builder', true, 'Canonical capability route'],
  ['/features/ai-image-generation', '/ai-app-builder', true, 'Retired feature route'],
  ['/features/ai-video-generation', '/ai-app-builder', true, 'Retired feature route'],
  ['/features/build-websites-apps-games', '/ai-app-builder', true, 'Canonical capability route'],
  ['/features/code-debugging', '/ai-coding-agent', true, 'Canonical capability route'],
  ['/features/github-auto-deploy', '/github-ai-coding-agent', true, 'Canonical capability route'],
  ['/features/vercel-netlify-deploy', '/vercel-ai-deployment', true, 'Canonical capability route'],
  ['/features/browser-automation', '/ai-coding-agent', true, 'Canonical capability route'],
  ['/features/xroga-workspace', '/ai-coding-agent', true, 'Canonical capability route'],
  ['/features/community-hub', '/community', true, 'Canonical community route'],
  ['/features/earn-xrg-referrals', '/pricing', true, 'Retired referral route'],
  ['/features/integrations', '/integrations', true, 'Canonical integrations route'],
];

export const redirectRegistry = redirectRows.map(([source, destination, permanent, reason]) => ({
  source,
  destination,
  permanent,
  reason,
  createdAt: '2026-09-22',
  reviewDue: permanent ? null : '2026-10-22',
  evidence: 'frontend route history',
}));

export function nextRedirects() {
  return redirectRegistry.map(({ source, destination, permanent }) => ({ source, destination, permanent }));
}
