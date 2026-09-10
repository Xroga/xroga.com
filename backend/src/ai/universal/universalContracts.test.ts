import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CapabilityRegistry, capabilityId, capabilitySelectionSchema, type CapabilityDescriptor } from './capabilityRegistry.js';
import { interpretGoalContract } from './goalContract.js';
import { ArtifactFabric, validateOutputEnvelope } from './outputEnvelope.js';
import { COMPLETION_RESERVE_MICRO_USD, PRO_PLAN_PRICE_MICRO_USD, PRO_VARIABLE_COST_CEILING_MICRO_USD, UniversalCostLedger } from './costLedger.js';
import { assertProjectWriteTarget, projectContextKey } from './projectContext.js';
import { assertSafeApiRequest } from './safeApi.js';
import { ArtifactWorkspace } from './artifactWorkspace.js';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { planCapabilities } from './planner.js';
import { routeModelByRequirements } from './modelRequirements.js';

function syntheticCapability(id: string, authority = 'synthetic:run'): CapabilityDescriptor {
  return {
    id: capabilityId(id), version: '1.0.0', title: id, description: 'Synthetic capability',
    inputMediaTypes: ['application/json'], outputMediaTypes: ['application/octet-stream'],
    effects: ['compute'], requiredAuthorities: [authority as never], risk: 'low', health: () => 'available',
    cost: { meterId: `meter.${id}`, estimateMicroUsd: () => 7 },
    validateInput: () => true, validateOutput: () => true, execute: async (value) => value,
  };
}

test('goal contracts are semantic and open to arbitrary deliverables and capabilities', async () => {
  const contract = await interpretGoalContract({
    message: 'produce the requested outcome', history: ['earlier constraint'],
    projectContext: { repo: 'random-owner/random-repo', branch: 'feature/arbitrary', projectRoot: '/packages/unit' },
    attachments: [{ mediaType: 'application/x-arbitrary' }],
  }, async () => ({
    version: '1.0', goal: 'Produce a novel binary', desiredOutcome: 'A validated artifact', semanticIntent: 'MIXED',
    constraints: [], acceptance: ['Artifact validates'], historyContext: [],
    projectContext: { repo: 'random-owner/random-repo', branch: 'feature/arbitrary', projectRoot: '/packages/unit' },
    deliverables: [{ id: 'result', mediaType: 'application/x-never-seen', description: 'Novel output', required: true, acceptance: [] }],
    requiredCapabilities: ['synthetic.never-seen'], requiredAuthorities: ['synthetic:run'], risks: [], confidence: 0.82, blockers: [], contextComplexity: 'high',
  }));
  assert.equal(contract.deliverables[0]?.mediaType, 'application/x-never-seen');
  assert.equal(contract.semanticIntent, 'MIXED');
});

test('capability registry accepts source-controlled namespaced additions without router edits', () => {
  const registry = new CapabilityRegistry();
  registry.register(syntheticCapability('invented.alpha'));
  registry.register(syntheticCapability('invented.beta', 'invented:approve'));
  assert.deepEqual(registry.resolve(['invented.alpha'], new Set(['synthetic:run'])).eligible.map((x) => x.id), ['invented.alpha']);
  assert.deepEqual(registry.resolve(['invented.beta'], new Set()).rejected[0], { id: 'invented.beta', reason: 'missing_authority:invented:approve' });
  assert.equal(capabilitySelectionSchema.safeParse({ capabilityIds: ['bad_closed_id'], rationale: 'x' }).success, false);
});

test('universal ledger reserves atomically, preserves completion reserve, and is idempotent', () => {
  assert.equal(PRO_PLAN_PRICE_MICRO_USD, 25_000_000);
  assert.equal(PRO_VARIABLE_COST_CEILING_MICRO_USD, 20_000_000);
  const ledger = new UniversalCostLedger();
  const first = ledger.reserve({ accountId: 'arbitrary-account', idempotencyKey: 'same', estimate: { meterId: 'provider.any', estimatedMicroUsd: 1, maximumMicroUsd: PRO_VARIABLE_COST_CEILING_MICRO_USD - COMPLETION_RESERVE_MICRO_USD } });
  const replay = ledger.reserve({ accountId: 'arbitrary-account', idempotencyKey: 'same', estimate: { meterId: 'provider.any', estimatedMicroUsd: 1, maximumMicroUsd: 1 } });
  assert.equal(replay.id, first.id);
  assert.throws(() => ledger.reserve({ accountId: 'arbitrary-account', idempotencyKey: 'overflow', estimate: { meterId: 'provider.other', estimatedMicroUsd: 1, maximumMicroUsd: 1 } }), /CEILING/);
  ledger.settle(first.id, 17_000_000);
  const finish = ledger.reserve({ accountId: 'arbitrary-account', idempotencyKey: 'finish', purpose: 'completion', estimate: { meterId: 'provider.finish', estimatedMicroUsd: 1, maximumMicroUsd: 2_500_000 } });
  ledger.release(finish.id);
  assert.equal(ledger.status('arbitrary-account').settledMicroUsd, 17_000_000);
});

