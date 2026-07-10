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
import pg from 'pg';
import { resolveDatabaseUrl, missingDatabaseUrlHelp } from './lib/database-url.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase/migrations');

const dryRun = process.argv.includes('--dry-run') || process.env.DRY_RUN === '1';

const url = resolveDatabaseUrl();
if (!url) {
  console.error(missingDatabaseUrlHelp());
  process.exit(1);
}

if (dryRun) {
  console.log('DRY RUN — migrations will not be applied.');
}

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

await client.connect();

await client.query(`
  CREATE SCHEMA IF NOT EXISTS supabase_migrations;
  CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
    version TEXT PRIMARY KEY,
    name TEXT,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`);

const files = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort();

const { rows: applied } = await client.query(
  'SELECT version FROM supabase_migrations.schema_migrations'
);
const appliedSet = new Set(applied.map((r) => r.version));

let appliedCount = 0;

for (const file of files) {
  const version = file.replace(/\.sql$/, '');
  if (appliedSet.has(version)) {
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
    await client.query(
      `INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ($1, $2)`,
      [version, file]
    );
    await client.query('COMMIT');
    appliedCount += 1;
    console.log(`ok    ${version}`);
  } catch (err) {
    await client.query('ROLLBACK');
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
