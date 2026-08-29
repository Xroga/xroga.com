import assert from 'node:assert/strict';
import test from 'node:test';
import { isPublicPath } from './routeAccess';

test('keeps public and authentication routes available', () => {
  for (const path of [
    '/',
    '/pricing',
    '/pricing/start',
    '/community',
    '/community/9d0c98dc-6c8c-4f24-8a2b-4ddd50ed802e',
    '/docs/getting-started',
    // `/crypto`, the page that exists. This asserted `/crypto-builder`, a route with
    // no page behind it, and never checked the real one — so the list stayed green
    // while the actual crypto page sat behind the login wall. `/crypto-builder` does
    // not need to be public: `next.config.mjs` redirects it at the routing layer,
    // before middleware sees it.
    '/crypto',
    '/video',
    '/research/web3-hackathon-winning-patterns',
    '/showcase',
    '/showcase/modern-business-website',
    '/showcase/modern-business-website/preview',
    '/share/7oDqnyDV8wIz7adMKh2tOYfJdViwN3Ks',
    '/auth/login',
    '/robots.txt',
    '/sitemap.xml',
    '/llms.txt',
    '/opengraph-image',
    '/manifest.webmanifest',
    '/api/session',
    '/api/release',
    '/api/showcase/aura/chat',
    '/api/showcase/aura/health',
  ]) {
    assert.equal(isPublicPath(path), true, path);
  }
});

test('keeps application and API routes protected', () => {
  for (const path of [
    '/dashboard',
    '/dashboard/operations',
    '/api/operations/portfolio',
    '/settings',
  ]) {
    assert.equal(isPublicPath(path), false, path);
  }
});
