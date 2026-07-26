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
    process.env.SUPABASE_PROJECT_REF?.trim() ||
    projectRefFromUrl(process.env.SUPABASE_URL) ||
    projectRefFromConfig() ||
    'nzenxdfumxrnsmybazmo'
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
  // DATABASE_URL is already a complete session-pooler connection string. Do
  // not reinterpret its password or combine it with separate secret values.
  const direct = process.env.DATABASE_URL?.trim() || process.env.SUPABASE_DB_URL?.trim();
  if (direct) return [direct];

  // SUPABASE_DB_PASSWORD is a raw database password. Encoding occurs only
  // while constructing the connection URL below.
  const password = normalizePassword(process.env.SUPABASE_DB_PASSWORD);
  if (!password) return [];

  const ref = resolveProjectRef();
  return poolerUrls(ref, password);
}

export function safeDatabaseMetadata() {
  const candidate = resolveDatabaseUrls()[0];
  if (!candidate) {
    return { projectRef: resolveProjectRef(), databaseHost: null, databasePort: null };
  }

  try {
    const url = new URL(candidate);
    return {
      projectRef: resolveProjectRef(),
      databaseHost: url.hostname,
      databasePort: Number(url.port || 5432),
    };
  } catch {
    return { projectRef: resolveProjectRef(), databaseHost: null, databasePort: null };
  }
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
