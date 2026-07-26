/**
 * Postgres connect — Supabase pooler (IPv4) for GitHub Actions.
 */
import dns from 'dns';
import pg from 'pg';
import { resolveDatabaseUrls } from './database-url.mjs';

dns.setDefaultResultOrder('ipv4first');

function clientFromUrl(connectionString) {
  const url = new URL(connectionString);
  return new pg.Client({
    host: url.hostname,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, '') || 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15_000,
  });
}

export async function connectPostgres() {
  const urls = resolveDatabaseUrls();
  if (!urls.length) {
    throw new Error('No database URLs configured');
  }

  let lastError;

  for (const connectionString of urls) {
    const client = clientFromUrl(connectionString);
    const safeTarget = `${client.host}:${client.port}/${client.database}`;

    try {
      await client.connect();
      console.log(`Connected to ${safeTarget}`);
      return client;
    } catch (err) {
      lastError = err;
      console.warn(`Connection failed (${safeTarget}): ${err.message}`);
      try {
        await client.end();
      } catch {
        // ignore
      }
    }
  }

  const hint =
    lastError?.message?.includes('password authentication failed')
      ? '\n\nFIX: GitHub secret SUPABASE_DB_PASSWORD must be your DATABASE password (Supabase → Settings → Database → Reset database password). It is NOT the service role key.'
      : '';

  throw new Error((lastError?.message ?? 'All connection attempts failed') + hint);
}
