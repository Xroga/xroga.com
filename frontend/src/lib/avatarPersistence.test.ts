import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { avatarProfileUrl, persistAvatarUpload } from './avatarPersistence';

function fixture(options: { authError?: boolean; uploadError?: boolean } = {}) {
  const calls: string[] = [];
  const owner = '11111111-1111-4111-8111-111111111111';
  const client = {
    auth: { getUser: async () => {
      calls.push('auth');
      return { data: { user: options.authError ? null : { id: owner } }, error: options.authError };
    } },
    storage: { from: (bucket: string) => {
      assert.equal(bucket, 'avatars');
      return {
        upload: async (path: string, _file: File, config: unknown) => {
          calls.push('upload');
          assert.match(path, new RegExp(`^${owner}/[a-f0-9-]+\\.png$`));
          assert.deepEqual(config, { contentType: 'image/png', upsert: false });
          return { error: options.uploadError };
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://fixture.invalid/${path}` } }),
      };
    } },
  } as unknown as SupabaseClient;
  return { client, calls };
}
const file = () => new File(['synthetic-image-fixture'], '../../other-user/secret.png', { type: 'image/png' });

test('avatar upload derives owner path, ignores supplied filename and waits for profile persistence', async () => {
  const { client, calls } = fixture();
  await persistAvatarUpload(client, file(), async (url) => {
    assert.match(url, /^https:\/\/fixture.invalid\//);
    calls.push('profile');
  });
  assert.deepEqual(calls, ['auth', 'upload', 'profile']);
});

test('avatar authentication and upload failures never save a fallback profile', async () => {
  for (const options of [{ authError: true }, { uploadError: true }]) {
    const { client, calls } = fixture(options);
    await assert.rejects(persistAvatarUpload(client, file(), async () => { assert.fail('must not save'); }));
    assert.deepEqual(calls, options.authError ? ['auth'] : ['auth', 'upload']);
  }
});

test('profile persistence rejection remains failure after a successful object upload', async () => {
  const { client } = fixture();
  await assert.rejects(persistAvatarUpload(client, file(), async () => { throw new Error('save failed'); }), /save failed/);
});

test('unsupported, empty and oversized avatars fail before network access', async () => {
  const { client, calls } = fixture();
  for (const invalid of [new File(['svg'], 'x.svg', { type: 'image/svg+xml' }), new File([], 'x.png', { type: 'image/png' }), new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'x.png', { type: 'image/png' })]) {
    await assert.rejects(persistAvatarUpload(client, invalid, async () => assert.fail('must not save')));
  }
  assert.deepEqual(calls, []);
});

test('bundled relative avatar URLs become API-compatible without accepting data or script URLs', () => {
  assert.equal(avatarProfileUrl('/profiles/profile-1-hero.png', 'https://fixture.invalid'), 'https://fixture.invalid/profiles/profile-1-hero.png');
  for (const url of ['data:image/png;base64,AAAA', 'javascript:alert(1)', 'https://user:secret@example.test/a.png']) {
    assert.throws(() => avatarProfileUrl(url, 'https://fixture.invalid'));
  }
});
