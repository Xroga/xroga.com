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
    '/crypto-hackathon-builder',
    '/research/web3-hackathon-winning-patterns',
    '/auth/login',
    '/robots.txt',
    '/sitemap.xml',
    '/llms.txt',
    '/api/session',
    '/api/release',
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
