/**
 * Resolve Supabase Postgres connection URL from CI / Fly / local env.
 */
import { projectRefFromConfig, normalizePassword, DEFAULT_POOLER_HOST } from './supabase-rest.mjs';

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

export function resolveProjectRef() {
  return (
    projectRefFromConfig() ||
    projectRefFromUrl(process.env.SUPABASE_URL) ||
    'mweinwhoekwjrecsodip'
  );
}

function poolerUrls(ref, password) {
  const urls = [];
  const host =
    process.env.SUPABASE_POOLER_HOST?.trim() ||
    (process.env.SUPABASE_DB_REGION?.trim()
      ? `aws-1-${process.env.SUPABASE_DB_REGION.trim()}.pooler.supabase.com`
      : DEFAULT_POOLER_HOST);

  // Session mode (5432) — DDL migrations on IPv4 pooler
  urls.push(
    `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${host}:5432/postgres`
  );
  urls.push(
    `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${host}:6543/postgres`
  );

  return urls;
}

export function resolveDatabaseUrls() {
  const direct = process.env.DATABASE_URL?.trim() || process.env.SUPABASE_DB_URL?.trim();
  if (direct) return [direct];

  const password = normalizePassword(process.env.SUPABASE_DB_PASSWORD);
  if (!password) return [];

  const ref = resolveProjectRef();
  return poolerUrls(ref, password);
}

export function missingDatabaseUrlHelp() {
  return [
    'Could not build a Postgres connection URL. Set ONE of:',
    '  • DATABASE_URL — copy Session pooler URI from Supabase → Settings → Database',
    '  • SUPABASE_DB_PASSWORD — database password (not service role key)',
    '',
    `Pooler host: ${DEFAULT_POOLER_HOST}`,
    'Reset DB password: Supabase Dashboard → Project Settings → Database → Reset password',
  ].join('\n');
}