test('artifact fabric handles unrelated media types and envelopes retain unknown artifacts', async () => {
  const fabric = new ArtifactFabric();
  fabric.registerGenerator('application/x-synthetic', async () => ({ id: 'a', name: 'opaque.bin', mediaType: 'application/x-synthetic', sizeBytes: 3, inline: 'abc' }));
  fabric.registerValidator('application/x-synthetic', async () => ({ status: 'passed', detail: 'synthetic validator passed' }));
  const artifact = await fabric.generate('application/x-synthetic', {});
  assert.equal(artifact.validation[0]?.status, 'passed');
  assert.equal(validateOutputEnvelope({ type: 'xroga.output', version: '1.0', status: 'completed', summary: 'done', artifacts: [artifact], evidence: [], blockers: [], nextActions: [], provenance: { runId: 'random' } }), true);
});

test('project write identity includes repository, branch, and future project root', () => {
  const a = { repo: 'Org/Repo', branch: 'branch/x', projectRoot: '/units/a/' };
  const same = { repo: 'org/repo', branch: 'branch/x', projectRoot: '/units/a' };
  assert.equal(projectContextKey(a), projectContextKey(same));
  assert.doesNotThrow(() => assertProjectWriteTarget(a, same));
  assert.throws(() => assertProjectWriteTarget(a, { ...same, branch: 'branch/y' }), /TARGET_MISMATCH/);
  assert.throws(() => assertProjectWriteTarget(a, { ...same, projectRoot: '/units/b' }), /TARGET_MISMATCH/);
  assert.equal(projectContextKey(a), 'org%2Frepo::branch%2Fx::%2Funits%2Fa');
  assert.doesNotMatch(projectContextKey(a), /[\u0000-\u001f]/);
});

test('artifact workspace writes real opaque bytes inside a bounded project-independent root', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'xroga-artifacts-'));
  try {
    const artifact = await new ArtifactWorkspace(root).write({ id: 'synthetic-run', name: 'result.unknown', mediaType: 'application/x-random', bytes: new Uint8Array([1, 2, 3]) });
    assert.deepEqual([...await readFile(artifact.uri!)], [1, 2, 3]);
    assert.equal(artifact.sizeBytes, 3);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('generic API requests are default-deny and refuse private-network SSRF targets', () => {
  const authority = { allowedOrigins: new Set(['https://api.random.example']), allowedMethods: new Set(['GET']) };
  assert.equal(assertSafeApiRequest({ url: 'https://api.random.example/v9/resource', method: 'GET' }, authority).pathname, '/v9/resource');
  assert.throws(() => assertSafeApiRequest({ url: 'https://127.0.0.1/private', method: 'GET' }, { ...authority, allowedOrigins: new Set(['https://127.0.0.1']) }), /Private network/);
  assert.throws(() => assertSafeApiRequest({ url: 'https://unknown.example', method: 'GET' }, authority), /not authorized/);
  assert.throws(() => assertSafeApiRequest({ url: 'https://api.random.example', method: 'DELETE' }, authority), /method/);
});

test('semantic capability planning exposes descriptors but authority remains registry-controlled', async () => {
  const registry = new CapabilityRegistry();
  registry.register(syntheticCapability('novel.perform'));
  const goal = await interpretGoalContract({ message: 'novel goal', history: [], projectContext: null, attachments: [] }, async () => ({
    version: '1.0', goal: 'novel goal', desiredOutcome: 'novel output', semanticIntent: 'EXTERNAL_ACTION', constraints: [], acceptance: [], historyContext: [], projectContext: null, deliverables: [], requiredCapabilities: ['novel.perform'], requiredAuthorities: ['synthetic:run'], risks: [], confidence: 1, blockers: [], contextComplexity: 'unknown',
  }));
  const denied = await planCapabilities({ goal, registry, authorities: new Set(), select: async ({ available }) => ({ capabilityIds: [available[0]!.id], rationale: 'semantic match' }) });
  assert.equal(denied.capabilities.length, 0);
  assert.match(denied.rejected[0]!.reason, /missing_authority/);
});

test('model routing uses technical requirements and measured evidence, not task names', () => {
  const common = { available: true, contextTokens: 100_000, maximumOutputTokens: 8_000, features: { tools: true, json: true }, inputMicroUsdPerToken: 1, outputMicroUsdPerToken: 2 };
  const selected = routeModelByRequirements({ contextTokens: 10_000, maximumOutputTokens: 1_000, features: ['tools'], evidenceDimensions: ['arbitrary.dimension'], minimumSamples: 3, minimumConfidence: 0.5 }, [
    { ...common, id: 'model-random-a', measured: { 'arbitrary.dimension': { score: 9, samples: 1, confidence: 0.9 } } },
    { ...common, id: 'model-random-b', measured: { 'arbitrary.dimension': { score: 7, samples: 5, confidence: 0.8 } } },
  ]);
  assert.equal(selected?.id, 'model-random-b');
});
