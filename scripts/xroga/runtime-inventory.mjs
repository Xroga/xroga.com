import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root } from '../ci/toolchain.mjs';
import { discoverRuntime } from './runtime-discovery.mjs';
import { coreServices, evidence } from './runtime-facts.mjs';
import { runtimeInventorySchema, runtimeJsonSchema } from './runtime-schema.mjs';

const ts = createRequire(import.meta.url)('typescript');
const read = path => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');
const sorted = values => [...new Set(values)].sort();
const hash = value => createHash('sha256').update(value).digest('hex');
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const manifestPaths = ['Dockerfile.api', 'Dockerfile.browser', 'fly.api.toml', 'fly.browser.toml', 'cloudbuild-run-job.yaml',
  'cloudbuild-browser-worker.yaml', 'vercel.json', '.vercel/project.json', ...execFileSync('git', ['ls-files', '.github/workflows'], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean)];

function declaredKeys(path, propertyNames, variableNames = []) {
  const source = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true);
  const keys = [];
  const take = node => { if (ts.isStringLiteral(node)) keys.push(node.text); else if (ts.isArrayLiteralExpression(node)) node.elements.forEach(take); };
  const visit = node => {
    if (ts.isPropertyAssignment(node) && propertyNames.includes(node.name.getText(source))) take(node.initializer);
    if (ts.isVariableDeclaration(node) && variableNames.includes(node.name.getText(source)) && node.initializer) {
      const value = ts.isAsExpression(node.initializer) ? node.initializer.expression : node.initializer; take(value);
    }
    ts.forEachChild(node, visit);
  };
  visit(source); return sorted(keys);
}
export function resolveDynamicBindings(discovery) {
  const modelSource = 'backend/src/ai/models.ts';
  const identifiers = declaredKeys(modelSource, ['modelIdEnv']);
  const modelKeys = sorted([...declaredKeys(modelSource, ['secretKey', 'imagesEnv']), ...identifiers,
    ...identifiers.flatMap(name => ['INPUT_USD_PER_1M', 'OUTPUT_USD_PER_1M', 'CONTEXT_WINDOW'].map(suffix => `${name.replace(/_MODEL_ID$/, '')}_${suffix}`))]);
  const openRouterPriceCapKeys = sorted(declaredKeys(modelSource, ['id']).flatMap(id =>
    ['INPUT', 'OUTPUT'].map(side => `XROGA_${id.toUpperCase()}_MAX_${side}_USD_PER_1M`)));
  const capabilityKeys = declaredKeys('backend/src/lib/capabilityRegistry.ts', ['requiredCredentials']);
  const sandboxKeys = declaredKeys('backend/src/sandbox/sandboxEnvironment.ts', [], ['ALLOWED_PASSTHROUGH']);
  const aliasKeys = discovery.readers.filter(row => row.mechanism === 'DECLARED_SECRET_ALIAS').map(row => row.name);
  return discovery.dynamic.map(binding => {
    let names = [], sources = [], policy = '', status = 'REQUIRES_BINDING_REVIEW';
    if (/^(?:backend\/src\/(?:ai\/(?:models|modelCapabilityRegistry|openaiCompat|providerCostTiers)|lib\/adaptiveOrchestrator|operations\/benchmarkAdapter)\.ts)$/.test(binding.path)) {
      names = modelKeys; sources = [modelSource, 'backend/src/ai/providerCostTiers.ts'];
      policy = 'Finite MODELS/CODING_MODEL_TIERS fields; operatorConfigKeys derives suffixes. Conditional pricing/context variables are not claims of current provider facts.'; status = 'RESOLVED_FINITE_CATALOG';
    } else if (binding.path === 'backend/src/ai/openRouterRouting.ts') {
      names = openRouterPriceCapKeys; sources = [modelSource, binding.path];
      policy = 'Finite MODELS ids derive INPUT/OUTPUT price-cap names; each value may only tighten its audited model ceiling.'; status = 'RESOLVED_FINITE_CATALOG';
    } else if (binding.path.endsWith('/config/envSecrets.ts') || binding.path.endsWith('/lib/platformReady.ts')) {
      names = sorted([...aliasKeys, ...discovery.readers.filter(row => row.mechanism === 'SECRET_HELPER_CALL').map(row => row.name)]);
      sources = ['backend/src/config/envSecrets.ts', 'backend/src/lib/platformReady.ts'];
      policy = 'Canonical aliases and actual literal helper callers, with model-field callers separately resolved. New nonliteral callers require review.'; status = 'RESOLVED_FINITE_CATALOG';
    } else if (binding.path.endsWith('/lib/capabilityRegistry.ts')) {
      names = capabilityKeys; sources = [binding.path]; policy = 'Finite requiredCredentials arrays in capability templates; unavailable providers are not active integrations.'; status = 'RESOLVED_FINITE_CATALOG';
    } else if (binding.path.endsWith('/sandbox/sandboxEnvironment.ts')) {
      names = sandboxKeys; sources = [binding.path]; policy = 'Finite inherited-variable allowlist. All other held secret values are compared only to refuse leakage, not forwarded.'; status = 'RESOLVED_FINITE_CATALOG';
    } else if (binding.path.endsWith('/operations/productionOperations.ts')) {
      sources = [binding.path]; policy = 'Caller-supplied names are used solely for boolean configuration status, never returned values. No finite deployment namespace is fabricated; new callers require authorization review.'; status = 'RESOLVED_CALLER_POLICY';
    }
    const reviewedExpressions = {
      'backend/src/ai/modelCapabilityRegistry.ts': ['def.secretKey'],
      'backend/src/ai/models.ts': ['keys.modelId', 'keys.inputPrice', 'keys.outputPrice', 'keys.contextWindow', 'def.imagesEnv'],
      'backend/src/ai/openaiCompat.ts': ['def.secretKey'], 'backend/src/ai/providerCostTiers.ts': ['tier.modelIdEnv'],
      'backend/src/ai/openRouterRouting.ts': ['`${prefix}_${key}_USD_PER_1M`'],
      'backend/src/config/envSecrets.ts': ['key', 'primary'], 'backend/src/lib/adaptiveOrchestrator.ts': ['def.secretKey'],
      'backend/src/lib/capabilityRegistry.ts': ['name'], 'backend/src/lib/platformReady.ts': ['key'],
      'backend/src/operations/benchmarkAdapter.ts': ['definition.secretKey'],
      'backend/src/operations/productionOperations.ts': ['key'], 'backend/src/sandbox/sandboxEnvironment.ts': ['name'],
    };
    if (!reviewedExpressions[binding.path]?.includes(binding.expression)) {status = 'REQUIRES_BINDING_REVIEW'; policy = 'New expression requires a source/caller audit';}
    return { ...binding, status, names, evidence_sources: sources, policy };
  });
}

