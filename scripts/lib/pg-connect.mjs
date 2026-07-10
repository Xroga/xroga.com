/**
 * Postgres connect for Supabase — uses IPv4 pooler (GitHub Actions compatible).
 * Direct db.*.supabase.co is IPv6-only and fails on GitHub runners.
 */
import dns from 'dns';
import pg from 'pg';
import { resolveDatabaseUrls } from './database-url.mjs';

dns.setDefaultResultOrder('ipv4first');

export async function connectPostgres(options = {}) {
  const urls = resolveDatabaseUrls(options);
  if (!urls.length) {
    throw new Error('No database URLs configured');
  }

  let lastError;

  for (const connectionString of urls) {
    const safeHost = connectionString.replace(/:[^:@/]+@/, ':***@');
    const client = new pg.Client({
      connectionString,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 12_000,
    });

    try {
      await client.connect();
      console.log(`Connected via ${safeHost}`);
      return client;
    } catch (err) {
      lastError = err;
      const msg = err.message ?? String(err);
      // Wrong region — try next pooler host
      if (/ENOTFOUND|tenant\/user|does not exist|timeout/i.test(msg)) {
        console.warn(`Skip ${safeHost}: ${msg}`);
      } else {
        console.warn(`Connection failed (${safeHost}): ${msg}`);
      }
      try {
        await client.end();
      } catch {
        // ignore
      }
    }
  }

  throw lastError ?? new Error('All database connection attempts failed');
}
