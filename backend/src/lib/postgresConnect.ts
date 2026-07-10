import dns from 'dns';
import pg from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';

dns.setDefaultResultOrder('ipv4first');

const POOLER_REGIONS = [
  'us-east-1',
  'us-west-1',
  'eu-west-1',
  'eu-central-1',
  'ap-southeast-1',
  'ap-northeast-1',
];

function projectRefFromConfig(): string {
  try {
    const toml = readFileSync(join(process.cwd(), 'supabase/config.toml'), 'utf8');
    const match = toml.match(/^project_id\s*=\s*"([^"]+)"/m);
    return match?.[1] ?? 'mweinwhoekwjrecsodip';
  } catch {
    return 'mweinwhoekwjrecsodip';
  }
}

function resolveProjectRef(): string {
  const fromUrl = process.env.SUPABASE_URL?.trim();
  if (fromUrl) {
    try {
      const host = new URL(fromUrl).hostname;
      const match = host.match(/^([a-z0-9]+)\.supabase\.co$/i);
      if (match?.[1]) return match[1];
    } catch {
      // ignore
    }
  }
  return projectRefFromConfig();
}

export function resolveDatabaseUrls(): string[] {
  const direct = process.env.DATABASE_URL?.trim() || process.env.SUPABASE_DB_URL?.trim();
  if (direct) return [direct];

  const password = process.env.SUPABASE_DB_PASSWORD?.trim();
  const ref = resolveProjectRef();
  if (!password) return [];

  const urls: string[] = [];
  const explicitHost = process.env.SUPABASE_POOLER_HOST?.trim();
  if (explicitHost) {
    urls.push(
      `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${explicitHost}:5432/postgres`
    );
  }

  const regions = process.env.SUPABASE_DB_REGION?.trim()
    ? [process.env.SUPABASE_DB_REGION.trim()]
    : POOLER_REGIONS;

  for (const prefix of ['aws-0', 'aws-1']) {
    for (const region of regions) {
      const host = `${prefix}-${region}.pooler.supabase.com`;
      urls.push(
        `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${host}:5432/postgres`
      );
    }
  }

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
      connectionTimeoutMillis: 12_000,
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
