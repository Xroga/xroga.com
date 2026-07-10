/**
 * Resolve Supabase Postgres connection URL from CI / Fly / local env.
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');

const POOLER_REGIONS = [
  'us-east-1',
  'us-west-1',
  'eu-west-1',
  'eu-central-1',
  'ap-southeast-1',
  'ap-northeast-1',
];

const POOLER_PREFIXES = ['aws-0', 'aws-1'];

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

/** Repo config.toml is source of truth — GitHub SUPABASE_PROJECT_ID secret may be wrong. */
export function resolveProjectRef(options = {}) {
  const { fallbackProjectRef = 'mweinwhoekwjrecsodip' } = options;
  return (
    projectRefFromConfig() ||
    projectRefFromUrl(process.env.SUPABASE_URL) ||
    fallbackProjectRef
  );
}

function poolerUrls(ref, password) {
  const urls = [];
  const explicitHost = process.env.SUPABASE_POOLER_HOST?.trim();
  const explicitRegion = process.env.SUPABASE_DB_REGION?.trim();

  if (explicitHost) {
    urls.push(
      `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${explicitHost}:5432/postgres`,
      `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${explicitHost}:6543/postgres`
    );
  }

  const regions = explicitRegion ? [explicitRegion] : POOLER_REGIONS;

  for (const prefix of POOLER_PREFIXES) {
    for (const region of regions) {
      const host = `${prefix}-${region}.pooler.supabase.com`;
      // Session mode (5432) first — required for DDL migrations on IPv4 networks
      urls.push(
        `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${host}:5432/postgres`
      );
      urls.push(
        `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${host}:6543/postgres`
      );
    }
  }

  return urls;
}

export function resolveDatabaseUrl(options = {}) {
  const urls = resolveDatabaseUrls(options);
  return urls[0] ?? null;
}

/**
 * Supabase direct db.* host is IPv6-only (no A record) — GitHub Actions cannot use it.
 * Use pooler (IPv4) for CI migrations.
 */
export function resolveDatabaseUrls(options = {}) {
  const direct = process.env.DATABASE_URL?.trim() || process.env.SUPABASE_DB_URL?.trim();
  if (direct) return [direct];

  const password = process.env.SUPABASE_DB_PASSWORD?.trim();
  if (!password) return [];

  const ref = resolveProjectRef(options);
  return [...new Set(poolerUrls(ref, password))];
}

export function missingDatabaseUrlHelp() {
  return [
    'Could not build a Postgres connection URL. Set ONE of:',
    '  • DATABASE_URL — Session pooler URI from Supabase → Settings → Database',
    '  • SUPABASE_DB_PASSWORD — database password (pooler auto-detected by region)',
    '',
    'Note: db.*.supabase.co is IPv6-only. GitHub Actions must use the pooler (IPv4).',
    'Note: SUPABASE_SERVICE_ROLE_KEY is NOT the database password.',
  ].join('\n');
}
