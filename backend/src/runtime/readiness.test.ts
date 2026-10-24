import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { apiProbes, runReadiness, type ApiProbeDeps, type ReadinessProbe } from './readiness.js';

const prod = { FLY_APP_NAME: 'xroga-api', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'srv-key-not-real' };
const okDb: ApiProbeDeps = { database: async () => undefined, databaseUrls: () => [] };
const verdict = async (env: NodeJS.ProcessEnv, deps: ApiProbeDeps = okDb) => runReadiness(apiProbes(env, deps), 500);
const reasonOf = (r: Awaited<ReturnType<typeof verdict>>, name: string) => r.checks.find((c) => c.name === name)?.reason;

describe('readiness evaluator', () => {
  it('ready only when every required probe passes; an optional failure is reported but not blocking', async () => {
    const probes: ReadinessProbe[] = [
      { name: 'a', required: true, run: async () => null },
      { name: 'b', required: false, run: async () => 'optional_down' },
    ];
    const r = await runReadiness(probes);
    assert.equal(r.ready, true);
    assert.deepEqual(r.checks, [{ name: 'a', status: 'ok' }, { name: 'b', status: 'fail', reason: 'optional_down' }]);
    assert.equal((await runReadiness([...probes, { name: 'c', required: true, run: async () => 'x_down' }])).ready, false);
  });

  it('never leaks exception text, hosts or credentials: only fixed reason codes', async () => {
    const r = await runReadiness([
      { name: 'throws', required: true, run: async () => { throw new Error('connect ECONNREFUSED 10.1.2.3:5432 password=hunter2'); } },
      { name: 'returns-text', required: true, run: async () => 'could not reach postgres://user:pw@host/db' },
    ]);
    const dump = JSON.stringify(r);
    assert.ok(!/hunter2|10\.1\.2\.3|postgres:|user:pw/.test(dump), dump);
    assert.deepEqual(r.checks.map((c) => c.reason), ['probe_error', 'check_failed']);
  });

  it('a probe that never answers is not ready after the timeout', async () => {
    const r = await runReadiness([{ name: 'hangs', required: true, run: () => new Promise(() => undefined) }], 50);
    assert.equal(r.ready, false);
    assert.equal(r.checks[0]!.reason, 'timeout');
  });
});

