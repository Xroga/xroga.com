/**
 * Apply pending Supabase SQL migrations via direct Postgres connection.
 * Used by GitHub Actions when SUPABASE_ACCESS_TOKEN is not configured.
 *
 * Usage:
 *   SUPABASE_DB_PASSWORD=... SUPABASE_URL=https://xxx.supabase.co node scripts/apply-supabase-migrations.mjs
 *   DATABASE_URL=postgresql://postgres:...@db.xxx.supabase.co:5432/postgres node scripts/apply-supabase-migrations.mjs
 */
import { readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { resolveDatabaseUrls, missingDatabaseUrlHelp } from './lib/database-url.mjs';
import { connectPostgres } from './lib/pg-connect.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase/migrations');

const dryRun = process.argv.includes('--dry-run') || process.env.DRY_RUN === '1';

const urls = resolveDatabaseUrls();
if (!urls.length) {
  console.error(missingDatabaseUrlHelp());
  process.exit(1);
}

if (dryRun) {
  console.log('DRY RUN — migrations will not be applied.');
}

const client = await connectPostgres();

// Ensure migration tracking table (compatible with Supabase CLI)
await client.query(`
  CREATE SCHEMA IF NOT EXISTS supabase_migrations;
  CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
    version TEXT PRIMARY KEY,
    name TEXT,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`);

async function isMigrationApplied(version, file) {
  const { rows } = await client.query(
    'SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = $1 LIMIT 1',
    [version]
  );
  if (rows.length) return true;

  // Phase 1 table already created via Fly.io bootstrap
  if (version === '022_phase1_token_usage') {
    const check = await client.query(
      "SELECT to_regclass('public.user_token_usage') AS reg"
    );
    if (check.rows[0]?.reg) return true;
  }

  return false;
}

async function markMigrationApplied(version, file) {
  await client.query(
    `INSERT INTO supabase_migrations.schema_migrations (version, name)
     VALUES ($1, $2)
     ON CONFLICT (version) DO NOTHING`,
    [version, file]
  );
}

const files = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort();

let appliedCount = 0;

for (const file of files) {
  const version = file.replace(/\.sql$/, '');

  if (await isMigrationApplied(version, file)) {
    console.log(`skip  ${version} (already applied)`);
    continue;
  }

  if (dryRun) {
    console.log(`pending ${version}`);
    appliedCount += 1;
    continue;
  }

  const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
  console.log(`apply ${version}...`);

  try {
    await client.query('BEGIN');
    await client.query(sql);
    await markMigrationApplied(version, file);
    await client.query('COMMIT');
    appliedCount += 1;
    console.log(`ok    ${version}`);
  } catch (err) {
    await client.query('ROLLBACK');

    // Idempotent: object already exists from prior manual/CLI apply
    if (/already exists|duplicate key/i.test(err.message)) {
      console.warn(`warn  ${version}: ${err.message} — marking applied`);
      await markMigrationApplied(version, file);
      appliedCount += 1;
      continue;
    }

    console.error(`fail  ${version}:`, err.message);
    process.exit(1);
  }
}

await client.end();

if (appliedCount === 0) {
  console.log(dryRun ? 'No pending migrations (dry run).' : 'No pending migrations.');
} else {
  console.log(
    dryRun
      ? `${appliedCount} pending migration(s) would be applied on merge to main.`
      : `Applied ${appliedCount} migration(s).`
  );
}
