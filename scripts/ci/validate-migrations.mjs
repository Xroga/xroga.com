import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'libpg-query';
import { root } from './toolchain.mjs';

export async function validateMigrations(entries) {
  const versions = new Set();
  const ordered = [...entries].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  for (const entry of ordered) {
    const match = /^(\d{3}[a-z]?|\d{8}|\d{14})_[a-z0-9_]+\.sql$/.exec(entry.name);
    if (!match) throw new Error(`Invalid migration filename: ${entry.name}`);
    if (versions.has(match[1])) throw new Error(`Duplicate migration identifier: ${match[1]}`);
    versions.add(match[1]);
    try { await parse(entry.sql); } catch { throw new Error(`Migration SQL syntax rejected: ${entry.name}`); }
  }
  return ordered.map((entry, index) => ({ filename: entry.name, version: entry.name.split('_')[0], order: index + 1 }));
}
export async function main() {
  const directory = join(root, 'supabase/migrations');
  const entries = readdirSync(directory).filter(name => name.endsWith('.sql')).map(name => ({ name, sql: readFileSync(join(directory, name), 'utf8') }));
  const ordered = await validateMigrations(entries);
  console.log(JSON.stringify({ result: 'PASS_SQL_SYNTAX_AND_IDENTIFIER_GATE', migrations: ordered.length,
    parser: 'libpg-query@18.1.5 PostgreSQL WASM grammar', databaseExecuted: false,
    nextGate: 'Fresh/upgrade database and staging verification required for security migrations in Commands 007–010' }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
