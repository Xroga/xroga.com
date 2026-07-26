import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { InMemoryExecutionStateStore } from '../ai/executionRuntime.js';
import { runUniversalSynthesisFoundation } from './foundation.js';

const fixtures = [
  { id: 'clinic', prompt: 'Build a multi-tenant clinic booking portal where patients request appointments, staff approve them, and email confirmation is sent', expected: 'full_stack_web_application' },
  { id: 'cli', prompt: 'Create a stateless command line CLI that converts CSV to JSON on stdout only with no database or storage', expected: 'command_line_tool' },
  { id: 'logistics', prompt: 'Build a warehouse logistics system with stock intake, staff approvals, async reconciliation workers and daily operational reports', expected: 'full_stack_web_application' },
] as const;

describe('non-crypto universal synthesis black-box fixtures', () => {
  for (const fixture of fixtures) it(`executes and persists ${fixture.id}`, async () => {
    const store = new InMemoryExecutionStateStore();
    const result = await runUniversalSynthesisFoundation({
      prompt: fixture.prompt, projectId: fixture.id, runId: `${fixture.id}-run`, files: [], store,
    });
    assert.equal(result.artifacts.architecture.primary, fixture.expected);
    assert.ok(result.state.tasks.every((task) => task.status === 'completed' && task.evidence.length > 0));
    assert.ok(result.artifacts.compiledPlan.tasks.every((task) => task.status !== 'completed'));
    assert.match(result.artifacts.evidenceHash, /^[a-f0-9]{64}$/);
    assert.equal(result.artifacts.operationsManifest.schema, 'xroga.generated-product-operations');
    assert.equal(result.artifacts.operationsManifest.testTiers.find((tier) => tier.tier === 'generated_fixture')?.status, 'required');
    assert.deepEqual(result.artifacts.productDefinition.blockchainCapabilities, []);
    const reloaded = await store.load(`${fixture.id}-run`);
    assert.equal(reloaded?.productManifest.synthesisEvidenceHash, result.artifacts.evidenceHash);
  });
});

describe('advanced Web3 hackathon synthesis fixture', () => {
  it('derives explicit advanced capabilities and external evidence gates without fabricating deployment', async () => {
    const store = new InMemoryExecutionStateStore();
    const result = await runUniversalSynthesisFoundation({
      prompt: 'Build a hackathon-ready multi-chain EVM, Solana and Soroban DeFi app with oracle safety, cross-chain messages, token assets, DAO governance, attestations, zero-knowledge proofs, decentralized storage, account abstraction, wallet authentication and a repeatable golden demo',
      projectId: 'web3-hackathon', runId: 'web3-hackathon-run', files: [], store,
    });
    const nodeIds = new Set(result.artifacts.capabilityGraph.nodes.map((node) => node.id));
    for (const required of ['chain-oracle-safety', 'chain-cross-chain-messaging', 'chain-defi-safety', 'chain-assets', 'chain-governance', 'chain-identity', 'chain-zero-knowledge', 'chain-content-storage', 'chain-account-abstraction']) assert.ok(nodeIds.has(required), required);
    assert.equal(result.artifacts.operationsManifest.hackathon.repeatableGoldenDemoRequired, true);
    assert.equal(result.artifacts.operationsManifest.chain.mainnetGate, 'separate_authorisation_and_review_required');
    assert.equal(result.artifacts.operationsManifest.threatModel.staticAnalysisRequired, true);
    assert.ok(result.artifacts.verificationPlan.tests.some((item) => item.kind === 'blockchain' && item.external));
    assert.ok(result.artifacts.verificationPlan.tests.every((item) => !Object.hasOwn(item, 'status')));
    assert.ok(!JSON.stringify(result.artifacts).includes('0xfake'));
    assert.ok(!JSON.stringify(result.artifacts).includes('https://example.com/explorer/tx'));
  });
});
