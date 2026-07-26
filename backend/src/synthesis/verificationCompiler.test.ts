import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCapabilityGraph } from './capabilityGraph.js';
import { buildOperationsManifest } from './operationsManifest.js';
import { selectArchitecture, selectFrameworkAdapter } from './adapters.js';
import { synthesizeProductDefinition } from './productDefinition.js';
import { compileVerificationPlan, executeVerificationPlan, type VerificationPlan } from './verificationCompiler.js';

test('verification compiler derives product-specific payment, domain, AI, chain and external tests', async () => {
  const definition = synthesizeProductDefinition({ prompt: 'Build a multi-tenant AI marketplace with payments, custom DNS domain, wallet authentication, Solana program and current official research' });
  const graph = buildCapabilityGraph(definition); const architecture = selectArchitecture(definition, graph); const framework = selectFrameworkAdapter(architecture); const operations = buildOperationsManifest({ definition, graph, architecture, framework });
  const plan = compileVerificationPlan({ definition, graph, operations });
  assert.ok(plan.expectedTestCount > 10); assert.ok(plan.tests.some((item) => item.kind === 'payment')); assert.ok(plan.tests.some((item) => item.kind === 'domain')); assert.ok(plan.tests.some((item) => item.kind === 'ai_evaluation')); assert.ok(plan.tests.some((item) => item.kind === 'blockchain' && item.external));
  const keys = new Set(plan.tests.filter((item) => !item.external).map((item) => item.executorKey)); const executors = Object.fromEntries([...keys].map((key) => [key, async () => ({ passed: true, evidenceIds: [`evidence:${key}`] })]));
  const result = await executeVerificationPlan(plan, executors); assert.equal(result.status, 'external_validation_pending'); assert.ok(result.results.some((item) => item.status === 'external_validation_pending'));
});

test('required missing executors and zero-test plans fail truthfully', async () => {
  const plan: VerificationPlan = { schema: 'xroga.verification-plan', schemaVersion: '1.0.0', migrationPath: ['1.0.0'], productDefinitionId: 'p', tests: [{ id: 't', kind: 'unit', capabilityId: 'c', objective: 'real test', invariant: 'must hold', required: true, executorKey: 'missing', evidenceRequirements: ['result'], external: false }], expectedTestCount: 1, digest: 'd' };
  assert.equal((await executeVerificationPlan(plan, {})).status, 'failed');
  await assert.rejects(() => executeVerificationPlan({ ...plan, tests: [], expectedTestCount: 0 }, {}));
});

test('passing executor without evidence cannot produce a pass', async () => {
  const plan: VerificationPlan = { schema: 'xroga.verification-plan', schemaVersion: '1.0.0', migrationPath: ['1.0.0'], productDefinitionId: 'p', tests: [{ id: 't', kind: 'build', capabilityId: 'build', objective: 'production build', invariant: 'exit zero', required: true, executorKey: 'build', evidenceRequirements: ['command'], external: false }], expectedTestCount: 1, digest: 'd' };
  const result = await executeVerificationPlan(plan, { build: async () => ({ passed: true, evidenceIds: [] }) }); assert.equal(result.status, 'failed');
});
