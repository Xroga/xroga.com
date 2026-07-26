import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { AccountAbstractionPolicy, AttestationRegistry, CrossChainMessage, GovernanceProposal, analyzeContractSource, authoriseSmartAccountAction, authoriseTokenIssuance, buildChainCapabilityMatrix, castGovernanceVote, enforceDefiGuard, executeGovernanceProposal, mainnetSafetyGate, mulDivCeil, mulDivFloor, persistAndVerifyContent, queueGovernanceProposal, transitionCrossChainMessage, validateDeploymentManifest, validateOracleRound, validateZkSpecification } from './advancedWeb3.js';
import { deterministicFuzz, EvmEscrowFixture, EVM_ESCROW_SOURCE, SolanaRegistryFixture, sourceArtifact, StellarSorobanFixture } from '../fixtures/web3Fixtures.js';

const network = { family: 'evm' as const, name: 'fixture', chainId: 'fixture-chain', rpcUrls: ['https://rpc.owner.example'], sourceUrl: 'https://official.example/networks', verifiedAt: '2026-07-26T00:00:00Z', expiresAt: '2026-07-28T00:00:00Z' };

test('oracle policy rejects stale, deviating and sequencer-unsafe rounds', () => {
  const policy = { network, feedAddressEvidenceId: 'official-feed', decimals: 2, maximumAgeSeconds: 60, maximumDeviationBps: 500, sequencerGraceSeconds: 30, fallback: 'block' as const };
  const observedAt = Date.parse('2026-07-26T12:00:00Z') / 1_000;
  assert.equal(validateOracleRound(policy, { answer: 10_000n, previousAnswer: 9_900n, updatedAt: observedAt - 10, observedAt, sequencerUp: true, sequencerRecoveredAt: observedAt - 100 }).normalized, '100.00');
  assert.throws(() => validateOracleRound(policy, { answer: 10_000n, updatedAt: 1, observedAt, sequencerUp: true }));
  assert.throws(() => validateOracleRound(policy, { answer: 20_000n, previousAnswer: 10_000n, updatedAt: observedAt - 1, observedAt, sequencerUp: true }));
});

test('cross-chain lifecycle needs source and destination evidence and blocks replay-like transitions', () => {
  const route = { sourceChainId: 'a', destinationChainId: 'b', provider: 'official-provider', trustAssumptions: ['validator set'], relayerModel: 'provider relayer', feeModel: 'quoted', finality: 'configured confirmations', timeoutSeconds: 60, recovery: 'refund', paused: false, officialEvidenceIds: ['e1'] };
  let message: CrossChainMessage = { id: 'm1', route, status: 'source_pending', replayKey: 'unique', history: ['source_pending'] };
  assert.throws(() => transitionCrossChainMessage(message, 'source_confirmed'));
  message = transitionCrossChainMessage(message, 'source_confirmed', { sourceTransaction: 'source-tx' });
  message = transitionCrossChainMessage(message, 'message_dispatched'); message = transitionCrossChainMessage(message, 'relaying'); message = transitionCrossChainMessage(message, 'destination_pending');
  assert.throws(() => transitionCrossChainMessage(message, 'destination_confirmed'));
  message = transitionCrossChainMessage(message, 'destination_confirmed', { destinationTransaction: 'destination-tx' }); assert.equal(message.status, 'destination_confirmed');
  assert.throws(() => transitionCrossChainMessage(message, 'refunded'));
});

test('DeFi fixed-point and owner limits hold across deterministic fuzz inputs', () => {
  for (const value of deterministicFuzz(1_000)) { const amount = BigInt(value); assert.ok(mulDivFloor(amount, 3n, 7n) <= mulDivCeil(amount, 3n, 7n)); }
  assert.doesNotThrow(() => enforceDefiGuard({ tokenDecimals: 6, minimumReceived: 95n, maximumSpent: 100n, maximumSlippageBps: 500, oracleFresh: true, approvalAmount: 100n, exactApprovalRequired: true, paused: false }, { spent: 100n, received: 95n, quotedReceived: 100n }));
  assert.throws(() => enforceDefiGuard({ tokenDecimals: 6, minimumReceived: 95n, maximumSpent: 100n, maximumSlippageBps: 500, oracleFresh: true, approvalAmount: 1_000n, exactApprovalRequired: true, paused: false }, { spent: 100n, received: 95n, quotedReceived: 100n }));
});

