/**
 * Shared Postgres connect helper — prefers IPv4, tries pooler then direct.
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
      connectionTimeoutMillis: 20_000,
    });

    try {
      await client.connect();
      console.log(`Connected via ${safeHost}`);
      return client;
    } catch (err) {
      lastError = err;
      console.warn(`Connection failed (${safeHost}): ${err.message}`);
      try {
        await client.end();
      } catch {
        // ignore
      }
    }
  }

  throw lastError ?? new Error('All database connection attempts failed');
}
