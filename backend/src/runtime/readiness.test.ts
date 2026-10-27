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

    it('quota and housekeeping are reported, never blocking: unset quota and an unscheduled reconcile are visible, configured ones are clean', async () => {
      const bare = await verdict(drive, { ...okDb, databaseUrls: dbUrls, databaseTls: async () => ({ ok: true, stage: 'tls' }) });
      assert.equal(bare.ready, true, 'unlimited storage is a decision, not an outage');
      assert.equal(reasonOf(bare, 'storage_quota'), 'storage_quota_not_enforced');
      assert.equal(reasonOf(bare, 'storage_housekeeping'), 'storage_reconcile_not_scheduled');
      const set = await verdict({ ...drive, STORAGE_QUOTA_BYTES: '5368709120', XROGA_STORAGE_RECONCILE_MODE: 'cloud' }, { ...okDb, databaseUrls: dbUrls, databaseTls: async () => ({ ok: true, stage: 'tls' }) });
      assert.equal(reasonOf(set, 'storage_quota'), undefined);
      assert.equal(reasonOf(set, 'storage_housekeeping'), undefined);
      assert.equal((await verdict(prod)).checks.find((c) => c.name === 'storage_quota')?.status, 'ok', 'nothing to report while Drive is off');
    });

    it('a quota that is set but not a whole number of bytes is not ready: it must never read as "no limit"', async () => {
      for (const bad of ['10GB', '-1', '1e9', '5.5', 'unlimited']) {
        const r = await verdict({ ...drive, STORAGE_QUOTA_BYTES: bad }, { ...okDb, databaseUrls: dbUrls, databaseTls: async () => ({ ok: true, stage: 'tls' }) });
        assert.equal(r.ready, false, bad);
        assert.equal(reasonOf(r, 'storage'), 'storage_config_invalid', bad);
      }
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

  describe('managed credential custody (Batch 1 environment contract: XROGA_CREDENTIAL_KMS_PROVIDER)', () => {
    const need = { ...prod, XROGA_REQUIRE_MANAGED_CUSTODY: '1' };
    const GKEY = 'projects/p/locations/l/keyRings/r/cryptoKeys/k';
    const google = { ...need, XROGA_CREDENTIAL_KMS_PROVIDER: 'google_cloud', XROGA_GOOGLE_CLOUD_KMS_KEY_NAME: GKEY };
    const oci = { ...need, XROGA_CREDENTIAL_KMS_PROVIDER: 'oci', XROGA_OCI_KMS_KEY_ID: 'ocid1.key.oc1.me-dubai-1.x', XROGA_OCI_KMS_ENDPOINT: 'https://kms.example', XROGA_OCI_KMS_KEY_VERSION: 'ocid1.keyversion.oc1.x', XROGA_OCI_KMS_AUTH_MODE: 'instance_principal', XROGA_OCI_KMS_PRINCIPAL_ID: 'ocid1.instance.oc1.x' };

    it('is not required unless declared; once declared it needs a provider', async () => {
      assert.equal((await verdict(prod)).checks.some((c) => c.name === 'credential_custody'), false);
      const r = await verdict(need);
      assert.equal(r.ready, false);
      assert.equal(reasonOf(r, 'credential_custody'), 'custody_provider_not_configured');
    });

    it('accepts exactly the combinations Batch 1\'s startup accepts', async () => {
      assert.equal((await verdict(google)).ready, true);
      assert.equal((await verdict(oci)).ready, true);
      for (const mode of ['resource_principal', 'workload_federation']) assert.equal((await verdict({ ...oci, XROGA_OCI_KMS_AUTH_MODE: mode })).ready, true, mode);
    });

    it('refuses the combinations Batch 1\'s startup refuses: missing, mixed, partial or unknown', async () => {
      const bad: Array<[string, NodeJS.ProcessEnv]> = [
        ['google without a key name', { ...google, XROGA_GOOGLE_CLOUD_KMS_KEY_NAME: '' }],
        ['google with an OCI variable beside it', { ...google, XROGA_OCI_KMS_KEY_ID: 'ocid1.key.oc1.x' }],
        ['oci missing a variable', { ...oci, XROGA_OCI_KMS_ENDPOINT: '' }],
        ['oci with a google key beside it', { ...oci, XROGA_GOOGLE_CLOUD_KMS_KEY_NAME: GKEY }],
        ['oci with an unknown auth mode', { ...oci, XROGA_OCI_KMS_AUTH_MODE: 'cli_profile' }],
        ['unknown provider', { ...need, XROGA_CREDENTIAL_KMS_PROVIDER: 'local-file', XROGA_GOOGLE_CLOUD_KMS_KEY_NAME: GKEY }],
        ['a key name with no provider', { ...need, XROGA_GOOGLE_CLOUD_KMS_KEY_NAME: GKEY }],
        ['the invented names used before alignment', { ...need, XROGA_MANAGED_CUSTODY_PROVIDER: 'oci-kms' }],
      ];
      for (const [label, e] of bad) assert.equal((await verdict(e)).ready, false, label);
      assert.equal(reasonOf(await verdict({ ...google, XROGA_OCI_KMS_KEY_ID: 'ocid1.key.oc1.x' }), 'credential_custody'), 'custody_config_invalid');
    });

    it('development or test key material beside required managed custody is not ready, even with a valid provider', async () => {
      for (const k of ['XROGA_DEV_CREDENTIAL_KEK', 'XROGA_TEST_CREDENTIAL_KEK']) {
        assert.equal(reasonOf(await verdict({ ...google, [k]: 'abc' }), 'credential_custody'), 'custody_dev_key_present', k);
      }
    });

    it('uses Batch 1\'s live round trip when it is supplied, and reports only a fixed code when it fails', async () => {
      let calls = 0;
      const healthy = await verdict(google, { ...okDb, custodyRoundTrip: async () => { calls++; return true; } });
      assert.equal(healthy.ready, true);
      assert.equal(calls, 1);
      const down = await verdict(google, { ...okDb, custodyRoundTrip: async () => false });
      assert.equal(reasonOf(down, 'credential_custody'), 'credential_provider_unavailable');
      const throws = await verdict(google, { ...okDb, custodyRoundTrip: async () => { throw new Error('PERMISSION_DENIED projects/p key k'); } });
      assert.equal(throws.ready, false);
      assert.ok(!JSON.stringify(throws).includes('PERMISSION_DENIED'));
      // a bad configuration never reaches the provider
      let reached = false;
      await verdict({ ...google, XROGA_GOOGLE_CLOUD_KMS_KEY_NAME: '' }, { ...okDb, custodyRoundTrip: async () => { reached = true; return true; } });
      assert.equal(reached, false);
    });
  });
});
