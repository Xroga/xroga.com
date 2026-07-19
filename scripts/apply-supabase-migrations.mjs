/**
 * Apply pending Supabase SQL migrations via direct Postgres connection.
 */
import { readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { resolveDatabaseUrls, missingDatabaseUrlHelp } from './lib/database-url.mjs';
import { connectPostgres } from './lib/pg-connect.mjs';
import { phase1TableExistsViaRest, shipLoopTablesExistViaRest } from './lib/supabase-rest.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase/migrations');

const dryRun = process.argv.includes('--dry-run') || process.env.DRY_RUN === '1';

function listMigrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

function printOfflineMigrationInventory(reason) {
  const files = listMigrationFiles();
  console.warn(`::warning::${reason}`);
  console.log(`Migration files in repo (${files.length}):`);
  for (const file of files) {
    console.log(`  ${file.replace(/\.sql$/, '')}`);
  }
}

async function handleUnavailableDb(reason) {
  const shipLoop = await shipLoopTablesExistViaRest();
  if (shipLoop === true) {
    console.warn(`::warning::${reason}`);
    console.warn(
      '::warning::project_memory + session_memory already exist via REST. Fix DB password before the next schema change.'
    );
    process.exit(0);
  }

  if (dryRun) {
    printOfflineMigrationInventory(
      `${reason} Dry-run cannot verify applied state — listing migration files only.`
    );
    process.exit(0);
  }

  // Proven missing → fail the main apply job (actionable schema gap).
  if (shipLoop === false) {
    console.error(
      '::error::Ship-loop tables missing (project_memory / session_memory). Durable memory and run traces will not persist until migrations apply.'
    );
    console.error(missingDatabaseUrlHelp());
    process.exit(1);
  }

  // REST secrets missing/invalid → cannot prove tables are absent. Do not red-X main
  // over unverifiable state; API boot `ensureShipLoopSchema` covers Fly when DB URL is set.
  console.warn(`::warning::${reason}`);
  console.warn(
    '::warning::Cannot verify ship-loop tables via REST (set GitHub secrets SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY). Skipping hard-fail; fix SUPABASE_DB_PASSWORD (Database password, not service role) so migrations can apply.'
  );
  printOfflineMigrationInventory('Migrations not applied this run.');
  process.exit(0);
}

if (!resolveDatabaseUrls().length) {
  // If service role can verify required tables exist, succeed without DB password
  const phase1Exists = await phase1TableExistsViaRest();
  const shipLoopExists = await shipLoopTablesExistViaRest();
  if (phase1Exists === true && shipLoopExists === true) {
    console.log('Required tables exist (REST). No DB password needed.');
    process.exit(0);
  }
  await handleUnavailableDb('No DATABASE_URL / SUPABASE_DB_PASSWORD configured.');
}

if (dryRun) {
  console.log('DRY RUN — migrations will not be applied.');
}

// Table existing does NOT mean migrations 024/026 (bonus_tokens, atomic RPCs) are applied.
// Always walk schema_migrations — skipping here caused dashboard usage to reset after refresh.
const phase1Exists = await phase1TableExistsViaRest();
if (phase1Exists === true) {
  console.log('user_token_usage table exists — still applying any pending migrations (024/026…).');
}

const client = await connectPostgres().catch(async (err) => {
  if (/password authentication failed/i.test(err.message)) {
    await handleUnavailableDb(
      'SUPABASE_DB_PASSWORD in GitHub secrets is incorrect (use Database password from Supabase Dashboard → Database settings, NOT the service role key).'
    );
  }
  throw err;
});

await client.query(`
  CREATE SCHEMA IF NOT EXISTS supabase_migrations;
  CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
    version TEXT PRIMARY KEY,
    name TEXT,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`);

async function isMigrationApplied(version) {
  const { rows } = await client.query(
    'SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = $1 LIMIT 1',
    [version]
  );
  if (rows.length) return true;

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
     VALUES ($1, $2) ON CONFLICT (version) DO NOTHING`,
    [version, file]
  );
}

const files = listMigrationFiles();

let appliedCount = 0;

for (const file of files) {
  const version = file.replace(/\.sql$/, '');

  if (await isMigrationApplied(version)) {
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
