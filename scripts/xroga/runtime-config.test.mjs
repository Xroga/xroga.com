import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRuntimeInventory, resolveDynamicBindings } from './runtime-inventory.mjs';
import { validateRuntimeInventory, validateApiBuildContract } from './check-runtime-config.mjs';
import { readFileSync } from 'node:fs';
import { root } from '../ci/toolchain.mjs';
import { join } from 'node:path';

test('canonical API build preserves compiled output and requires the pinned Git compatibility gate',()=>{
  const docker=readFileSync(join(root,'Dockerfile.api'),'utf8');
  const backend=JSON.parse(readFileSync(join(root,'backend/package.json'),'utf8'));
  assert.doesNotThrow(()=>validateApiBuildContract(docker,backend));
  for(const build of ['tsc','node scripts/cline-git-compat.mjs --check || tsc','echo done']){
    assert.throws(()=>validateApiBuildContract(docker,{...backend,scripts:{...backend.scripts,build}}),/Unsupported/);
  }
  assert.throws(()=>validateApiBuildContract(docker,{...backend,scripts:{...backend.scripts,postinstall:'echo done'}}),/Unsupported/);
  assert.throws(()=>validateApiBuildContract(docker.replace('RUN node scripts/cline-git-compat.mjs --apply',''),backend),/Unsupported/);
  assert.throws(()=>validateApiBuildContract(docker.replace('RUN node scripts/security-dependency-patches.mjs --apply',''),backend),/Unsupported/);
  assert.throws(()=>validateApiBuildContract(docker,{...backend,scripts:{...backend.scripts,build:'node scripts/cline-git-compat.mjs --check && tsc'}}),/Unsupported/);
  assert.throws(()=>validateApiBuildContract(docker.replace('test -f dist/index.js','true'),backend),/Unsupported/);
});

const baseline = buildRuntimeInventory();
const fixture = () => structuredClone(baseline);

test('accepted Google migration metadata is canonical and no active service depends on Fly',()=>{
  const api=baseline.dependencies.find(row=>row.dependency_id==='api');
  assert.equal(api.hostnames[0],'api.xroga.com');assert.match(api.provider,/Google Cloud Run/);
  assert.ok(baseline.dependencies.some(row=>row.dependency_id==='google-execution'&&row.state==='ACTIVE'));
  assert.ok(baseline.dependencies.some(row=>row.dependency_id==='google-delivery'&&row.state==='ACTIVE'));
  assert.ok(baseline.dependencies.filter(row=>row.state==='ACTIVE').every(row=>!row.hostnames.some(host=>/fly\.dev|machines\.dev/.test(host))&&!/Fly\.io|Fly Machines/.test(row.provider)));
});

test('old Fly liveness cannot admit Fly as the current canonical production API',()=>{
  const old=fixture(),api=old.dependencies.find(row=>row.dependency_id==='api');
  api.provider='Fly.io';api.hostnames=['xroga-api.fly.dev'];api.evidence_ids=['API-HEALTH-20261013'];
  assert.throws(()=>validateRuntimeInventory(old),/canonical|Fly/);
});

test('an active Fly worker cannot be admitted by reusing dated successful evidence',()=>{
  const value=fixture(),worker=value.dependencies.find(row=>row.dependency_id==='google-execution');
  worker.provider='Fly Machines';worker.hostnames=['api.machines.dev'];
  assert.throws(()=>validateRuntimeInventory(value),/Active Fly runtime/);
});

