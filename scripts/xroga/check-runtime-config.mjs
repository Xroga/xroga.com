import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root } from '../ci/toolchain.mjs';
import { runtimeInventorySchema, runtimeJsonSchema } from './runtime-schema.mjs';
import { discoverRuntime } from './runtime-discovery.mjs';
import { buildRuntimeInventory, resolveDynamicBindings, renderRuntimeOutputs } from './runtime-inventory.mjs';

export function validateRuntimeInventory(value, expectedNames = []) {
  const inventory = runtimeInventorySchema.parse(value), ids = new Set(), names = new Set(), evidenceIds = new Set(inventory.evidence.map(row => row.id));
  const serialized = JSON.stringify(inventory);
  if (/sb_secret_|sk_(?:live|test)_[A-Za-z0-9]{12}|sk-proj-|AKIA[A-Z0-9]{16}|AIza[A-Za-z0-9_-]{20}|(?:postgres(?:ql)?:\/\/)[^\s"]+:[^\s"]+@|Bearer\s+[A-Za-z0-9._-]{12}/i.test(serialized)) throw new Error('Credential-like value in runtime inventory; values are forbidden');
  for (const service of inventory.dependencies) {
    if (ids.has(service.dependency_id)) throw new Error(`Duplicate dependency ID: ${service.dependency_id}`); ids.add(service.dependency_id);
    if (service.state === 'ACTIVE' && !service.evidence_ids.length) throw new Error('Active service has no observed deployment evidence');
    if (service.state === 'ACTIVE' && !inventory.evidence.some(row => service.evidence_ids.includes(row.id) && /^(?:HTTP_200|ACTIVE_HEALTHY|EXISTING_DEPLOYMENT_SUCCESS)/.test(row.result))) throw new Error('Active service has no successful observed evidence');
    if (service.evidence_ids.some(id => !evidenceIds.has(id))) throw new Error('Unknown service evidence ID');
    if (!service.health_readiness.trim()) throw new Error('Every service requires readiness strategy or explicit gap');
    for (const hostname of service.hostnames) {
      if (/[/@\s]/.test(hostname)) throw new Error('Hostname contains path, credentials or whitespace');
      if (service.environment === 'PRODUCTION' && /^(?:localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|169\.254\.)/i.test(hostname)) throw new Error('Unsafe production localhost/private hostname default');
    }
  }
  for (const service of inventory.dependencies) if (service.outbound_dependencies.some(id => !ids.has(id))) throw new Error('Unregistered outbound dependency');
  for (const entry of inventory.environment_names) {
    if (names.has(entry.name)) throw new Error('Duplicate environment name'); names.add(entry.name);
    if (!entry.consuming_sources.length || !entry.dependency_ids.length) throw new Error(`Undocumented env consumer/dependency: ${entry.name}`);
    if (entry.dependency_ids.some(id => !ids.has(id))) throw new Error('Environment names an unknown dependency');
  }
  for (const name of expectedNames) if (!names.has(name)) throw new Error(`Undocumented env key: ${name}`);
  if (inventory.dynamic_bindings.some(row => row.status === 'REQUIRES_BINDING_REVIEW')) throw new Error('Unresolved dynamic environment binding');
  if (inventory.source_endpoints.some(row => row.credentialsInUrl)) throw new Error('Credential-bearing source endpoint requires a security review; no secret values may be copied');
  for (const id of ['frontend', 'api', 'supabase', 'redis', 'r2']) if (!ids.has(id)) throw new Error(`Canonical dependency missing: ${id}`);
  const frontend = inventory.dependencies.find(row => row.dependency_id === 'frontend'), api = inventory.dependencies.find(row => row.dependency_id === 'api');
  if (frontend.hostnames[0] !== 'xroga.com' || api.hostnames[0] !== 'xroga-api.fly.dev') throw new Error('Conflicting canonical public hostname definition');
  if (inventory.dependencies.some(row => /local.*(?:fallback|storage)|filesystem/i.test(row.provider + row.purpose)) && !inventory.risks.some(row => row.id === 'EPHEMERAL_ARTIFACT_FALLBACK' && ['P0', 'P1'].includes(row.severity))) throw new Error('Production ephemeral fallback is not reported as high risk');
  const consequentialFallbacks = [
    ['backend/src/ai/providerBudget.ts', 'EPHEMERAL_BUDGET_FALLBACK'],
    ['backend/src/ai/quota.ts', 'EPHEMERAL_BUDGET_FALLBACK'],
    ['backend/src/ai/runStore.ts', 'RUN_PERSISTENCE_GAP'],
    ['backend/src/synthesis/universalPersistence.ts', 'UNIVERSAL_MEMORY_ADMISSION'],
  ];
  for (const [path, riskId] of consequentialFallbacks) {
    if (inventory.fallback_candidates.some(row => row.path === path) && !inventory.risks.some(row => row.id === riskId && ['P0', 'P1'].includes(row.severity))) throw new Error('Reviewed production memory fallback is not reported as high risk');
  }
  return { result: 'PASS_CONFIG_INVENTORY_WITH_RECORDED_RISKS', dependencies: ids.size, environmentNames: names.size,
    dynamicBindings: inventory.dynamic_bindings.length, highRisks: inventory.risks.filter(row => ['P0', 'P1'].includes(row.severity)).length,
    secretValuesRead: false, productionDeployed: false };
}
export function main() {
  const read = path => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');
  const inventory = JSON.parse(read('docs/xroga/dependency-inventory.json'));
  const discovery = discoverRuntime(), bindings = resolveDynamicBindings(discovery);
  const expectedNames = [...new Set([...discovery.envNames, ...bindings.flatMap(row => row.names)])];
  const result = validateRuntimeInventory(inventory, expectedNames);
  if (JSON.stringify(runtimeJsonSchema) !== JSON.stringify(JSON.parse(read('docs/xroga/dependency-inventory.schema.json')))) throw new Error('Runtime JSON schema differs from canonical Zod boundary');
  if (JSON.stringify(bindings) !== JSON.stringify(inventory.dynamic_bindings)) throw new Error('Dynamic binding/source drift; re-audit before release');
  if (JSON.stringify(buildRuntimeInventory({sourceSha: inventory.source_sha})) !== JSON.stringify(inventory)) throw new Error('Runtime discovery/facts/manifests drift; regenerate and review the complete inventory');
  for (const source of inventory.source_hashes) {
    if (!existsSync(join(root, source.path)) || createHash('sha256').update(read(source.path)).digest('hex') !== source.sha256) throw new Error(`Runtime source/config drift: ${source.path}`);
  }
  const docker = read('Dockerfile.api'), fly = read('fly.api.toml'), vercel = JSON.parse(read('vercel.json'));
  const backend = JSON.parse(read('backend/package.json')), frontend = JSON.parse(read('frontend/package.json'));
  if (!docker.includes('test -f dist/index.js') || !docker.includes('"dist/index.js"') || !fly.includes("node dist/index.js") || backend.scripts.build !== 'tsc') throw new Error('Unsupported/inconsistent API deployment build output');
  if (!vercel.buildCommand.includes('build') || !vercel.buildCommand.includes('frontend') || frontend.scripts.build !== 'next build') throw new Error('Unsupported frontend deployment build target');
  const actualManifests = ['Dockerfile.api', 'fly.api.toml', 'vercel.json'];
  for (const path of actualManifests) if (!inventory.manifests.some(row => row.path === path && row.presence === 'PRESENT')) throw new Error('Active deployment manifest is missing from inventory');
  for (const [path, content] of renderRuntimeOutputs(inventory)) if (!existsSync(join(root, path)) || read(path) !== content) throw new Error(`Runtime topology/docs drift: ${path}`);
  console.log(JSON.stringify(result));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
