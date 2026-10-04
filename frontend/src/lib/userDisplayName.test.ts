import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveUserDisplayName } from './userDisplayName';

test('profile display name is the canonical visible account name', () => {
  assert.equal(
    resolveUserDisplayName(
      { email: 'email-only@example.com', user_metadata: { full_name: 'Provider Name' } },
      'Profile Name',
    ),
    'Profile Name',
  );
});

test('provider metadata is preferred over exposing an email handle', () => {
  assert.equal(
    resolveUserDisplayName({ email: 'private@example.com', user_metadata: { full_name: 'Sabri Xroga' } }),
    'Sabri Xroga',
  );
});

test('email handle and supplied fallback remain safe legacy fallbacks', () => {
  assert.equal(resolveUserDisplayName({ email: 'legacy@example.com' }), 'legacy');
  assert.equal(resolveUserDisplayName(null, null, 'Guest'), 'Guest');
});
