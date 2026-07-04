/**
 * Apply GitHub integration tables migration (020).
 *
 * Usage:
 *   DATABASE_URL="postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres" \
 *     node scripts/apply-github-integration-migration.mjs
 *
 * Get DATABASE_URL from Supabase → Project Settings → Database → Connection string (URI).
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  join(__dirname, '../supabase/migrations/020_user_integrations.sql'),
  'utf8'
);

const url = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL;
if (!url) {
  console.error(
    'Set DATABASE_URL (Supabase → Settings → Database → Connection string URI).'
  );
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
await client.query(sql);
await client.end();
console.log('Migration 020_user_integrations applied. GitHub connect should work now.');
