/**
 * Handshake-only check that the storage pool can verify the database it will connect to, run BEFORE enabling Drive or
 * moving the API (INFRA-005). It uses the same connection planner as the pool (backend/src/storage/databaseTls.ts) and
 * sends only an 8-byte SSLRequest and a TLS ClientHello: no user name, password, startup packet or query. Output is
 * redacted (host name and TLS result only; never the URL).
 *
 *   tsx scripts/storage/check-db-tls.mts            # every candidate URL from DATABASE_URL / SUPABASE_* settings
 *
 * Exit: 0 every candidate verified or loopback · 3 BLOCKED (no database URL configured) ·
 *       5 a candidate was refused by policy or its certificate chain did not verify.
 */
import { resolveDatabaseUrls } from '../../backend/src/lib/postgresConnect.js';
import { DatabaseTlsError, planDatabaseConnection, probeDatabaseTls } from '../../backend/src/storage/databaseTls.js';

const urls = resolveDatabaseUrls();
const report: Record<string, unknown> = { at: new Date().toISOString(), mode: 'handshake-only' };
if (!urls.length) {
  console.log(JSON.stringify({ ...report, status: 'BLOCKED', missing: ['DATABASE_URL (or SUPABASE_DB_URL / SUPABASE_DB_PASSWORD)'] }, null, 2));
  process.exit(3);
}

const results: unknown[] = [];
let failed = false;
for (const url of urls) {
  try {
    const plan = planDatabaseConnection(url);
    const probe = await probeDatabaseTls(plan);
    if (!probe.ok) failed = true;
    results.push({ host: plan.host, port: plan.port, tlsMode: plan.tls, ok: probe.ok, stage: probe.stage, error: probe.error, protocol: probe.protocol, peer: probe.peer });
  } catch (e) {
    failed = true;
    results.push({ ok: false, stage: 'policy', error: e instanceof DatabaseTlsError ? e.message : 'unexpected error' });
  }
}
console.log(JSON.stringify({ ...report, status: failed ? 'FAILED' : 'VERIFIED', candidates: results }, null, 2));
process.exit(failed ? 5 : 0);
