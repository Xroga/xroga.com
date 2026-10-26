import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sha = /^[a-f0-9]{40}$/;
const digest = /^sha256:[a-f0-9]{64}$/;
const forbidden = /^(?:FLY_|XROGA_.*(?:FLY|WIF)|GOOGLE_APPLICATION_CREDENTIALS$|GOOGLE_CREDENTIALS$|CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE$|GCE_METADATA_(?:HOST|IP)$)/;
const requireCondition = (condition, code) => { if (!condition) throw new Error(code); };
const onlyKeys = (value, allowed) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).every(key => allowed.includes(key));

/** Deterministic deployment preflight, not a substitute for authenticated live
 * tests, image provenance, owner approval or the original acceptance evaluator.
 * Inputs are saved API readbacks and the reviewed, source-bound release contract.
 * Errors contain stable codes only, never environment values or credentials. */
export function validateCloudRunRelease(actual, expected) {
  requireCondition(expected && sha.test(expected.sourceSha), 'SOURCE_SHA_REQUIRED');
  requireCondition(typeof expected.project === 'string' && /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(expected.project), 'PROJECT_REQUIRED');
  requireCondition(typeof expected.service === 'string' && /^[a-z][a-z0-9-]{0,62}$/.test(expected.service), 'SERVICE_REQUIRED');
  const registry = new RegExp(`^[a-z0-9-]+-docker\\.pkg\\.dev/${expected.project}/[a-z0-9_./-]+@(sha256:[a-f0-9]{64})$`);
  requireCondition(typeof expected.image === 'string' && registry.test(expected.image), 'IMMUTABLE_GOOGLE_IMAGE_REQUIRED');
  requireCondition(typeof expected.recoveryImage === 'string' && registry.test(expected.recoveryImage)
    && expected.recoveryImage !== expected.image, 'IMMUTABLE_GOOGLE_RECOVERY_REQUIRED');
  requireCondition(typeof expected.serviceAccount === 'string'
    && new RegExp(`^[a-z][a-z0-9-]{5,29}@${expected.project}\\.iam\\.gserviceaccount\\.com$`).test(expected.serviceAccount), 'DEDICATED_NATIVE_IDENTITY_REQUIRED');
  requireCondition(typeof expected.keyName === 'string'
    && new RegExp(`^projects/${expected.project}/locations/[a-z0-9-]+/keyRings/[A-Za-z0-9_-]{1,63}/cryptoKeys/[A-Za-z0-9_-]{1,63}$`).test(expected.keyName), 'EXACT_KEY_REQUIRED');
  const bundle = expected.platformConfigBinding;
  requireCondition(bundle === undefined || (onlyKeys(bundle, ['secret','version'])
    && /^[A-Za-z0-9_-]+$/.test(bundle.secret ?? '') && /^[1-9][0-9]*$/.test(bundle.version ?? '')), 'PINNED_CONFIG_BUNDLE_REQUIRED');
  requireCondition(Array.isArray(expected.secretBindings) && (expected.secretBindings.length > 0 || bundle)
    && new Set(expected.secretBindings.map(binding => binding.name)).size === expected.secretBindings.length
    && expected.secretBindings.every(binding => typeof binding.name === 'string' && /^[A-Z][A-Z0-9_]*$/.test(binding.name)
      && typeof binding.secret === 'string' && /^[A-Za-z0-9_-]+$/.test(binding.secret)
      && /^[1-9][0-9]*$/.test(binding.version)), 'PINNED_SECRET_PARITY_REQUIRED');
  requireCondition(expected.minInstances === 1 && Number.isInteger(expected.maxInstances)
    && expected.maxInstances >= 1 && expected.maxInstances <= 3, 'BOUNDED_INSTANCE_LIMIT_REQUIRED');
  requireCondition(actual?.service?.metadata?.name === expected.service, 'SERVICE_MISMATCH');
  const template = actual.service.spec?.template;
  const specification = template?.spec;
  requireCondition(specification?.serviceAccountName === expected.serviceAccount, 'NATIVE_IDENTITY_MISMATCH');
  requireCondition(specification?.containers?.length === 1, 'SINGLE_API_CONTAINER_REQUIRED');
  const container = specification.containers[0];
  requireCondition(container.image === expected.image, 'IMAGE_DIGEST_MISMATCH');
  const environment = container.env ?? [];
  requireCondition(Array.isArray(environment) && environment.every(value => value && typeof value.name === 'string')
    && new Set(environment.map(value => value.name)).size === environment.length, 'INVALID_ENVIRONMENT');
  requireCondition(!environment.some(value => forbidden.test(value.name)), 'FOREIGN_IDENTITY_CONFIGURATION');
  // The SHA comes from the independently verified immutable image, not an env override.
  requireCondition(!environment.some(value => value.name === 'XROGA_RELEASE_SHA'), 'RELEASE_IDENTITY_OVERRIDE');
  const env = new Map(environment.map(value => [value.name, value]));
  requireCondition(expected.plainEnvironment && typeof expected.plainEnvironment === 'object'
    && !Array.isArray(expected.plainEnvironment)
    && Object.entries(expected.plainEnvironment).every(([name,value]) =>
      /^[A-Z][A-Z0-9_]*$/.test(name) && !forbidden.test(name)
      && !/(?:TOKEN|SECRET|PASSWORD|PRIVATE|API_KEY|DATABASE_URL|ENCRYPTION_KEY)/.test(name)
      && typeof value === 'string' && !/\b(?:fly\.io|fly\.dev|flycast)\b/.test(value)), 'REVIEWED_PLAIN_CONFIGURATION_REQUIRED');
  const plain = { ...expected.plainEnvironment, NODE_ENV:'production', XROGA_CREDENTIAL_KMS_PROVIDER:'google_cloud',
    XROGA_GOOGLE_CLOUD_AUTH_MODE:'metadata_adc', XROGA_GOOGLE_CLOUD_KMS_KEY_NAME:expected.keyName };
  for (const [name, value] of Object.entries(plain)) {
    requireCondition(env.get(name)?.value === value, 'MANAGED_CUSTODY_CONFIGURATION_MISMATCH');
  }
  const allowedNames = new Set([...Object.keys(plain), ...expected.secretBindings.map(binding => binding.name)]);
  requireCondition(environment.every(value => allowedNames.has(value.name)), 'UNREVIEWED_ENVIRONMENT');
  for (const binding of expected.secretBindings) {
    const configured = env.get(binding.name);
    requireCondition(!Object.hasOwn(configured ?? {}, 'value')
      && configured?.valueFrom?.secretKeyRef?.name === binding.secret
      && configured.valueFrom.secretKeyRef.key === binding.version, 'SECRET_BINDING_MISMATCH');
  }
  const volumes = specification.volumes ?? [], mounts = container.volumeMounts ?? [];
  requireCondition(Array.isArray(volumes) && Array.isArray(mounts), 'INVALID_SECRET_MOUNTS');
  if (bundle) {
    requireCondition(plain.XROGA_PLATFORM_CONFIG_FILE === '/secrets/xroga-platform/config.json', 'CONFIG_BUNDLE_PATH_MISMATCH');
    const volume = volumes[0], mount = mounts[0], secret = volume?.secret, item = secret?.items?.[0];
    requireCondition(volumes.length === 1 && onlyKeys(volume, ['name','secret']) && volume.name === 'xroga-platform'
      && onlyKeys(secret, ['secretName','items','defaultMode']) && secret.secretName === bundle.secret
      && (secret.defaultMode === undefined || secret.defaultMode === 292)
      && Array.isArray(secret.items) && secret.items.length === 1 && onlyKeys(item, ['key','path','mode'])
      && item.key === bundle.version && item.path === 'config.json' && item.mode === 292
      && mounts.length === 1 && onlyKeys(mount, ['name','mountPath']) && mount.name === volume.name
      && mount.mountPath === '/secrets/xroga-platform', 'CONFIG_BUNDLE_MOUNT_MISMATCH');
  } else {
    requireCondition(volumes.length === 0 && mounts.length === 0 && !env.has('XROGA_PLATFORM_CONFIG_FILE'), 'UNREVIEWED_SECRET_MOUNT');
  }
  // Secret lookup aliases must not redirect an otherwise correct local name to
  // another project or credential. Provider-added unrelated annotations remain allowed.
  const secretNames = new Set([...expected.secretBindings.map(binding => binding.secret), ...(bundle ? [bundle.secret] : [])]);
  for (const annotations of [actual.service.metadata?.annotations, template.metadata?.annotations]) {
    const aliases = annotations?.['run.googleapis.com/secrets'];
    if (aliases === undefined) continue;
    requireCondition(typeof aliases === 'string' && aliases.length > 0, 'INVALID_SECRET_ALIAS');
    const seen = new Set();
    for (const mapping of aliases.split(',')) {
      const match = /^([A-Za-z0-9_-]+):projects\/([a-z0-9-]+)\/secrets\/([A-Za-z0-9_-]+)$/.exec(mapping.trim());
      requireCondition(match && !seen.has(match[1]) && secretNames.has(match[1]) && match[1] === match[3]
        && (match[2] === expected.project || (/^[0-9]+$/.test(expected.projectNumber ?? '') && match[2] === expected.projectNumber)), 'UNREVIEWED_SECRET_ALIAS');
      seen.add(match[1]);
    }
  }
  const annotations = template.metadata?.annotations ?? {};
  requireCondition(annotations['run.googleapis.com/cpu-throttling'] === 'false'
    && annotations['autoscaling.knative.dev/minScale'] === String(expected.minInstances)
    && annotations['autoscaling.knative.dev/maxScale'] === String(expected.maxInstances), 'BACKGROUND_CPU_OR_SCALE_MISMATCH');
  requireCondition(specification.timeoutSeconds === 3600, 'STREAM_TIMEOUT_MISMATCH');
  requireCondition(container.resources?.limits?.cpu === '1000m' && container.resources?.limits?.memory === '1Gi', 'RESOURCE_CEILING_MISMATCH');
  requireCondition(actual.health?.status === 'ok' && actual.health.release === expected.sourceSha
    && actual.readiness?.status === 'ready' && actual.readiness.release === expected.sourceSha, 'LIVE_RELEASE_OR_CUSTODY_NOT_READY');
  requireCondition(actual.service.status?.conditions?.some(condition => condition.type === 'Ready' && condition.status === 'True'), 'GOOGLE_SERVICE_NOT_READY');
  requireCondition(actual.recovery?.image === expected.recoveryImage && digest.test(actual.recovery?.verifiedDigest)
    && expected.recoveryImage.endsWith(`@${actual.recovery.verifiedDigest}`), 'RECOVERY_IMAGE_NOT_RETAINED');
  requireCondition(actual.deploymentTrigger?.disabled === true, 'AUTOMATIC_DEPLOYMENT_NOT_HELD');
  return { result:'PASS_NATIVE_API_PREFLIGHT_NOT_CUTOVER_ACCEPTANCE', sourceSha:expected.sourceSha,
    image:expected.image, recoveryImage:expected.recoveryImage };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    requireCondition(process.argv.length === 4, 'USAGE_ACTUAL_JSON_EXPECTED_JSON');
    const actual = JSON.parse(readFileSync(process.argv[2], 'utf8'));
    const expected = JSON.parse(readFileSync(process.argv[3], 'utf8'));
    console.log(JSON.stringify(validateCloudRunRelease(actual, expected)));
  } catch (error) {
    // Do not echo parser failures, paths or input snippets that might contain secrets.
    console.error(JSON.stringify({ result:'BLOCKED_NATIVE_API_PREFLIGHT',
      code:error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'INVALID_PREFLIGHT_INPUT' }));
    process.exitCode = 1;
  }
}
