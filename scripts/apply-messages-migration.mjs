/**
 * Apply messages migration using direct Postgres connection.
 * Usage: DATABASE_URL="postgresql://postgres:PASSWORD@db.mweinwhoekwjrecsodip.supabase.co:5432/postgres" node scripts/apply-messages-migration.mjs
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(__dirname, '../supabase/migrations/004_messages.sql'), 'utf8');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL to your Supabase Postgres connection string (Settings → Database).');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
await client.query(sql);
await client.end();
console.log('Migration 004_messages applied successfully.');
