import dns from 'dns';
import pg from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';

dns.setDefaultResultOrder('ipv4first');

const DEFAULT_POOLER_HOST = 'aws-1-ap-southeast-1.pooler.supabase.com';

function projectRefFromConfig(): string {
  try {
    const toml = readFileSync(join(process.cwd(), 'supabase/config.toml'), 'utf8');
    const match = toml.match(/^project_id\s*=\s*"([^"]+)"/m);
    return match?.[1] ?? 'mweinwhoekwjrecsodip';
  } catch {
    return 'mweinwhoekwjrecsodip';
  }
}

function normalizePassword(raw?: string): string {
  if (!raw) return '';
  return raw.trim().replace(/^["']|["']$/g, '');
}

function poolerHost(): string {
  return (
    process.env.SUPABASE_POOLER_HOST?.trim() ||
    (process.env.SUPABASE_DB_REGION?.trim()
      ? `aws-1-${process.env.SUPABASE_DB_REGION.trim()}.pooler.supabase.com`
      : DEFAULT_POOLER_HOST)
  );
}

export function resolveDatabaseUrls(): string[] {
  const direct = process.env.DATABASE_URL?.trim() || process.env.SUPABASE_DB_URL?.trim();
  if (direct) return [direct];

  const password = normalizePassword(process.env.SUPABASE_DB_PASSWORD);
  const ref = projectRefFromConfig();
  if (!password) return [];

  const host = poolerHost();
  return [
    `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${host}:5432/postgres`,
    `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${host}:6543/postgres`,
  ];
}

export async function connectPostgres(): Promise<pg.Client> {
  const urls = resolveDatabaseUrls();
  if (!urls.length) {
    throw new Error('No database URL configured');
  }

  let lastError: Error | undefined;

  for (const connectionString of urls) {
    const url = new URL(connectionString);
    const client = new pg.Client({
      host: url.hostname,
      port: Number(url.port || 5432),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.replace(/^\//, '') || 'postgres',
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 15_000,
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
