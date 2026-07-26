import assert from 'node:assert/strict';
import test from 'node:test';
import { migrateOperationsManifest } from './operationsManifest.js';

test('Part 2B operations manifests migrate without losing existing chain identity', () => {
  const prior = { schema: 'xroga.generated-product-operations', schemaVersion: '1.0.0', migrationPath: ['1.0.0'], chain: { required: true, families: ['evm'], toolchains: ['evm_foundry'], signerBoundary: 'owner', networkFacts: 'runtime_verified_only' }, integrations: [{ purpose: 'chain' }], digest: 'legacy' };
  const migrated = migrateOperationsManifest(prior);
  assert.equal(migrated.schemaVersion, '1.1.0');
  assert.deepEqual(migrated.chain.families, ['evm']);
  assert.equal(migrated.chain.mainnetGate, 'separate_authorisation_and_review_required');
  assert.equal(migrated.testTiers.find((tier) => tier.tier === 'authorised_live_testnet')?.required, true);
  assert.match(migrated.digest, /^[a-f0-9]{64}$/);
});