function service(fact, names) {
  return { dependency_id: fact.id, provider: fact.provider, purpose: fact.purpose,
    environment: fact.state === 'PROPOSED' ? 'PROPOSED' : fact.state === 'LOCAL_ONLY' ? 'LOCAL' : 'PRODUCTION',
    state: fact.state, runtime_owner: fact.id === 'frontend' ? 'frontend' : 'backend/API or explicitly proposed component',
    config_sources: fact.sources, hostnames: fact.hosts, resource_id: fact.resource ?? null, region: fact.region,
    auth_mechanism: fact.auth, secret_names: names.filter(name => fact.keys.test(name)),
    inbound_callers: fact.id === 'frontend' ? ['browser'] : ['api or named source callers; operational reachability not inferred'],
    outbound_dependencies: fact.outbound, health_readiness: fact.health,
    timeout: 'Adapter-specific; no fabricated central timeout', retry_policy: 'Source-specific; no live retry test claimed',
    idempotency_expectation: 'Required for consequential writes; verify canonical authority in Command 008',
    data_classification: fact.id === 'credential-store' ? 'SECRET_CREDENTIALS' : 'User data may be involved; tenant scope requires independent checks',
    failure_mode: 'Safe user-facing failure required; internal details restricted',
    fallback_behaviour: fact.id === 'r2' ? 'No public/local/data-URL success fallback; explicit durable database text or verified private R2 only; actual R2 acceptance pending' : 'See source and recorded risks; no fallback newly enabled',
    observability_source: fact.sources, production_verification: fact.evidence.length ? 'Observed evidence explicitly scoped below; not full journey certification' : 'NOT_INDEPENDENTLY_VERIFIED', evidence_ids: fact.evidence };
}

