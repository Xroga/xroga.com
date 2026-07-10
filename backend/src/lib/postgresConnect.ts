import dns from 'dns';
import pg from 'pg';

dns.setDefaultResultOrder('ipv4first');

function projectRefFromUrl(url: string): string | null {
  try {
    const host = new URL(url.trim()).hostname;
    const match = host.match(/^([a-z0-9]+)\.supabase\.co$/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function resolveProjectRef(): string | null {
  return (
    process.env.SUPABASE_PROJECT_ID?.trim() ||
    (process.env.SUPABASE_URL ? projectRefFromUrl(process.env.SUPABASE_URL) : null) ||
    projectRefFromUrl('https://mweinwhoekwjrecsodip.supabase.co')
  );
}

export function resolveDatabaseUrls(): string[] {
  const direct = process.env.DATABASE_URL?.trim() || process.env.SUPABASE_DB_URL?.trim();
  if (direct) return [direct];

  const password = process.env.SUPABASE_DB_PASSWORD?.trim();
  const ref = resolveProjectRef();
  if (!password || !ref) return [];

  const regions = [
    process.env.SUPABASE_DB_REGION?.trim(),
    'us-east-1',
    'us-west-1',
    'eu-west-1',
    'ap-southeast-1',
  ].filter(Boolean) as string[];

  const poolerHosts = [
    process.env.SUPABASE_POOLER_HOST?.trim(),
    ...regions.map((region) => `aws-0-${region}.pooler.supabase.com`),
  ].filter(Boolean) as string[];

  const urls: string[] = [];
  for (const poolerHost of [...new Set(poolerHosts)]) {
    urls.push(
      `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${poolerHost}:6543/postgres`,
      `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${poolerHost}:5432/postgres`
    );
  }

  urls.push(
    `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`
  );

  return [...new Set(urls)];
}

export async function connectPostgres(): Promise<pg.Client> {
  const urls = resolveDatabaseUrls();
  if (!urls.length) {
    throw new Error('No database URL configured');
  }

  let lastError: Error | undefined;

  for (const connectionString of urls) {
    const client = new pg.Client({
      connectionString,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 20_000,
    });

    try {
      await client.connect();
      return client;
    } catch (err) {
      lastError = err as Error;
      try {
        await client.end();
      } catch {
        // ignore
      }
    }
  }

  throw lastError ?? new Error('All database connection attempts failed');
}
