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

export function resolveProjectRef(options = {}) {
  const { fallbackProjectRef = 'mweinwhoekwjrecsodip' } = options;
  return (
    process.env.SUPABASE_PROJECT_ID?.trim() ||
    projectRefFromUrl(process.env.SUPABASE_URL) ||
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

/**
 * Connection URLs to try in order.
 * GitHub Actions runners often cannot reach Supabase direct host over IPv6 (ENETUNREACH).
 * Pooler endpoints + ipv4first DNS fix that.
 */
export function resolveDatabaseUrls(options = {}) {
  const urls = [];

  const direct = process.env.DATABASE_URL?.trim() || process.env.SUPABASE_DB_URL?.trim();
  if (direct) {
    urls.push(direct);
    return urls;
  }

  const password = process.env.SUPABASE_DB_PASSWORD?.trim();
  if (!password) return urls;

  const ref = resolveProjectRef(options);
  const regions = [
    process.env.SUPABASE_DB_REGION?.trim(),
    'us-east-1',
    'us-west-1',
    'eu-west-1',
    'ap-southeast-1',
  ].filter(Boolean);

  const poolerHosts = [
    process.env.SUPABASE_POOLER_HOST?.trim(),
    ...regions.map((region) => `aws-0-${region}.pooler.supabase.com`),
  ].filter(Boolean);

  for (const poolerHost of [...new Set(poolerHosts)]) {
    urls.push(
      `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${poolerHost}:6543/postgres`,
      `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${poolerHost}:5432/postgres`
    );
  }

  urls.push(`postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`);

  return [...new Set(urls)];
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
