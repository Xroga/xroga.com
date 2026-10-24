#!/usr/bin/env node
/**
 * Offline migration check for pull requests. It reads files and nothing else: no environment variable is consulted, no network or
 * database connection is made, no secret is needed. It replaces the pull-request "dry run" of apply-supabase-migrations.mjs, which
 * connected to the live database with the repository's Supabase credentials and executed schema statements.
 *
 *   node scripts/check-supabase-migrations.mjs [--dir supabase/migrations] [--base origin/main]
 *
 * Fails (exit 1) on: a file name that is not `<number>[letter]_<name>.sql`, two files with the same numeric prefix, an empty file,
 * or a statement that can never be a migration (DROP DATABASE, ALTER SYSTEM, CREATE/ALTER ROLE ... SUPERUSER, COPY ... PROGRAM).
 * Lists, for human review and without failing, destructive or privilege-widening statements, and the migration files this change adds or edits.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const NAME = /^(\d+)([a-z]?)_[A-Za-z0-9_.-]+\.sql$/;
const FORBIDDEN = [
  [/\bdrop\s+database\b/i, 'DROP DATABASE'],
  [/\balter\s+system\b/i, 'ALTER SYSTEM'],
  [/\b(create|alter)\s+role\b[^;]*\bsuperuser\b/i, 'SUPERUSER role'],
  [/\bcopy\b[^;]*\bprogram\b/i, 'COPY ... PROGRAM'],
];
const REVIEW = [
  [/\bdrop\s+(table|schema|column|function|policy|trigger|index)\b/i, 'drops an object'],
  [/\btruncate\b/i, 'TRUNCATE'],
  [/\bdelete\s+from\b(?![^;]*\bwhere\b)/i, 'DELETE without WHERE'],
  [/\bupdate\b\s+[\w."]+\s+set\b(?![^;]*\bwhere\b)/i, 'UPDATE without WHERE'],
  [/\bgrant\b[^;]*\b(all|insert|update|delete|truncate)\b[^;]*\bto\b[^;]*\b(anon|authenticated|public)\b/i, 'grants write access to a browser-facing role'],
  [/\bdisable\s+row\s+level\s+security\b/i, 'disables row level security'],
  [/\bsecurity\s+definer\b/i, 'SECURITY DEFINER function'],
  [/\bcreate\s+extension\b/i, 'creates an extension'],
];

/** SQL with comments and string literals blanked, so words inside them cannot trigger or hide a rule. */
function code(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, (m) => m) // dollar-quoted bodies are code (function bodies): keep
    .replace(/'(?:[^']|'')*'/g, "''");
}

export function checkMigrations(dir, changedFiles = []) {
  const errors = [];
  const reviews = [];
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const prefixes = new Map();
  for (const f of files) {
    const m = NAME.exec(f);
    if (!m) { errors.push(`${f}: name must look like 0001_name.sql or 20261024000000_name.sql`); continue; }
    const key = `${m[1]}${m[2]}`;
    if (prefixes.has(key)) errors.push(`${f}: same numeric prefix as ${prefixes.get(key)}`);
    else prefixes.set(key, f);
    const text = readFileSync(join(dir, f), 'utf8');
    if (!text.trim()) { errors.push(`${f}: empty`); continue; }
    const body = code(text);
    for (const [re, label] of FORBIDDEN) if (re.test(body)) errors.push(`${f}: ${label} is not allowed in a migration`);
    if (changedFiles.includes(f)) for (const [re, label] of REVIEW) if (re.test(body)) reviews.push(`${f}: ${label}`);
  }
  return { ok: errors.length === 0, errors, reviews, count: files.length, changed: changedFiles.filter((f) => files.includes(f)) };
}

function changedMigrationFiles(base, dir) {
  if (!base) return [];
  try {
    const rel = dir.replace(/\\/g, '/');
    const out = execFileSync('git', ['diff', '--name-only', '--diff-filter=AM', `${base}...HEAD`, '--', rel], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split('\n').filter(Boolean).map((p) => p.split('/').pop());
  } catch { return []; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const dir = resolve(arg('--dir', join(root, 'supabase/migrations')));
  if (!existsSync(dir)) { console.error(`::error::migrations directory not found`); process.exit(1); }
  const base = arg('--base', '');
  const result = checkMigrations(dir, changedMigrationFiles(base, relativeToRoot(dir, root)));
  console.log(JSON.stringify({ stage: 'offline-migration-check', migrationCount: result.count, changedInThisChange: result.changed, ok: result.ok }));
  for (const r of result.reviews) console.log(`::warning::migration needs human review: ${r}`);
  for (const e of result.errors) console.error(`::error::${e}`);
  console.log(result.ok ? 'Offline check passed. No database was contacted and no secret was read. Migrations are applied only by the push-to-main job, in the Production environment.' : 'Offline check FAILED.');
  process.exit(result.ok ? 0 : 1);
}

function relativeToRoot(dir, root) { return dir.startsWith(root) ? dir.slice(root.length + 1) : dir; }