export function buildRuntimeInventory({ sourceSha } = {}) {
  const discovery = discoverRuntime(), bindings = resolveDynamicBindings(discovery);
  const names = sorted([...discovery.envNames, ...bindings.flatMap(row => row.names)]);
  const dependencies = coreServices.map(fact => service(fact, names));
  // Literal endpoint definitions are candidates, not proof that documentation URLs
  // or every optional/retired adapter are live services.
  const endpointGroups = new Map();
  for (const endpoint of discovery.hosts) {
    if (dependencies.some(row => row.hostnames.includes(endpoint.hostname))) continue;
    const group = endpointGroups.get(endpoint.hostname) ?? []; group.push(endpoint.path); endpointGroups.set(endpoint.hostname, group);
  }
  for (const [hostname, paths] of [...endpointGroups].sort(([a], [b]) => a.localeCompare(b))) {
    const matchingNames = names.filter(name => discovery.readers.some(reader => reader.name === name && paths.includes(reader.path)));
    const endpointService = service({ id: `endpoint-${hostname.replace(/[^a-z0-9]/g, '-')}`, provider: `Source-defined endpoint ${hostname}`,
      purpose: 'Source-defined external host: adapter endpoint, public asset, evidence/reference or optional capability. Not automatically an infrastructure service; lifecycle/caller requires independent verification',
      state: /^(?:localhost$|127\.|0\.0\.0\.0$|xroga\.local$)/.test(hostname) ? 'LOCAL_ONLY' : 'CONFIGURED_BUT_UNVERIFIED', hosts: [hostname], sources: sorted(paths), keys: /a^/, region: 'Not verified',
      auth: 'Existing adapter-owned credentials/authorization; see names and source', outbound: [], evidence: [],
      health: 'Reference/asset hosts may need no service health check; adapter admission/liveness is unverified. No external action or paid health probe performed' }, []);
    dependencies.push({ ...endpointService, secret_names: matchingNames });
  }
  const unassignedNames = names.filter(name => !dependencies.some(row => row.secret_names.includes(name)));
  if (unassignedNames.length) dependencies.push({ ...service({ id: 'runtime-controls-and-conditional-aliases', provider: 'Existing operator/system configuration',
    purpose: 'Runtime flags, bounded model operator keys and conditional credential aliases without independently verified external integration',
    state: 'CONFIGURED_BUT_UNVERIFIED', hosts: [], sources: sorted(discovery.readers.filter(row => unassignedNames.includes(row.name)).map(row => row.path)),
    keys: /a^/, region: 'Consuming runtime; no new hosted component', auth: 'Trusted server/build environment; no values copied', outbound: [], evidence: [],
    health: 'Consumer-specific configuration validation or explicit admission gap; metadata is not provider readiness' }, []), secret_names: unassignedNames });
  const environment_names = names.map(name => {
    const consumers = sorted([...discovery.readers.filter(row => row.name === name).map(row => row.path), ...bindings.filter(row => row.names.includes(name)).flatMap(row => row.evidence_sources)]);
    const isPublic = name.startsWith('NEXT_PUBLIC_');
    const credential = /KEY|SECRET|TOKEN|PASSWORD|DATABASE_URL|DB_URL|REDIS_URL/.test(name) && !/(?:MODEL|KEY_STATUS)/.test(name);
    return { name, consuming_sources: consumers, environments: isPublic ? ['frontend build/browser/SSR'] : ['backend/operator or inherited system context'],
      secret_class: isPublic && /KEY/.test(name) ? 'PUBLIC_CREDENTIAL' : credential ? 'SERVER_CREDENTIAL' : /(?:CLIENT_ID|PROJECT_ID|ACCOUNT_ID)$/.test(name) ? 'PUBLIC_IDENTIFIER' : /^(?:PATH|HOME|LANG|LC_ALL|TZ|TMPDIR|SHELL|TERM|CI)$/.test(name) ? 'SYSTEM_CONFIGURATION' : 'RUNTIME_CONFIGURATION',
      rotation_owner: 'Xroga operations; user-owned integrations require account owner approval',
      requiredness: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'].includes(name) ? 'REQUIRED_FOR_CORE_AUTH' : credential ? 'CONDITIONAL_ON_CAPABILITY' : 'OPTIONAL_OR_DEFAULTED',
      startup_validation: 'Source-specific lazy/configuration checks; no secret-value presence or universal startup enforcement claimed',
      mechanisms: sorted(discovery.readers.filter(row => row.name === name).map(row => row.mechanism).concat(bindings.some(row => row.names.includes(name)) ? ['REVIEWED_DYNAMIC_BINDING'] : [])),
      dependency_ids: dependencies.filter(row => row.secret_names.includes(name)).map(row => row.dependency_id) };
  });
  const risks = [
    ['TEST_REALM_PIN', 'P1', ['frontend/src/lib/supabase/config.ts', 'frontend/src/lib/supabase/authBuildRealm.mjs', '.github/workflows/command3-auth-browser.yml'], 'Production realm stays pinned; an explicit isolated CI build is now admitted, but real authenticated E2E configuration and verification remain blocked', '007'],
    ['EPHEMERAL_ARTIFACT_FALLBACK', 'P1', ['backend/src/services/storage/projectFiles.ts', 'backend/src/services/storage/localMediaCache.ts'], 'Canonical file fallback removed; legacy cached/public objects not migrated and full private R2/staging durability/quota acceptance remains blocked', '007–010'],
    ['EPHEMERAL_BUDGET_FALLBACK', 'P1', ['backend/src/ai/providerBudget.ts', 'backend/src/ai/quota.ts', 'backend/src/ai/universal/costLedger.ts', 'backend/src/routes/guestChat.ts', 'backend/src/services/BillingService.ts'], 'Absent durable billing credentials activates process-only cycles/reservations; quota also falls back after DB/RPC errors. Guest rate/token/concurrency/claim limits fall back from Redis to maps. UniversalCostLedger is explicitly in-process; BillingService also defines process-only fulfilled-payment deduplication. Restart/cross-process accounting cannot rely on these stores', '008'],
    ['RUN_PERSISTENCE_GAP', 'P1', ['backend/src/ai/runStore.ts'], 'Run persistence returns without service-role configuration and scheduled writes swallow failures; hot run maps are not durable evidence of saved history', '007–008'],
    ['UNIVERSAL_MEMORY_ADMISSION', 'P1', ['backend/src/synthesis/universalPersistence.ts', 'backend/src/synthesis/projectRuntime/store.ts', 'backend/src/operations/productionOperations.ts'], 'universalStore defaults to owner-keyed memory without a client; runtime-store and operational evidence/idempotency map implementations also exist. Durable production admission/caller reachability must be proved, not inferred from class names', '007–008'],
    ['OAUTH_PLAINTEXT_MIRROR', 'P1', ['backend/src/services/integrations/oauthPkceStore.ts'], 'OAuth/PKCE plaintext DB/private JSON mirror; encryption, expiry, one-use and KMS cutover need verified migration', '009'],
    ['QUEUE_CONSUMERS_ABSENT', 'P1', ['backend/src/config/jobQueues.ts', 'backend/src/config/redis.ts'], 'Four queue definitions, no discovered Worker consumers; client construction is not queue readiness', 'LATER'],
    ['KMS_UNPROVEN', 'P1', ['backend/src/services/integrations/userProviderKeys.ts'], 'BYOK AES-GCM exists; encryptionKey can derive from platform service-role/JWT credentials and has a fixed development fallback guarded only by NODE_ENV. Actual managed production key authority/AAD/rotation is not established; no key values were read', '009'],
    ['RELEASE_CONTROLS_UNENFORCED', 'P1', ['.github/workflows/fly-deploy.yml', '.github/workflows/supabase-migrate.yml'], 'Observed main and Production/Preview lack platform protection/restrictions; mandatory user release gates still apply', '010'],
    ['HOST_TOOLCHAIN_DRIFT', 'P2', ['.node-version', 'Dockerfile.api', 'vercel.json', '.github/workflows/fly-deploy.yml'], 'Vercel project configured Node 24.x; canonical CI/API image is 22.21.1; Fly host test workflow has no explicit setup-node', '006'],
  ].map(([id, severity, source_paths, summary, owner_command]) => ({ id, severity, source_paths, summary, disposition: 'RECORDED_PRE_EXISTING_RISK_NOT_WAIVED', owner_command }));
  const sourcePaths = sorted([...discovery.sourcePaths, ...manifestPaths.filter(path => existsSync(join(root, path))), ...bindings.flatMap(row => row.evidence_sources),
    'scripts/xroga/runtime-discovery.mjs', 'scripts/xroga/runtime-facts.mjs', 'scripts/xroga/runtime-inventory.mjs', 'scripts/xroga/runtime-schema.mjs', 'scripts/xroga/check-runtime-config.mjs']);
  return runtimeInventorySchema.parse({ version: '1.0', source_sha: sourceSha ?? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    assessment: 'READ_ONLY_RUNTIME_AUDIT', dependencies, environment_names,
    manifests: manifestPaths.map(path => ({ path, presence: existsSync(join(root, path)) ? 'PRESENT' : 'ABSENT', role: path.includes('cloudbuild') || path.includes('Dockerfile.browser') || path.includes('fly.browser') ? 'Named future/absent manifest must not imply active deployment' : 'Existing runtime/build/verification configuration' })),
    source_hashes: sourcePaths.map(path => ({ path, sha256: hash(read(path)) })), dynamic_bindings: bindings,
    source_endpoints: discovery.hosts, fallback_candidates: discovery.fallbackCandidates, risks, evidence,
    limitations: ['Static endpoint/credential definitions do not prove service availability.', 'Every memory/filesystem candidate needs semantic durability review; static collections are not automatically unsafe stores.',
      'No secret values, customer data, KMS keys, private DB contents or production provider calls were read.', 'Health evidence is dated and scoped; no new deployment occurred.',
      'Dynamic user-selected URLs and SDK endpoints are not finite source-host definitions; their ownership/egress admission must be independently enforced in Commands 007–010.'] });
}

