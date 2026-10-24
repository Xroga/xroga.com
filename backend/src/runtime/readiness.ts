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
import { resolveStorageConfig } from '../storage/runtime.js';
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
  /** candidate database URLs; defaults to the process environment's resolution */
  databaseUrls?: () => string[];
}

const truthy = (v: string | undefined) => /^(1|true|yes|on)$/i.test((v ?? '').trim());

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

  if (truthy(env.XROGA_REQUIRE_MANAGED_CUSTODY)) {
    probes.push({
      name: 'credential_custody', required: true,
      run: async () => {
        // development and test key material must never be present where managed custody is required
        if (env.XROGA_DEV_CREDENTIAL_KEK || env.XROGA_TEST_CREDENTIAL_KEK) return 'custody_dev_key_present';
        const managed = Boolean(env.XROGA_GOOGLE_CLOUD_KMS_KEY_NAME) || /^(google-cloud-kms|oci-kms)$/.test(env.XROGA_MANAGED_CUSTODY_PROVIDER ?? '');
        return managed ? null : 'custody_provider_not_configured';
      },
    });
  }
  return probes;
}
