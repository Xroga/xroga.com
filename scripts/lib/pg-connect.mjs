/**
 * Postgres connect — forces IPv4 for Supabase direct host (GitHub Actions ENETUNREACH fix).
 */
import dns from 'dns';
import dnsPromises from 'dns/promises';
import pg from 'pg';
import { resolveDatabaseUrls, resolveProjectRef } from './database-url.mjs';

dns.setDefaultResultOrder('ipv4first');

function parseConnectionString(connectionString) {
  const url = new URL(connectionString);
  return {
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    host: url.hostname,
    port: Number(url.port || 5432),
    database: url.pathname.replace(/^\//, '') || 'postgres',
  };
}

async function connectIpv4Direct(password, ref) {
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
  console.log(`Connected via IPv4 ${ipv4} (${hostname})`);
  return client;
}

async function connectFromUrl(connectionString) {
  const parsed = parseConnectionString(connectionString);
  const safeHost = connectionString.replace(/:[^:@/]+@/, ':***@');

  // Supabase direct db.* host — resolve IPv4 to avoid ENETUNREACH on GitHub Actions
  if (/^db\.[a-z0-9]+\.supabase\.co$/i.test(parsed.host)) {
    const ipv4 = (await dnsPromises.resolve4(parsed.host))[0];
    const client = new pg.Client({
      host: ipv4,
      port: parsed.port,
      user: parsed.user,
      password: parsed.password,
      database: parsed.database,
      ssl: { rejectUnauthorized: false, servername: parsed.host },
      connectionTimeoutMillis: 25_000,
    });
    await client.connect();
    console.log(`Connected via IPv4 ${ipv4} (${parsed.host})`);
    return client;
  }

  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 25_000,
  });
  await client.connect();
  console.log(`Connected via ${safeHost}`);
  return client;
}

export async function connectPostgres(options = {}) {
  const password = process.env.SUPABASE_DB_PASSWORD?.trim();
  const ref = resolveProjectRef(options);

  // Best path for GitHub Actions: IPv4 literal to db.{ref}.supabase.co
  if (password && ref && !process.env.DATABASE_URL?.trim()) {
    try {
      return await connectIpv4Direct(password, ref);
    } catch (err) {
      console.warn(`IPv4 direct connect failed: ${err.message}`);
    }
  }

  const urls = resolveDatabaseUrls(options);
  if (!urls.length) {
    throw new Error('No database URLs configured');
  }

  let lastError;

  for (const connectionString of urls) {
    const safeHost = connectionString.replace(/:[^:@/]+@/, ':***@');
    try {
      return await connectFromUrl(connectionString);
    } catch (err) {
      lastError = err;
      console.warn(`Connection failed (${safeHost}): ${err.message}`);
    }
  }

  throw lastError ?? new Error('All database connection attempts failed');
}
