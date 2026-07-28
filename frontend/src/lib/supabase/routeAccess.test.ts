import assert from 'node:assert/strict';
import test from 'node:test';
import { isPublicPath } from './routeAccess';

test('keeps public and authentication routes available', () => {
  for (const path of [
    '/',
    '/pricing',
    '/pricing/start',
    '/auth/login',
    '/robots.txt',
    '/sitemap.xml',
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
