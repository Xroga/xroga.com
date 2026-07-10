import dns from 'dns';
import dnsPromises from 'dns/promises';
import pg from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';

dns.setDefaultResultOrder('ipv4first');

function projectRefFromConfig(): string {
  try {
    const toml = readFileSync(join(process.cwd(), 'supabase/config.toml'), 'utf8');
    const match = toml.match(/^project_id\s*=\s*"([^"]+)"/m);
    return match?.[1] ?? 'mweinwhoekwjrecsodip';
  } catch {
    return 'mweinwhoekwjrecsodip';
  }
}

function projectRefFromUrl(url: string): string | null {
  try {
    const host = new URL(url.trim()).hostname;
    const match = host.match(/^([a-z0-9]+)\.supabase\.co$/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function resolveProjectRef(): string {
  return (
    projectRefFromConfig() ||
    (process.env.SUPABASE_URL ? projectRefFromUrl(process.env.SUPABASE_URL) : null) ||
    'mweinwhoekwjrecsodip'
  );
}

export function resolveDatabaseUrls(): string[] {
  const direct = process.env.DATABASE_URL?.trim() || process.env.SUPABASE_DB_URL?.trim();
  if (direct) return [direct];

  const password = process.env.SUPABASE_DB_PASSWORD?.trim();
  const ref = resolveProjectRef();
  if (!password) return [];

  const urls: string[] = [];
  const poolerHost = process.env.SUPABASE_POOLER_HOST?.trim();
  if (poolerHost) {
    urls.push(
      `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${poolerHost}:6543/postgres`
    );
  }

  urls.push(
    `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`
  );

  return urls;
}

async function connectIpv4Direct(password: string, ref: string): Promise<pg.Client> {
  const hostname = `db.${ref}.supabase.co`;
  const ipv4 = (await dnsPromises.resolve4(hostname))[0];

  const client = new pg.Client({
    host: ipv4,
    port: 5432,
    user: 'postgres',
    password,
    database: 'postgres',
    ssl: { rejectUnauthorized: false, servername: hostname },
    connectionTimeoutMillis: 25_000,
  });

  await client.connect();
  return client;
}

export async function connectPostgres(): Promise<pg.Client> {
  const password = process.env.SUPABASE_DB_PASSWORD?.trim();
  const ref = resolveProjectRef();

  if (password && !process.env.DATABASE_URL?.trim()) {
    try {
      return await connectIpv4Direct(password, ref);
    } catch {
      // fall through
    }
  }

  const urls = resolveDatabaseUrls();
  if (!urls.length) {
    throw new Error('No database URL configured');
  }

  let lastError: Error | undefined;

  for (const connectionString of urls) {
    try {
      const parsed = new URL(connectionString);
      const host = parsed.hostname;

      if (/^db\.[a-z0-9]+\.supabase\.co$/i.test(host)) {
        const ipv4 = (await dnsPromises.resolve4(host))[0];
        const client = new pg.Client({
          host: ipv4,
          port: Number(parsed.port || 5432),
          user: decodeURIComponent(parsed.username),
          password: decodeURIComponent(parsed.password),
          database: parsed.pathname.replace(/^\//, '') || 'postgres',
          ssl: { rejectUnauthorized: false, servername: host },
          connectionTimeoutMillis: 25_000,
        });
        await client.connect();
        return client;
      }

      const client = new pg.Client({
        connectionString,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 25_000,
      });
      await client.connect();
      return client;
    } catch (err) {
      lastError = err as Error;
    }
  }

  throw lastError ?? new Error('All database connection attempts failed');
}
