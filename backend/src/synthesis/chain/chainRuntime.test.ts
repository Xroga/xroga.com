import assert from 'node:assert/strict';
import test from 'node:test';
import { ChainIndexerState, InMemoryWalletChallengeStore, enforceSignerPolicy, issueWalletChallenge, rpcWithFailover, transitionTransaction, validateNetworkFact, verifyWalletChallenge } from './chainRuntime.js';

test('wallet challenge is domain/chain bound, signature checked, and one-time', async () => {
  const store = new InMemoryWalletChallengeStore(); const now = new Date('2026-07-26T00:00:00Z');
  const challenge = await issueWalletChallenge({ store, address: '0xabc', domain: 'app.example.com', chainId: 'chain-a', now });
  await assert.rejects(() => verifyWalletChallenge({ store, challengeId: challenge.id, domain: 'evil.example', chainId: 'chain-a', signature: 'ok', verifier: async () => true, now }));
  const result = await verifyWalletChallenge({ store, challengeId: challenge.id, domain: 'app.example.com', chainId: 'chain-a', signature: 'ok', verifier: async (message, signature, address) => message.includes(challenge.nonce) && signature === 'ok' && address === '0xabc', now });
  assert.equal(result.address, '0xabc');
  await assert.rejects(() => verifyWalletChallenge({ store, challengeId: challenge.id, domain: 'app.example.com', chainId: 'chain-a', signature: 'ok', verifier: async () => true, now }));
});

test('wallet challenge expiry is enforced before signature verification', async () => {
  const store = new InMemoryWalletChallengeStore();
  const issuedAt = new Date('2026-07-26T00:00:00Z');
  const challenge = await issueWalletChallenge({ store, address: '0xabc', domain: 'app.example.com', chainId: 'chain-a', ttlMs: 1_000, now: issuedAt });
  let verifierCalled = false;
  await assert.rejects(() => verifyWalletChallenge({ store, challengeId: challenge.id, domain: 'app.example.com', chainId: 'chain-a', signature: 'ok', verifier: async () => { verifierCalled = true; return true; }, now: new Date('2026-07-26T00:00:02Z') }), /expired/);
  assert.equal(verifierCalled, false);
});

test('signer boundaries and transaction lifecycle require real evidence', () => {
  const policy = { allowedChainIds: ['chain-a'], allowedContractAddresses: ['0xabc'], allowedMethods: ['mint'], maximumValue: '10', expiresAt: '2026-07-27T00:00:00Z', requireConfirmation: true };
  assert.throws(() => enforceSignerPolicy({ policy, chainId: 'chain-a', contractAddress: '0xabc', method: 'mint', value: 1n, ownerConfirmed: true, signerMaterial: `private key ${'a'.repeat(64)}`, now: new Date('2026-07-26T00:00:00Z') }));
  assert.doesNotThrow(() => enforceSignerPolicy({ policy, chainId: 'chain-a', contractAddress: '0xabc', method: 'mint', value: 1n, ownerConfirmed: true, now: new Date('2026-07-26T00:00:00Z') }));
  const record = { id: 'tx1', chainId: 'chain-a', status: 'prepared' as const, history: [] };
  assert.throws(() => transitionTransaction(record, 'submitted'));
  const submitted = transitionTransaction(record, 'submitted', { transactionHash: '0xreal', providerEvidenceId: 'rpc-evidence' });
  const confirmed = transitionTransaction(submitted, 'confirmed', { transactionHash: '0xreal' });
  const finalised = transitionTransaction(confirmed, 'finalised', { transactionHash: '0xreal', blockReference: '100:0xblock' });
  assert.equal(finalised.status, 'finalised');
});

test('RPC failover never crosses chain identity', async () => {
  const calls: string[] = [];
  const result = await rpcWithFailover({ expectedChainId: 'chain-a', endpoints: [
    { url: 'https://wrong.example', chainId: 'chain-b', health: 'healthy', latencyMs: 1 },
    { url: 'https://first.example', chainId: 'chain-a', health: 'healthy', latencyMs: 2 },
    { url: 'https://second.example', chainId: 'chain-a', health: 'healthy', latencyMs: 3 },
  ], operation: async (endpoint) => { calls.push(endpoint.url); if (endpoint.url.includes('first')) throw new Error('temporary'); return 'ok'; } });
  assert.equal(result.endpoint, 'https://second.example'); assert.deepEqual(calls, ['https://first.example', 'https://second.example']);
});

test('indexer is idempotent and rolls back a reorg checkpoint', () => {
  const indexer = new ChainIndexerState();
  assert.equal(indexer.ingest({ id: 'a', chainId: 'c', blockHeight: 10, blockHash: 'h1', payload: {} }, () => {}).duplicate, false);
  assert.equal(indexer.ingest({ id: 'a', chainId: 'c', blockHeight: 10, blockHash: 'h1', payload: {} }, () => {}).duplicate, true);
  assert.equal(indexer.ingest({ id: 'b', chainId: 'c', blockHeight: 10, blockHash: 'h2', payload: {} }, () => {}).rolledBack, 1);
  assert.equal(indexer.snapshot().eventCount, 1);
});

test('network facts require current official evidence and explicit RPC URLs', () => {
  assert.throws(() => validateNetworkFact({ family: 'evm', name: 'unknown', chainId: '1', rpcUrls: [], sourceUrl: 'https://official.example', verifiedAt: '2026-01-01T00:00:00Z', expiresAt: '2026-02-01T00:00:00Z' }, new Date('2026-07-26T00:00:00Z')));
});