test('Google dynamic controls have exact reviewed bindings and new expressions remain blocked',()=>{
  const image=baseline.dynamic_bindings.find(row=>row.path==='backend/src/synthesis/projectRuntime/googleFactory.ts');
  assert.equal(image.status,'RESOLVED_FINITE_CATALOG');
  assert.deepEqual(image.names,['XROGA_GCE_NODE_IMAGE','XROGA_GCE_PYTHON_IMAGE','XROGA_GCE_RUST_IMAGE']);
  for(const path of ['backend/src/config/platformEnvironment.ts','backend/src/sandbox/google/gceMachineControl.ts','backend/src/services/integrations/googleCloudKmsCryptoProvider.ts']){
    assert.ok(baseline.dynamic_bindings.some(row=>row.path===path&&row.status==='RESOLVED_CALLER_POLICY'));
    const [unknown]=resolveDynamicBindings({readers:[],dynamic:[{path,expression:'unreviewedName',line:1}]});
    assert.equal(unknown.status,'REQUIRES_BINDING_REVIEW');
  }
});
test('actual API, queue, Supabase and storage definitions are canonical with all discovered names represented', () => {
  assert.match(validateRuntimeInventory(baseline, baseline.environment_names.map(row => row.name)).result, /^PASS/);
  for (const id of ['api', 'redis', 'supabase', 'r2']) assert.equal(baseline.dependencies.filter(row => row.dependency_id === id).length, 1);
  assert.ok(baseline.dependencies.filter(row => row.state === 'PROPOSED').every(row => !row.evidence_ids.length));
});
test('an undocumented environment key cannot silently enter production source', () => {
  assert.throws(() => validateRuntimeInventory(baseline, ['NEW_UNDOCUMENTED_CREDENTIAL_NAME']), /Undocumented env key/);
});
test('credential-like inventory content is rejected without authentic secret values', () => {
  const value = fixture(); value.dependencies[0].auth_mechanism = 'Bearer credentialcanarynotarealsecret';
  assert.throws(() => validateRuntimeInventory(value), /Credential-like/);
});
test('production localhost, duplicate IDs and conflicting canonical public origins fail', () => {
  const local = fixture(); local.dependencies.find(row => row.dependency_id === 'api').hostnames = ['localhost'];
  assert.throws(() => validateRuntimeInventory(local), /Unsafe production/);
  const duplicate = fixture(); duplicate.dependencies.push(structuredClone(duplicate.dependencies[0]));
  assert.throws(() => validateRuntimeInventory(duplicate), /Duplicate dependency/);
  const conflict = fixture(); conflict.dependencies.find(row => row.dependency_id === 'api').hostnames = ['different.example'];
  assert.throws(() => validateRuntimeInventory(conflict), /Conflicting canonical/);
});
test('active service needs actual evidence and every service must expose readiness or an honest gap', () => {
  const value = fixture(); value.dependencies[0].evidence_ids = [];
  assert.throws(() => validateRuntimeInventory(value), /no observed deployment evidence/);
  const failed = fixture(); failed.evidence.filter(row => failed.dependencies[0].evidence_ids.includes(row.id)).forEach(row => {row.result = 'FAILED';});
  assert.throws(() => validateRuntimeInventory(failed), /no successful observed evidence/);
  const noHealth = fixture(); noHealth.dependencies[0].health_readiness = '';
  assert.throws(() => validateRuntimeInventory(noHealth), /readiness strategy/);
});
test('production ephemeral fallback remains high risk and unknown dynamic bindings cannot be marked reconciled', () => {
  const value = fixture(); value.risks = value.risks.filter(row => row.id !== 'EPHEMERAL_ARTIFACT_FALLBACK');
  assert.throws(() => validateRuntimeInventory(value), /not reported as high risk/);
  const memory = fixture(); memory.risks.find(row => row.id === 'EPHEMERAL_BUDGET_FALLBACK').severity = 'P2';
  assert.throws(() => validateRuntimeInventory(memory), /production memory fallback is not reported as high risk/);
  const dynamic = fixture(); dynamic.dynamic_bindings[0].status = 'REQUIRES_BINDING_REVIEW';
  assert.throws(() => validateRuntimeInventory(dynamic), /Unresolved dynamic/);
});
test('a new dynamic expression in an already reviewed file still requires explicit caller reconciliation', () => {
  const result = resolveDynamicBindings({readers: [], dynamic: [{path: 'backend/src/ai/models.ts', line: 1, expression: 'untrusted.userKey'}]});
  assert.equal(result[0].status, 'REQUIRES_BINDING_REVIEW');
});
