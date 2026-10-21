import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
export const MIGRATION = path.resolve(here, '../../../../supabase/migrations/20261022000000_storage_drive_foundation.sql');
export const ROLLBACK = path.resolve(here, '../../../../docs/infra/batch-1.5/rollback/20261022000000_storage_drive_foundation.down.sql');

export const PG_TEST_URL = process.env.STORAGE_TEST_DATABASE_URL;

/**
 * Creates a disposable database on the server named by STORAGE_TEST_DATABASE_URL, applies the Supabase stand-in and
 * the REAL migration file, and returns a pool plus a dropper. Never touches an existing database.
 */
export async function createDisposableDb(opts: { beforeMigration?: (pool: pg.Pool) => Promise<void> } = {}): Promise<{ pool: pg.Pool; drop: () => Promise<void>; url: string }> {
  if (!PG_TEST_URL) throw new Error('STORAGE_TEST_DATABASE_URL not set');
  const admin = new pg.Client({ connectionString: PG_TEST_URL });
  await admin.connect();
  const name = `xroga_st_${randomBytes(5).toString('hex')}`;
  await admin.query(`create database ${name}`);
  const u = new URL(PG_TEST_URL);
  u.pathname = `/${name}`;
  const pool = new pg.Pool({ connectionString: u.toString(), max: 24 });
  pool.on('error', () => undefined); // idle-client errors during teardown are not test failures
  await pool.query(readFileSync(path.join(here, 'supabaseStub.sql'), 'utf8'));
  await opts.beforeMigration?.(pool);
  await pool.query(readFileSync(MIGRATION, 'utf8'));
  return {
    pool, url: u.toString(),
    drop: async () => {
      await pool.end();
      await admin.query(`drop database if exists ${name} with (force)`);
      await admin.end();
    },
  };
}