test('token supply and mainnet issuance remain explicit gated actions', () => {
  const spec = { purpose: 'Membership governance for a user-owned cooperative', standard: 'owner-selected', name: 'Member', symbol: 'MEM', decimals: 6, initialSupply: 10n, maximumSupply: 100n, mintAuthority: 'multisig', burnAuthority: 'holder', freezeAuthority: null, transferRestrictions: [], upgradeability: 'authorised' as const, adminControls: ['multisig'], distributionAssumptions: [], vesting: [], metadata: 'content-addressed', governanceRights: ['vote'], legalReviewRequired: true };
  assert.doesNotThrow(() => authoriseTokenIssuance(spec, { createSupply: true, recipient: 'test-recipient', mainnet: false }));
  assert.throws(() => authoriseTokenIssuance(spec, { createSupply: true, recipient: 'test-recipient', mainnet: true }));
});

test('governance prevents double voting and enforces quorum and timelock', () => {
  const proposal: GovernanceProposal = { id: 'p', snapshot: new Map([['alice', 6n], ['bob', 4n]]), votes: new Map(), startsAt: 10, endsAt: 20, quorum: 6n, executionDelaySeconds: 5 };
  castGovernanceVote(proposal, 'alice', 'for', 11); assert.throws(() => castGovernanceVote(proposal, 'alice', 'against', 12));
  queueGovernanceProposal(proposal, 20); assert.throws(() => executeGovernanceProposal(proposal, 24)); executeGovernanceProposal(proposal, 25); assert.equal(proposal.executedAt, 25);
});

test('attestations avoid personal data and support issuer revocation', () => {
  const registry = new AttestationRegistry(); registry.issue({ id: 'a', subjectReference: 'wallet-hash', claimHash: 'a'.repeat(64), issuer: 'issuer' }); assert.equal(registry.verify('a'), true);
  registry.revoke('a', 'issuer'); assert.equal(registry.verify('a'), false); assert.throws(() => registry.issue({ id: 'pii', subjectReference: 'person@example.com', claimHash: 'b'.repeat(64), issuer: 'issuer' }));
});

test('ZK definition separates witness and public inputs', () => {
  assert.doesNotThrow(() => validateZkSpecification({ statement: 'User is over threshold', publicInputs: ['threshold'], privateWitnessFields: ['birthDate'], proofSystem: 'owner-selected-current', trustedSetup: 'documented', provingEnvironment: 'browser', verifier: 'generated verifier', leakageRisks: ['threshold inference'], testVectors: [{ publicInput: 18, witnessReference: 'fixture-adult', expected: true }, { publicInput: 18, witnessReference: 'fixture-child', expected: false }] }));
  assert.throws(() => validateZkSpecification({ statement: 'bad', publicInputs: ['secret'], privateWitnessFields: ['secret'], proofSystem: 'p', trustedSetup: 'none', provingEnvironment: 'server', verifier: 'v', leakageRisks: [], testVectors: [{ publicInput: 1, witnessReference: 'a', expected: true }, { publicInput: 2, witnessReference: 'b', expected: false }] }));
});

test('decentralized storage status requires retrieval hash equality', async () => {
  let stored = new Uint8Array(); const port = { upload: async (content: Uint8Array) => { stored = content.slice(); return { contentId: 'cid-real', accepted: true }; }, retrieve: async () => stored };
  assert.equal((await persistAndVerifyContent(port, new TextEncoder().encode('artifact'))).verified, true);
  await assert.rejects(() => persistAndVerifyContent({ upload: port.upload, retrieve: async () => new TextEncoder().encode('tampered') }, new TextEncoder().encode('artifact')));
});

test('account abstraction never promises unavailable sponsorship', () => {
  const policy: AccountAbstractionPolicy = { chainEvidenceId: 'chain', entryPointVersion: 'verified-version', bundlerEvidenceId: 'bundler', sessionExpiresAt: '2026-07-27T00:00:00Z', allowedMethods: ['execute'], maximumValue: 10n, maximumGas: 100n, fallback: 'block' };
  assert.throws(() => authoriseSmartAccountAction(policy, { method: 'execute', value: 1n, gas: 50n, now: new Date('2026-07-26T00:00:00Z') }));
  assert.equal(authoriseSmartAccountAction({ ...policy, paymasterEvidenceId: 'paymaster', sponsorBalance: 100n }, { method: 'execute', value: 1n, gas: 50n, now: new Date('2026-07-26T00:00:00Z') }).sponsored, true);
});