export function main() {
  const inventory = buildRuntimeInventory();
  for (const [path, content] of renderRuntimeOutputs(inventory)) {
    mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), content);
  }
  console.log(JSON.stringify({ result: 'GENERATED_PENDING_VALIDATION', dependencies: inventory.dependencies.length, envNames: inventory.environment_names.length,
    unresolvedBindings: inventory.dynamic_bindings.filter(row => row.status === 'REQUIRES_BINDING_REVIEW').length, fallbackCandidates: inventory.fallback_candidates.length }));
}
export function renderRuntimeOutputs(inventory) {
  const rows = inventory.dependencies.map(row => `| ${row.dependency_id} | ${row.provider} | ${row.state} | ${row.hostnames.join(', ') || 'Unknown/not applicable'} | ${row.production_verification} |`);
  const riskRows = inventory.risks.map(row => `- ${row.severity} ${row.id}: ${row.summary}. Owner command: ${row.owner_command}; ${row.disposition}.`);
  const md = `# Deployment topology — read-only truth\n\nSource SHA: \`${inventory.source_sha}\`; source/config hashes are recorded in the JSON. This is source discovery plus explicitly dated read-only observations, not a new deployment or certification of all integrations.\n\n| Dependency | Provider | State | Host/resource | Verification |\n| --- | --- | --- | --- | --- |\n${rows.join('\n')}\n\n## Evidence\n\n${inventory.evidence.map(row => `- ${row.id}: ${row.source}; observed ${row.observed_utc}; ${row.result}; ${row.release_sha ?? 'no application SHA claimed'}.`).join('\n')}\n\nFrontend release 3b2bad and API release 41665b legitimately differ: the initial main/backend/config tree is equivalent to the last API release. Different component SHAs alone do not prove stale API code. Vercel's configured Node 24.x differs from canonical CI/API 22.21.1; no hosting setting was changed. Local Fly CLI has no token; deeper current app/resource/secret metadata remains unverified. Supabase's older LOGIN project is inactive and is not an approved test project. DNS registrar ownership is not established by a checked-in hostname.\n\n## Risks and incomplete evidence\n\n${riskRows.join('\n')}\n\n${inventory.fallback_candidates.length} scoped memory/filesystem candidates are retained for semantic review. Static collections and scratch writes are not automatically unsafe fallbacks; the candidate inventory is not blanket durability certification. All consequential persistence/authority callers require the later security gates. Production/Preview environment protection and main rulesets were inspected as empty; user-mandated release gates still apply. Cloud Run/Jobs/Cloudflare Workers hosting remains proposed; no migration is authorized.\n\n## Boundaries\n\nFrontend → API routing: canonical xroga.com/xroga-api.fly.dev, with explicitly local development overrides. OAuth redirects target the existing dashboard callback paths; user-owned integrations are separate from platform auth. Whop platform billing and user-owned publishing/payment integrations must not be conflated. Callback/billing/provider readiness is not inferred from metadata or configuration names. Region/timeout/retry gaps remain explicit in each record. No new secret, payment, external action, DNS setting, provider or database was changed.\n`;
  const escape = value => value.replace(/["\n]/g, ' '), node = id => id.replace(/-/g, '_');
  const graph = `flowchart LR\n  browser["Browser"] --> frontend\n${inventory.dependencies.map(row => `  ${node(row.dependency_id)}["${escape(row.provider)} — ${row.state}"]`).join('\n')}\n${inventory.dependencies.flatMap(row => row.outbound_dependencies.map(id => `  ${node(row.dependency_id)} --> ${node(id)}`)).join('\n')}\n${inventory.dependencies.filter(row => row.dependency_id.startsWith('endpoint-')).map(row => `  ${row.config_sources.some(path => path.startsWith('backend/')) ? 'api' : 'frontend'} -. "source host/reference; unverified" .-> ${node(row.dependency_id)}`).join('\n')}\n`;
  const envRows = inventory.environment_names.map(row => `| ${row.name} | ${row.secret_class} | ${row.requiredness} | ${row.consuming_sources.join(', ')} | ${row.startup_validation} |`);
  const secrets = `# Environment/secret NAME inventory\n\nSource SHA: \`${inventory.source_sha}\`. Values are prohibited, including public credential values. ${inventory.environment_names.length} named readers/aliases/derived keys; ${inventory.dynamic_bindings.length} explicitly reviewed bindings.\n\n| Name | Class | Requiredness | Consuming source | Validation status |\n| --- | --- | --- | --- | --- |\n${envRows.join('\n')}\n\nRotation owner: Xroga operations for platform credentials; the authorized account owner for user-owned integrations. Actual rotation schedules/KMS custody are not claimed. Names in a source alias table are conditional compatibility declarations, not evidence that a provider is healthy or installed. Inherited system names are not provider credentials. Anonymous/publishable browser credentials are distinct from server service-role secrets; no values were retrieved.\n\nDynamic key status helpers expose booleans only and are recorded as caller policy, not a fabricated finite namespace. Model fields and operatorConfigKeys suffixes are reconciled from source; speculative pricing/context facts are not invented. Any new reader/binding or source change requires re-audit.\n`;
  const contract = `# Runtime/dependency contract\n\nSource SHA: \`${inventory.source_sha}\`. Existing runtime semantics are preserved; this audit does not create another provider router, scheduler, vault or backend.\n\n## Runtime classes\n\n- ACTIVE requires dated observed service/deployment evidence, not a manifest or key-name presence.\n- CONFIGURED_BUT_UNVERIFIED records code/configuration without current authoritative proof.\n- LEGACY is retained and not deleted or automatically activated.\n- LOCAL_ONLY must never silently claim durable production storage.\n- PROPOSED is design intent, not infrastructure permission.\n\nCanonical engineering runtime: Node 22.21.1/npm 10.9.4/TypeScript 5.9.3. Current API image uses that Node pin. Frontend project metadata is configured 24.x; exact running frontend binary is not inferred from that setting. Docker API emits dist/index.js; Vercel builds frontend with its existing standalone npm pipeline. The Fly host test job currently lacks explicit setup-node; document/fix this through normal review, never assume its runner default.\n\n## Configuration and admission\n\nThe existing source helpers remain canonical. Supabase server service-role access bypasses RLS and needs independent owner/tenant checks (Command 007). OAuth/PKCE/private storage and existing BYOK encryption need verified KMS and migration (009). Existing action authority/digest/approval/budget boundaries must be unified (008) before consequential calls. API/worker/tool egress and untrusted input need central guard coverage (010).\n\nFrontend production Supabase remains pinned. Command 007 admits an explicit, validated non-production CI build realm; this does not grant roles or bypass founder/MFA authorization. Real authenticated E2E proof is still blocked pending the dedicated test configuration; never use production users. Missing isolated GitHub secrets/variable remain BLOCKED_PENDING_TEST_CONFIGURATION. Stage security/migration proof and KMS are release gates, not optional metadata.\n\n## Mechanical check\n\nRun \`node scripts/xroga/runtime-inventory.mjs\` to regenerate after review, then \`node scripts/xroga/check-runtime-config.mjs\`. Zod/schema, exact source/config hashes, known dynamic bindings, named environment coverage, service IDs, canonical public hosts, credential-like inventory values and explicit high-risk fallback records are checked. Positive/negative tests use only fake canaries. Current high risks remain recorded and unwaived; validation is inventory consistency, not production security certification.\n\n## Production rollout\n\nNo deploy, key rotation, DNS edit or DB migration in Command 004. Future release must pass authenticated E2E, isolated fresh/upgrade DB and staging tests, credential/KMS verification, advisory review, final GO/NO-GO and ten command manifests. Only then use the existing authorized release workflow. Rollback is a normal revert of audit/tooling commits; no user data was changed.\n`;
  return new Map([['docs/xroga/dependency-inventory.json', json(inventory)], ['docs/xroga/dependency-inventory.schema.json', json(runtimeJsonSchema)],
    ['docs/xroga/deployment-topology.md', md], ['docs/xroga/deployment-topology.mmd', graph], ['docs/xroga/secret-inventory.md', secrets], ['docs/xroga/runtime-contract.md', contract]]);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
