/**
 * Readiness: may this process be sent traffic or work? (INFRA-005)
 *
 * `/health` answers "is the process up". Readiness answers "are its mandatory dependencies present and correctly configured", and a
 * missing one means NOT READY, never "degraded but serving". Every probe reports a fixed reason code and nothing else: no host name,
 * URL, credential, exception text or provider message ever appears in the result, because /ready is reachable without authentication.
 *
 * Probes are plain data plus an injected check, so the same evaluator serves the API, a worker and the browser worker, and the tests
 * need no network.
 */
import { resolveDatabaseUrls } from '../lib/postgresConnect.js';
import { DatabaseTlsError, planDatabaseConnection, type DatabaseConnectionPlan, type TlsProbeResult } from '../storage/databaseTls.js';
import { resolveStorageConfig, resolveStorageQuota } from '../storage/runtime.js';
import { resolveDeploymentEnvironment } from './startupPolicy.js';

export interface ReadinessProbe {
  name: string;
  /** a failing required probe makes the process not ready; an optional one is reported only */
  required: boolean;
  /** null = ok; a string is a short fixed reason code */
  run: () => Promise<string | null>;
}

export interface ReadinessCheck {
  name: string;
  status: 'ok' | 'fail';
  reason?: string;
}

export interface ReadinessResult {
  ready: boolean;
  checks: ReadinessCheck[];
}

const CODE = /^[a-z][a-z0-9_]{1,63}$/;

export async function runReadiness(probes: readonly ReadinessProbe[], timeoutMs = 5_000): Promise<ReadinessResult> {
  const checks = await Promise.all(probes.map(async (probe): Promise<ReadinessCheck & { required: boolean }> => {
    let timer: NodeJS.Timeout | undefined;
    try {
      const outcome = await Promise.race([
        probe.run(),
        new Promise<string>((resolve) => { timer = setTimeout(() => resolve('timeout'), timeoutMs); }),
      ]);
      if (outcome === null) return { name: probe.name, status: 'ok', required: probe.required };
      return { name: probe.name, status: 'fail', reason: CODE.test(outcome) ? outcome : 'check_failed', required: probe.required };
    } catch {
      return { name: probe.name, status: 'fail', reason: 'probe_error', required: probe.required };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }));
  return {
    ready: checks.every((c) => c.status === 'ok' || !c.required),
    checks: checks.map(({ required: _r, ...c }) => c),
  };
}

export interface ApiProbeDeps {
  /** a cheap read through the same path the API uses; reject when the database is unreachable */
  database: () => Promise<void>;
  /** handshake-only TLS verification of the storage database (databaseTls.probeDatabaseTls); omitted in unit tests */
  databaseTls?: (plan: DatabaseConnectionPlan) => Promise<TlsProbeResult>;
  /** Batch 1's bounded synthetic key round trip, once it is in `main`; omitted until then (the configuration check still runs) */
  custodyRoundTrip?: () => Promise<boolean>;
  /** candidate database URLs; defaults to the process environment's resolution */
  databaseUrls?: () => string[];
}

const truthy = (v: string | undefined) => /^(1|true|yes|on)$/i.test((v ?? '').trim());

/**
 * Whether the managed-custody settings are the ones Batch 1's startup (`credentialVaultStartup.ts`) accepts: a provider named in
 * `XROGA_CREDENTIAL_KMS_PROVIDER`, exactly that provider's variables, and none of the other's. Names are Batch 1's, not new ones.
 * Returns a fixed reason code, or null when the combination is acceptable. It checks shape only and contacts no provider.
 */
export function managedCustodyConfigProblem(env: NodeJS.ProcessEnv): string | null {
  const provider = env.XROGA_CREDENTIAL_KMS_PROVIDER;
  const oci = [env.XROGA_OCI_KMS_KEY_ID, env.XROGA_OCI_KMS_ENDPOINT, env.XROGA_OCI_KMS_KEY_VERSION, env.XROGA_OCI_KMS_AUTH_MODE, env.XROGA_OCI_KMS_PRINCIPAL_ID];
  if (!provider) return 'custody_provider_not_configured';
  if (provider === 'google_cloud') return env.XROGA_GOOGLE_CLOUD_KMS_KEY_NAME && !oci.some(Boolean) ? null : 'custody_config_invalid';
  if (provider === 'oci') return !env.XROGA_GOOGLE_CLOUD_KMS_KEY_NAME && oci.every(Boolean) && ['instance_principal', 'resource_principal', 'workload_federation'].includes(env.XROGA_OCI_KMS_AUTH_MODE!) ? null : 'custody_config_invalid';
  return 'custody_config_invalid';
}

/** Everything a customer-facing API process needs before it is routed traffic. */
export function apiProbes(env: NodeJS.ProcessEnv, deps: ApiProbeDeps): ReadinessProbe[] {
  const probes: ReadinessProbe[] = [];

  probes.push({
    name: 'environment', required: true,
    run: async () => (resolveDeploymentEnvironment(env).environment === 'unclassified' ? 'environment_unclassified' : null),
  });

  probes.push({
    name: 'database', required: true,
    run: async () => {
      if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return 'database_not_configured';
      try { await deps.database(); return null; } catch { return 'database_unavailable'; }
    },
  });

  const storage = resolveStorageConfig(env);
  const driveEnabled = storage.writeMode !== 'legacy' || env.STORAGE_READ_ORDER?.trim().toLowerCase() === 'r2';
  probes.push({
    name: 'storage', required: driveEnabled,
    run: async () => {
      if (storage.problems.length) return 'storage_config_invalid';
      if (!driveEnabled) return null;
      const url = (deps.databaseUrls ?? resolveDatabaseUrls)()[0];
      if (!url) return 'storage_database_not_configured';
      let plan: DatabaseConnectionPlan;
      try { plan = planDatabaseConnection(url); } catch (e) {
        return e instanceof DatabaseTlsError ? 'storage_database_tls_policy' : 'storage_database_not_configured';
      }
      if (deps.databaseTls) {
        const probe = await deps.databaseTls(plan);
        if (!probe.ok) return 'storage_database_tls_failed';
      }
      return null;
    },
  });

  // Reported, never blocking: unlimited storage is a legitimate decision, but it must be visible rather than assumed.
  probes.push({
    name: 'storage_quota', required: false,
    run: async () => (driveEnabled && resolveStorageQuota(env).quota === null && !storage.problems.length ? 'storage_quota_not_enforced' : null),
  });
  probes.push({
    name: 'storage_housekeeping', required: false,
    run: async () => (driveEnabled && env.XROGA_STORAGE_RECONCILE_MODE !== 'cloud' ? 'storage_reconcile_not_scheduled' : null),
  });

  if (truthy(env.XROGA_REQUIRE_MANAGED_CUSTODY)) {
    probes.push({
      name: 'credential_custody', required: true,
      run: async () => {
        // development and test key material must never be present where managed custody is required
        if (env.XROGA_DEV_CREDENTIAL_KEK || env.XROGA_TEST_CREDENTIAL_KEK) return 'custody_dev_key_present';
        const code = managedCustodyConfigProblem(env);
        if (code) return code;
        // the live synthetic key round trip belongs to Batch 1's vault (`initializeCredentialVaultForServer().checkReadiness`), not to this
        // module: when that code is in `main` it is passed in here, so there is one custody check and no second implementation of it
        if (deps.custodyRoundTrip && !(await deps.custodyRoundTrip())) return 'credential_provider_unavailable';
        return null;
      },
    });
  }
  return probes;
}
