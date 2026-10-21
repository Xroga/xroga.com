import { z } from 'zod';

const strings = z.array(z.string());
export const dependencySchema = z.strictObject({
  dependency_id: z.string().regex(/^[a-z][a-z0-9_-]*$/), provider: z.string(), purpose: z.string(),
  environment: z.enum(['PRODUCTION', 'PREVIEW', 'LOCAL', 'PROPOSED']),
  state: z.enum(['ACTIVE', 'CONFIGURED_BUT_UNVERIFIED', 'LEGACY', 'LOCAL_ONLY', 'PROPOSED']),
  runtime_owner: z.string(), config_sources: strings, hostnames: strings, resource_id: z.string().nullable(),
  region: z.string(), auth_mechanism: z.string(), secret_names: strings, inbound_callers: strings,
  outbound_dependencies: strings, health_readiness: z.string(), timeout: z.string(), retry_policy: z.string(),
  idempotency_expectation: z.string(), data_classification: z.string(), failure_mode: z.string(),
  fallback_behaviour: z.string(), observability_source: strings, production_verification: z.string(),
  evidence_ids: strings,
});
export const environmentSchema = z.strictObject({
  name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/), consuming_sources: strings, environments: strings,
  secret_class: z.enum(['SERVER_CREDENTIAL', 'PUBLIC_CREDENTIAL', 'PUBLIC_IDENTIFIER', 'RUNTIME_CONFIGURATION', 'SYSTEM_CONFIGURATION']),
  rotation_owner: z.string(), requiredness: z.enum(['REQUIRED_FOR_CORE_AUTH', 'CONDITIONAL_ON_CAPABILITY', 'OPTIONAL_OR_DEFAULTED', 'SYSTEM_PROVIDED']),
  startup_validation: z.string(), mechanisms: strings, dependency_ids: strings,
});
export const runtimeInventorySchema = z.strictObject({
  version: z.literal('1.0'), source_sha: z.string().regex(/^[0-9a-f]{40}$/),
  assessment: z.literal('READ_ONLY_RUNTIME_AUDIT'), dependencies: z.array(dependencySchema),
  environment_names: z.array(environmentSchema), manifests: z.array(z.strictObject({ path: z.string(), presence: z.enum(['PRESENT', 'ABSENT']), role: z.string() })),
  source_hashes: z.array(z.strictObject({ path: z.string(), sha256: z.string().regex(/^[0-9a-f]{64}$/) })),
  dynamic_bindings: z.array(z.strictObject({ path: z.string(), line: z.number().int(), expression: z.string(),
    status: z.enum(['RESOLVED_FINITE_CATALOG', 'RESOLVED_CALLER_POLICY', 'REQUIRES_BINDING_REVIEW']), names: strings, evidence_sources: strings, policy: z.string() })),
  source_endpoints: z.array(z.strictObject({ hostname: z.string(), protocol: z.string(), path: z.string(), line: z.number().int(), credentialsInUrl: z.boolean() })),
  fallback_candidates: z.array(z.strictObject({ path: z.string(), line: z.number().int(), scope: z.string(), mechanism: z.string(), status: z.string() })),
  risks: z.array(z.strictObject({ id: z.string(), severity: z.enum(['P0', 'P1', 'P2', 'P3']), source_paths: strings, summary: z.string(), disposition: z.string(), owner_command: z.string() })),
  evidence: z.array(z.strictObject({ id: z.string(), source: z.string(), observed_utc: z.string(), result: z.string(), safe_resource: z.string(), release_sha: z.string().nullable() })),
  limitations: strings,
});
export const runtimeJsonSchema = z.toJSONSchema(runtimeInventorySchema, { target: 'draft-7' });
