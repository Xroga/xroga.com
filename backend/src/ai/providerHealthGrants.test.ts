import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/**
 * The provider-health table must grant the service role the access the code assumes.
 *
 * This exists because the omission already happened and was invisible. The table was
 * created with `service_role` holding only REFERENCES, TRIGGER and TRUNCATE — no DML —
 * while every comparable table had the full set. Nothing failed: `hydrateProviderHealth`
 * and the persist path both catch and warn, so a permission error would have produced one
 * log line at boot and then behaved exactly like a working system that had simply never
 * seen a state transition.
 *
 * A test that reads the migrations is the only place this is checkable without a database.
 * It is narrow on purpose — it asserts the grant for the one table whose durability the
 * §15 work depends on, rather than pretending to audit every table's permissions.
 */

const MIGRATIONS = fileURLToPath(new URL('../../../supabase/migrations/', import.meta.url));
const TABLE = 'model_provider_health';

async function migrationSql(): Promise<string> {
  const files = (await readdir(MIGRATIONS)).filter((name) => name.endsWith('.sql')).sort();
  const contents = await Promise.all(
    files.map((name) => readFile(new URL(name, `file://${MIGRATIONS}`), 'utf8')),
  );
  return contents.join('\n').toLowerCase();
}

test('the provider health table is created', async () => {
  const sql = await migrationSql();
  assert.match(sql, new RegExp(`create table if not exists public\\.${TABLE}`));
});

test('the service role can read and write provider health', async () => {
  // Without every one of these the durability is inert: load needs select, the upsert needs
  // insert and update.
  const sql = await migrationSql();
  const grant = sql.match(new RegExp(`grant ([^;]*?) on public\\.${TABLE} to service_role`));
  assert.ok(grant, `no service_role grant for ${TABLE}`);

  for (const privilege of ['select', 'insert', 'update']) {
    assert.match(grant[1]!, new RegExp(`\\b${privilege}\\b`), `service_role lacks ${privilege}`);
  }
});

test('the browser roles reach nothing', async () => {
  // Provider failure patterns are operational detail about Xroga's own infrastructure. An
  // authenticated session must not be able to read which providers are failing.
  const sql = await migrationSql();
  assert.match(sql, new RegExp(`revoke all on public\\.${TABLE} from anon, authenticated`));
  assert.match(sql, new RegExp(`alter table public\\.${TABLE} enable row level security`));

  // No permissive policy: RLS with a policy that admits anon would be worse than no RLS,
  // because the enable statement above reads as protection.
  const policyForTable = new RegExp(`create policy[^;]*on public\\.${TABLE}[^;]*;`, 'g');
  assert.equal(sql.match(policyForTable), null, `${TABLE} has a policy; it should have none`);
});
