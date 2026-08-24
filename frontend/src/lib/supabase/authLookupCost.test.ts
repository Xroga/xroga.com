import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { isPublicPath, requiresUserLookup } from './routeAccess';

/**
 * Guards for the auth round trip the middleware makes.
 *
 * The middleware asked the auth server who the visitor was on every request that
 * reached it, then discarded the answer for public pages. A signed-out visitor pays
 * nothing for that — there is no token to check — but a signed-in reader paid a round
 * trip on every navigation *and* every RSC prefetch, including pages where the answer
 * could not change the response. Production logs showed the middleware running for
 * `/robots.txt`, `/terms`, `/privacy` and `/docs`.
 *
 * This file can import the predicate directly rather than reading source: routeAccess
 * has no imports of its own, so it resolves under `tsx --test` from the repo root
 * where the `@/` aliases are not in effect.
 */

const MIDDLEWARE = readFileSync(new URL('./middleware.ts', import.meta.url), 'utf8');
const MATCHER = readFileSync(new URL('../../middleware.ts', import.meta.url), 'utf8');

test('public content pages do not cost an auth round trip', () => {
  for (const pathname of ['/', '/terms', '/privacy', '/docs', '/docs/workspace', '/pricing', '/crypto']) {
    assert.equal(requiresUserLookup(pathname), false, `${pathname} should not need the auth server`);
  }
});

test('gated pages still cost one, because the answer decides the response', () => {
  for (const pathname of ['/workspace', '/dashboard', '/settings', '/admin', '/dashboard/projects']) {
    assert.equal(requiresUserLookup(pathname), true, `${pathname} must still be gated`);
  }
});

test('auth pages keep the lookup even though they are public', () => {
  /*
   * The saving must not reach `/auth`. It is a public prefix — so the signed-out
   * visitor can see the form — but the answer still decides something: a signed-in
   * visitor is sent on to the app instead of being shown the login page again.
   * Dropping the lookup here would strand them on a form they no longer need.
   */
  for (const pathname of ['/auth/login', '/auth/signup', '/auth/callback']) {
    assert.equal(isPublicPath(pathname), true, `${pathname} should stay reachable signed out`);
    assert.equal(requiresUserLookup(pathname), true, `${pathname} must keep the lookup`);
  }
});

test('the middleware returns before building an auth client', () => {
  // Ordering matters: the early return has to come before `createServerClient`, or the
  // work is still done and only the round trip is saved.
  const guard = MIDDLEWARE.indexOf('if (!requiresUserLookup(pathname)) return supabaseResponse;');
  const client = MIDDLEWARE.indexOf('createServerClient(');
  const lookup = MIDDLEWARE.indexOf('supabase.auth.getUser()');
  assert.notEqual(guard, -1, 'the early return is gone');
  assert.ok(guard < client, 'the client is built before the path is checked');
  assert.ok(guard < lookup, 'the auth server is called before the path is checked');
});

test('both redirects still happen, so the gate is not merely skipped', () => {
  assert.match(MIDDLEWARE, /if \(!user && !isPublicPage\)/, 'the sign-in redirect is gone');
  assert.match(MIDDLEWARE, /if \(user && isAuthPage\)/, 'the signed-in-on-login redirect is gone');
});

test('files that can never be gated do not reach the middleware', () => {
  // Each of these was observed in production logs, or is fetched by the browser on its
  // own alongside real navigations.
  for (const excluded of ['robots.txt', 'sitemap.xml', 'llms.txt', '\\.well-known']) {
    assert.ok(MATCHER.includes(excluded), `${excluded} still reaches the middleware`);
  }
  // Fonts and icons are requested during the same load as the page that needs them.
  for (const ext of ['woff2', 'ico', 'avif']) {
    assert.ok(MATCHER.includes(ext), `${ext} still reaches the middleware`);
  }
});

test('the root error boundary records what it claims to record', () => {
  const GLOBAL = readFileSync(new URL('../../app/global-error.tsx', import.meta.url), 'utf8');
  // The screen tells the reader "The problem has been recorded". It took no props and
  // recorded nothing, so every report of it arrived with no name, stack or digest.
  assert.match(GLOBAL, /error: Error & \{ digest\?: string \}/, 'the error must be accepted');
  assert.match(GLOBAL, /console\.error\('\[GlobalError\]'/, 'the error must be logged');
  assert.match(GLOBAL, /digest: error\?\.digest/, 'the digest ties the report to the platform logs');
  // And shown, so someone reporting this screen can quote a code rather than describe it.
  assert.match(GLOBAL, /xv-ge__digest/, 'the digest must be visible on the page');
  assert.match(GLOBAL, /The problem has been recorded/, 'the copy should still be true');
});