describe('API readiness', () => {
  it('the production app with a reachable database is ready', async () => {
    const r = await verdict(prod);
    assert.equal(r.ready, true, JSON.stringify(r));
  });

  it('missing database configuration or an unreachable database is not ready', async () => {
    assert.equal(reasonOf(await verdict({ FLY_APP_NAME: 'xroga-api' }), 'database'), 'database_not_configured');
    assert.equal(reasonOf(await verdict({ FLY_APP_NAME: 'xroga-api', SUPABASE_URL: 'https://x.supabase.co' }), 'database'), 'database_not_configured');
    const down = await verdict(prod, { ...okDb, database: async () => { throw new Error('boom'); } });
    assert.equal(down.ready, false);
    assert.equal(reasonOf(down, 'database'), 'database_unavailable');
  });

  it('an unclassified environment is not ready: a host nobody identified is never routed traffic', async () => {
    const r = await verdict({ SUPABASE_URL: prod.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: prod.SUPABASE_SERVICE_ROLE_KEY });
    assert.equal(r.ready, false);
    assert.equal(reasonOf(r, 'environment'), 'environment_unclassified');
  });

  describe('storage (Drive)', () => {
    const drive = { ...prod, STORAGE_WRITE_MODE: 'r2', XROGA_DRIVE_R2_ACCESS_KEY_ID: 'a', XROGA_DRIVE_R2_SECRET_ACCESS_KEY: 'b', XROGA_DRIVE_R2_BUCKET: 'xroga-drive', XROGA_DRIVE_R2_ACCOUNT_ID: 'acc', DATABASE_URL: 'postgresql://u:p@db.example.supabase.co:5432/postgres' };
    const dbUrls = () => [drive.DATABASE_URL];

    it('legacy mode needs nothing from Drive: a missing bucket does not block readiness', async () => {
      assert.equal((await verdict(prod)).ready, true);
    });

    it('write mode r2 without credentials or bucket is not ready', async () => {
      const r = await verdict({ ...prod, STORAGE_WRITE_MODE: 'r2' });
      assert.equal(r.ready, false);
      assert.equal(reasonOf(r, 'storage'), 'storage_config_invalid');
    });

    it('an invalid switch is not ready even in legacy mode (a typo must be loud)', async () => {
      const r = await verdict({ ...prod, STORAGE_WRITE_MODE: 'r3' });
      assert.equal(reasonOf(r, 'storage'), 'storage_config_invalid');
    });

    it('a database URL that asks to skip verification is refused by the same planner the pool uses', async () => {
      const r = await verdict(drive, { ...okDb, databaseUrls: () => [`${drive.DATABASE_URL}?sslmode=no-verify`] });
      assert.equal(r.ready, false);
      assert.equal(reasonOf(r, 'storage'), 'storage_database_tls_policy');
    });

    it('a TLS verification failure is not ready; a verified handshake is ready', async () => {
      const bad = await verdict(drive, { ...okDb, databaseUrls: dbUrls, databaseTls: async () => ({ ok: false, stage: 'tls', error: 'SELF_SIGNED_CERT_IN_CHAIN' }) });
      assert.equal(bad.ready, false);
      assert.equal(reasonOf(bad, 'storage'), 'storage_database_tls_failed');
      assert.ok(!JSON.stringify(bad).includes('SELF_SIGNED'), 'provider error text stays out of the public result');
      const good = await verdict(drive, { ...okDb, databaseUrls: dbUrls, databaseTls: async () => ({ ok: true, stage: 'tls' }) });
      assert.equal(good.ready, true, JSON.stringify(good));
    });

    it('no database URL while Drive is on is not ready', async () => {
      const r = await verdict(drive, { ...okDb, databaseUrls: () => [] });
      assert.equal(reasonOf(r, 'storage'), 'storage_database_not_configured');
    });
  });

  describe('managed credential custody', () => {
    it('is not required unless declared; once declared it needs a managed provider', async () => {
      assert.equal((await verdict(prod)).checks.some((c) => c.name === 'credential_custody'), false);
      const r = await verdict({ ...prod, XROGA_REQUIRE_MANAGED_CUSTODY: '1' });
      assert.equal(r.ready, false);
      assert.equal(reasonOf(r, 'credential_custody'), 'custody_provider_not_configured');
    });

    it('a configured managed provider satisfies it', async () => {
      assert.equal((await verdict({ ...prod, XROGA_REQUIRE_MANAGED_CUSTODY: 'true', XROGA_GOOGLE_CLOUD_KMS_KEY_NAME: 'projects/p/locations/l/keyRings/r/cryptoKeys/k' })).ready, true);
      assert.equal((await verdict({ ...prod, XROGA_REQUIRE_MANAGED_CUSTODY: 'on', XROGA_MANAGED_CUSTODY_PROVIDER: 'oci-kms' })).ready, true);
    });

    it('development or test key material alongside required managed custody is not ready, even with a provider set', async () => {
      for (const k of ['XROGA_DEV_CREDENTIAL_KEK', 'XROGA_TEST_CREDENTIAL_KEK']) {
        const r = await verdict({ ...prod, XROGA_REQUIRE_MANAGED_CUSTODY: '1', XROGA_GOOGLE_CLOUD_KMS_KEY_NAME: 'k', [k]: 'abc' });
        assert.equal(reasonOf(r, 'credential_custody'), 'custody_dev_key_present', k);
      }
    });

    it('an unrecognised provider name does not count', async () => {
      const r = await verdict({ ...prod, XROGA_REQUIRE_MANAGED_CUSTODY: '1', XROGA_MANAGED_CUSTODY_PROVIDER: 'local-file' });
      assert.equal(reasonOf(r, 'credential_custody'), 'custody_provider_not_configured');
    });
  });
});
