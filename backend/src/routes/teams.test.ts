import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { hashInviteToken, mapTeamError, newInviteToken } from './teams.js';

test('invite tokens are 256-bit, url-safe and unique', () => {
  const a = newInviteToken();
  const b = newInviteToken();
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a, b);
});

test('only a sha-256 hash is derived from a token, and it is stable', () => {
  const token = newInviteToken();
  const hash = hashInviteToken(token);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hash, hashInviteToken(token));
  assert.notEqual(hash, hashInviteToken(`${token}x`));
  assert.ok(!hash.includes(token));
});

test('database errors map to safe public responses', () => {
  assert.equal(mapTeamError({ message: 'TEAM_FORBIDDEN' }).status, 403);
  assert.equal(mapTeamError({ message: 'TEAM_NOT_FOUND' }).status, 404);
  assert.equal(mapTeamError({ message: 'TEAM_CONFLICT' }).status, 409);
  assert.equal(mapTeamError({ message: 'TEAM_EXPIRED' }).status, 410);
  assert.equal(mapTeamError({ message: 'TEAM_RATE_LIMIT' }).status, 429);
});

test('unknown errors never leak database details', () => {
  const mapped = mapTeamError({ message: 'relation "team_members" does not exist at 10.0.0.5' });
  assert.equal(mapped.status, 503);
  assert.ok(!/team_members|10\.0\.0\.5/.test(mapped.message));
  assert.equal(mapTeamError(undefined).status, 503);
});

// The migration is the security boundary. These guard against regressions in it.
const sql = readFileSync(new URL('../../../supabase/migrations/20261102000000_team_invitations.sql', import.meta.url), 'utf8');

test('migration stores token hashes only and enables RLS with no client grants', () => {
  assert.match(sql, /token_hash text UNIQUE/);
  assert.ok(!/\btoken text\b/.test(sql));
  for (const table of ['teams', 'team_members', 'team_invitations', 'team_link_redemptions', 'team_audit']) {
    assert.match(sql, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
  }
  assert.match(sql, /REVOKE ALL ON public\.teams[\s\S]*FROM anon, authenticated/);
  assert.ok(!/GRANT [A-Z, ]+ ON public\.team\w* TO (anon|authenticated)/.test(sql));
});

test('every team function is revoked from client roles and granted to service_role', () => {
  const names = [...sql.matchAll(/FUNCTION public\.(team_\w+)\(/g)].map(m => m[1]).filter(n => n !== 'team_member_limit');
  assert.ok(names.length >= 14);
  const lockBlock = sql.slice(sql.indexOf('$lock$'));
  for (const name of new Set(names)) assert.ok(lockBlock.includes(`'${name}(`), `${name} is not locked down`);
  assert.match(lockBlock, /FROM PUBLIC, anon, authenticated/);
  assert.match(lockBlock, /TO service_role/);
});

test('admin links are rejected and the owner role cannot be granted by invitation', () => {
  assert.match(sql, /kind = 'link' AND invitee_id IS NULL AND token_hash IS NOT NULL AND role <> 'admin'/);
  assert.match(sql, /role text NOT NULL CHECK \(role IN \('admin','member','viewer'\)\)/);
  assert.match(sql, /uq_team_one_owner/);
});

test('router never takes the actor from the request', () => {
  const router = readFileSync(new URL('./teams.ts', import.meta.url), 'utf8');
  // Every p_actor must come from the verified tenant context, never req.body/query/params.
  const actorBindings = router.match(/p_actor:\s*[^,\n}]+/g) ?? [];
  assert.ok(actorBindings.length >= 2);
  for (const binding of actorBindings) assert.match(binding, /p_actor:\s*context\.userId$/);
  assert.ok(!/p_actor[^\n]*req\./.test(router));
});