test('multichain matrix keeps semantics explicit per chain', () => {
  const matrix = buildChainCapabilityMatrix([{ family: 'evm', chainId: 'a', networkEvidenceId: 'ea', contractInterface: 'ABI', walletMethods: ['personal_sign'], confirmations: 2, limitations: [] }, { family: 'solana', chainId: 'b', networkEvidenceId: 'eb', contractInterface: 'IDL', walletMethods: ['signMessage'], confirmations: 1, limitations: ['different finality'] }]);
  assert.equal(matrix.a.contractInterface, 'ABI'); assert.equal(matrix.b.contractInterface, 'IDL');
});

test('deployment and source verification cannot be fabricated', () => {
  const artifacts = sourceArtifact(EVM_ESCROW_SOURCE, ['release', 'refund']);
  assert.throws(() => validateDeploymentManifest({ schema: 'xroga.chain-deployment', schemaVersion: '1.0.0', migrationPath: ['1.0.0'], productId: 'p', repositoryCommit: 'a'.repeat(40), family: 'evm', network: 'test', chainId: 'c', toolchain: 'solc', compiler: '0.8.30', sourcePath: 'Escrow.sol', artifactHash: artifacts.sourceHash, interfaceHash: artifacts.interfaceHash, initializationArgumentsHash: 'b'.repeat(64), deployerAddress: '', transactionHash: '', deployedAddress: '', blockReference: '', upgradeAuthority: null, admin: null, explorerUrl: null, sourceVerification: 'pending', sourceVerificationUrl: null, deployedAt: new Date().toISOString(), environment: 'testnet', evidencePath: '' }));
});

test('mainnet gate lists missing safety decisions and never returns verified', () => {
  assert.throws(() => mainnetSafetyGate({ userConfirmed: false, networkConfirmed: true, signerConfirmed: true, balanceChecked: true, feesEstimated: true, addressesConfirmed: true, initializationConfirmed: true, authoritiesReviewed: true, testsPassed: true, staticAnalysisPassed: true, knownIssuesAccepted: true, rollbackPlan: true, legalAcknowledgement: true }));
  assert.equal(mainnetSafetyGate({ userConfirmed: true, networkConfirmed: true, signerConfirmed: true, balanceChecked: true, feesEstimated: true, addressesConfirmed: true, initializationConfirmed: true, authoritiesReviewed: true, testsPassed: true, staticAnalysisPassed: true, knownIssuesAccepted: true, rollbackPlan: true, legalAcknowledgement: true }), 'mainnet_activation_pending');
});

test('static contract analysis identifies privileged and signing hazards', () => {
  assert.ok(analyzeContractSource('contract Bad { function mint() external {} function x() external { require(tx.origin == msg.sender); } }').some((finding) => finding.severity === 'critical'));
  assert.equal(analyzeContractSource(EVM_ESCROW_SOURCE).some((finding) => finding.severity === 'critical'), false);
});

test('meaningful EVM escrow fixture passes access, state and 1000-case invariants', () => {
  assert.equal(analyzeContractSource(EVM_ESCROW_SOURCE).some((finding) => finding.severity === 'critical' || finding.severity === 'high'), false);
  for (const value of deterministicFuzz(1_000)) { const escrow = new EvmEscrowFixture('payer', 'beneficiary', 'arbiter', BigInt(value) + 1n); if (value % 2) escrow.release(value % 3 ? 'payer' : 'arbiter'); else escrow.refund(value % 3 ? 'beneficiary' : 'arbiter'); assert.equal(escrow.invariant(), true); assert.throws(() => escrow.release('attacker')); }
});

test('meaningful Solana fixture enforces signer, PDA and content hash account model', () => {
  const registry = new SolanaRegistryFixture('program-fixture'); const derived = registry.derivePda('alice'); const hash = createHash('sha256').update('record').digest('hex');
  assert.throws(() => registry.write({ signer: 'mallory', authority: 'alice', pda: derived.pda, dataHash: hash })); assert.throws(() => registry.write({ signer: 'alice', authority: 'alice', pda: 'substituted', dataHash: hash }));
  assert.equal(registry.write({ signer: 'alice', authority: 'alice', pda: derived.pda, dataHash: hash }).dataHash, hash);
});

test('compiled TypeScript non-EVM Soroban adapter enforces authorization and conservation', () => {
  const adapter = new StellarSorobanFixture(); adapter.setBalance('payer', 100n); const evidence = adapter.release({ authenticatedAddress: 'payer', payer: 'payer', beneficiary: 'beneficiary', amount: 30n });
  assert.match(evidence, /^[a-f0-9]{64}$/); assert.equal(adapter.balance('payer') + adapter.balance('beneficiary'), 100n); assert.throws(() => adapter.release({ authenticatedAddress: 'attacker', payer: 'payer', beneficiary: 'beneficiary', amount: 1n }));
});
