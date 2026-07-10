/**
 * Resolve Supabase Postgres connection URL from CI / Fly / local env.
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');

function projectRefFromUrl(url) {
  if (!url) return null;
  try {
    const host = new URL(url.trim()).hostname;
    const match = host.match(/^([a-z0-9]+)\.supabase\.co$/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function projectRefFromConfig() {
  try {
    const toml = readFileSync(join(ROOT, 'supabase/config.toml'), 'utf8');
    const match = toml.match(/^project_id\s*=\s*"([^"]+)"/m);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function sanitizeProjectRef(value) {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.includes('supabase.co')) {
    return projectRefFromUrl(trimmed);
  }
  if (/^[a-z0-9]{10,30}$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return null;
}

/** Repo config.toml is source of truth — GitHub secret may be wrong. */
export function resolveProjectRef(options = {}) {
  const { fallbackProjectRef = 'mweinwhoekwjrecsodip' } = options;

  return (
    projectRefFromConfig() ||
    projectRefFromUrl(process.env.SUPABASE_URL) ||
    sanitizeProjectRef(process.env.SUPABASE_PROJECT_ID) ||
    fallbackProjectRef
  );
}

export function resolveDatabaseUrl(options = {}) {
  const direct = process.env.DATABASE_URL?.trim() || process.env.SUPABASE_DB_URL?.trim();
  if (direct) return direct;

  const password = process.env.SUPABASE_DB_PASSWORD?.trim();
  if (!password) return null;

  const ref = resolveProjectRef(options);
  return `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`;
}

export function resolveDatabaseUrls(options = {}) {
  const direct = process.env.DATABASE_URL?.trim() || process.env.SUPABASE_DB_URL?.trim();
  if (direct) return [direct];

  const password = process.env.SUPABASE_DB_PASSWORD?.trim();
  if (!password) return [];

  const ref = resolveProjectRef(options);
  const urls = [];

  // Explicit pooler host from secret (copy from Supabase dashboard)
  const poolerHost = process.env.SUPABASE_POOLER_HOST?.trim();
  if (poolerHost) {
    urls.push(
      `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${poolerHost}:6543/postgres`,
      `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${poolerHost}:5432/postgres`
    );
  }

  // Direct host — pg-connect resolves to IPv4 literal (fixes GitHub Actions ENETUNREACH)
  urls.push(`postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`);

  return [...new Set(urls)];
}

export function missingDatabaseUrlHelp() {
  return [
    'Could not build a Postgres connection URL. Set ONE of:',
    '  • DATABASE_URL (Session pooler URI from Supabase → Settings → Database)',
    '  • SUPABASE_DB_PASSWORD (database password — project ref read from supabase/config.toml)',
    '',
    'Note: SUPABASE_SERVICE_ROLE_KEY is NOT the database password.',
  ].join('\n');
}
