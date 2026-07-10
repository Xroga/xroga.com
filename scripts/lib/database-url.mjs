/**
 * Resolve Supabase Postgres connection URL from CI / Fly / local env.
 *
 * Supported:
 *   DATABASE_URL or SUPABASE_DB_URL (full URI)
 *   SUPABASE_DB_PASSWORD + SUPABASE_URL or SUPABASE_PROJECT_ID
 */

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

export function resolveDatabaseUrl(options = {}) {
  const { fallbackProjectRef = 'mweinwhoekwjrecsodip' } = options;

  const direct = process.env.DATABASE_URL?.trim() || process.env.SUPABASE_DB_URL?.trim();
  if (direct) return direct;

  const password = process.env.SUPABASE_DB_PASSWORD?.trim();
  if (!password) return null;

  const ref =
    process.env.SUPABASE_PROJECT_ID?.trim() ||
    projectRefFromUrl(process.env.SUPABASE_URL) ||
    fallbackProjectRef;

  return `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`;
}

export function missingDatabaseUrlHelp() {
  return [
    'Could not build a Postgres connection URL. Set ONE of:',
    '  • DATABASE_URL (full URI from Supabase → Settings → Database)',
    '  • SUPABASE_DB_PASSWORD + SUPABASE_URL (or SUPABASE_PROJECT_ID)',
    '',
    'Note: SUPABASE_SERVICE_ROLE_KEY is NOT the database password.',
    'Get the DB password from Supabase → Project Settings → Database.',
  ].join('\n');
}
