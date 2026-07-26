import { createHash } from 'crypto';
import type { ChainFamily, ChainNetworkFact } from './chainRuntime.js';
import { validateNetworkFact } from './chainRuntime.js';

export type BlockchainStatus = 'architecture_pending' | 'toolchain_ready' | 'contracts_generated' | 'compile_failed' | 'compiled' | 'local_tests_failed' | 'local_tests_passed' | 'local_deployment_ready' | 'local_deployed' | 'testnet_funds_required' | 'testnet_deployment_pending' | 'testnet_deployed' | 'source_verification_pending' | 'source_verified' | 'wallet_integration_verified' | 'indexer_syncing' | 'indexer_verified' | 'e2e_failed' | 'e2e_verified' | 'hackathon_evidence_ready' | 'submission_action_required' | 'mainnet_review_required' | 'mainnet_activation_pending' | 'mainnet_verified' | 'blocked' | 'failed';

export interface OraclePolicy {
  network: ChainNetworkFact;
  feedAddressEvidenceId: string;
  decimals: number;
  maximumAgeSeconds: number;
  maximumDeviationBps: number;
  sequencerGraceSeconds?: number;
  fallback: 'block' | 'last_known_with_warning' | 'secondary_verified_oracle';
}
export interface OracleRound { answer: bigint; updatedAt: number; observedAt: number; sequencerUp: boolean; sequencerRecoveredAt?: number; previousAnswer?: bigint; }

export function validateOracleRound(policy: OraclePolicy, round: OracleRound): { normalized: string; stale: false } {
  validateNetworkFact(policy.network, new Date(round.observedAt * 1000));
  if (!policy.feedAddressEvidenceId || policy.decimals < 0 || policy.decimals > 30 || policy.maximumAgeSeconds < 1) throw new Error('oracle policy lacks verified feed metadata');
  if (round.answer <= 0n) throw new Error('oracle returned missing or non-positive data');
  if (round.observedAt - round.updatedAt > policy.maximumAgeSeconds) throw new Error('oracle data is stale');
  if (!round.sequencerUp) throw new Error('sequencer is down');
  if (policy.sequencerGraceSeconds && round.sequencerRecoveredAt && round.observedAt - round.sequencerRecoveredAt < policy.sequencerGraceSeconds) throw new Error('sequencer recovery grace period is active');
  if (round.previousAnswer && round.previousAnswer > 0n) {
    const delta = round.answer > round.previousAnswer ? round.answer - round.previousAnswer : round.previousAnswer - round.answer;
    if (delta * 10_000n > round.previousAnswer * BigInt(policy.maximumDeviationBps)) throw new Error('oracle deviation exceeds manipulation guard');
  }
  const scale = 10n ** BigInt(policy.decimals);
  return { normalized: `${round.answer / scale}.${(round.answer % scale).toString().padStart(policy.decimals, '0')}`, stale: false };
}

export type CrossChainStatus = 'source_pending' | 'source_confirmed' | 'message_dispatched' | 'relaying' | 'destination_pending' | 'destination_confirmed' | 'refundable' | 'refunded' | 'failed';
const CROSS_CHAIN_TRANSITIONS: Record<CrossChainStatus, CrossChainStatus[]> = {
  source_pending: ['source_confirmed', 'failed'], source_confirmed: ['message_dispatched', 'refundable', 'failed'], message_dispatched: ['relaying', 'refundable', 'failed'], relaying: ['destination_pending', 'refundable', 'failed'], destination_pending: ['destination_confirmed', 'refundable', 'failed'], destination_confirmed: [], refundable: ['refunded'], refunded: [], failed: ['refundable'],
};
export interface CrossChainRoute { sourceChainId: string; destinationChainId: string; provider: string; trustAssumptions: string[]; relayerModel: string; feeModel: string; finality: string; timeoutSeconds: number; recovery: string; paused: boolean; officialEvidenceIds: string[]; }
export interface CrossChainMessage { id: string; route: CrossChainRoute; status: CrossChainStatus; sourceTransaction?: string; destinationTransaction?: string; replayKey: string; history: CrossChainStatus[]; }

export function transitionCrossChainMessage(message: CrossChainMessage, next: CrossChainStatus, evidence: { sourceTransaction?: string; destinationTransaction?: string } = {}): CrossChainMessage {
  if (message.route.paused && !['refundable', 'refunded', 'failed'].includes(next)) throw new Error('cross-chain route is paused');
  if (!message.route.officialEvidenceIds.length || !message.route.sourceChainId || !message.route.destinationChainId) throw new Error('cross-chain route is unverified');
  if (!CROSS_CHAIN_TRANSITIONS[message.status].includes(next)) throw new Error(`illegal cross-chain transition ${message.status} -> ${next}`);
  const sourceTransaction = evidence.sourceTransaction ?? message.sourceTransaction;
  const destinationTransaction = evidence.destinationTransaction ?? message.destinationTransaction;
  if (['source_confirmed', 'message_dispatched', 'relaying', 'destination_pending', 'destination_confirmed'].includes(next) && !sourceTransaction) throw new Error('source-chain evidence is required');
  if (next === 'destination_confirmed' && !destinationTransaction) throw new Error('destination-chain evidence is required');
  return { ...message, status: next, sourceTransaction, destinationTransaction, history: [...message.history, next] };
}

export function mulDivFloor(value: bigint, multiplier: bigint, denominator: bigint): bigint { if (denominator <= 0n || value < 0n || multiplier < 0n) throw new Error('invalid fixed-point operands'); return value * multiplier / denominator; }
export function mulDivCeil(value: bigint, multiplier: bigint, denominator: bigint): bigint { if (denominator <= 0n || value < 0n || multiplier < 0n) throw new Error('invalid fixed-point operands'); const product = value * multiplier; return product === 0n ? 0n : (product - 1n) / denominator + 1n; }
export interface DefiGuard { tokenDecimals: number; minimumReceived: bigint; maximumSpent: bigint; maximumSlippageBps: number; oracleFresh: boolean; approvalAmount: bigint; exactApprovalRequired: boolean; paused: boolean; }
export function enforceDefiGuard(guard: DefiGuard, input: { spent: bigint; received: bigint; quotedReceived: bigint }): void {
  if (guard.paused) throw new Error('financial operation is paused');
  if (!guard.oracleFresh) throw new Error('financial operation requires a fresh oracle');
  if (guard.tokenDecimals < 0 || guard.tokenDecimals > 30 || guard.maximumSlippageBps < 0 || guard.maximumSlippageBps > 10_000) throw new Error('invalid financial precision or slippage policy');
  if (input.spent > guard.maximumSpent || input.received < guard.minimumReceived) throw new Error('financial amount violates owner limits');
  if (input.received * 10_000n < input.quotedReceived * BigInt(10_000 - guard.maximumSlippageBps)) throw new Error('minimum received violates slippage policy');
  if (guard.exactApprovalRequired && guard.approvalAmount !== input.spent) throw new Error('unlimited or excessive approval is forbidden');
}

export interface TokenSpecification { purpose: string; standard: string; name: string; symbol: string; decimals: number; initialSupply: bigint; maximumSupply: bigint; mintAuthority: string | null; burnAuthority: string | null; freezeAuthority: string | null; transferRestrictions: string[]; upgradeability: 'immutable' | 'authorised'; adminControls: string[]; distributionAssumptions: string[]; vesting: string[]; metadata: string; governanceRights: string[]; legalReviewRequired: boolean; }
export function authoriseTokenIssuance(spec: TokenSpecification, approval: { createSupply: boolean; recipient?: string; mainnet: boolean }): void {
  if (spec.purpose.trim().length < 12) throw new Error('token issuance lacks a justified product purpose');
  if (!approval.createSupply || !approval.recipient) throw new Error('token supply and recipient require explicit approval');
  if (spec.initialSupply < 0n || spec.maximumSupply < spec.initialSupply || spec.decimals < 0 || spec.decimals > 30) throw new Error('invalid token supply or precision');
  if (approval.mainnet) throw new Error('token mainnet issuance requires the separate mainnet safety gate');
}

export interface GovernanceProposal { id: string; snapshot: Map<string, bigint>; votes: Map<string, 'for' | 'against'>; startsAt: number; endsAt: number; quorum: bigint; executionDelaySeconds: number; queuedAt?: number; executedAt?: number; cancelledAt?: number; }
export function castGovernanceVote(proposal: GovernanceProposal, voter: string, choice: 'for' | 'against', now: number): void {
  if (now < proposal.startsAt || now >= proposal.endsAt) throw new Error('proposal is outside its voting period');
  if (!proposal.snapshot.has(voter) || proposal.snapshot.get(voter) === 0n) throw new Error('voter had no snapshot voting power');
  if (proposal.votes.has(voter)) throw new Error('double voting is forbidden');
  proposal.votes.set(voter, choice);
}
export function queueGovernanceProposal(proposal: GovernanceProposal, now: number): void {
  if (now < proposal.endsAt || proposal.cancelledAt) throw new Error('proposal cannot be queued');
  let support = 0n; for (const [voter, choice] of proposal.votes) if (choice === 'for') support += proposal.snapshot.get(voter) ?? 0n;
  if (support < proposal.quorum) throw new Error('proposal did not reach quorum'); proposal.queuedAt = now;
}
export function executeGovernanceProposal(proposal: GovernanceProposal, now: number): void { if (!proposal.queuedAt || now < proposal.queuedAt + proposal.executionDelaySeconds || proposal.executedAt || proposal.cancelledAt) throw new Error('governance timelock or terminal state blocks execution'); proposal.executedAt = now; }

export interface Attestation { id: string; subjectReference: string; claimHash: string; issuer: string; expiresAt?: string; revokedAt?: string; }
export class AttestationRegistry {
  private readonly values = new Map<string, Attestation>();
  issue(value: Attestation): void { if (!/^[a-f0-9]{64}$/i.test(value.claimHash) || /@|\b\d{3}-\d{2}-\d{4}\b/.test(value.subjectReference)) throw new Error('on-chain attestations must contain only privacy-safe references'); if (this.values.has(value.id)) throw new Error('attestation already exists'); this.values.set(value.id, structuredClone(value)); }
  revoke(id: string, issuer: string, now = new Date()): void { const value = this.values.get(id); if (!value || value.issuer !== issuer || value.revokedAt) throw new Error('attestation revocation is unauthorized or invalid'); value.revokedAt = now.toISOString(); }
  verify(id: string, now = new Date()): boolean { const value = this.values.get(id); return Boolean(value && !value.revokedAt && (!value.expiresAt || new Date(value.expiresAt) > now)); }
}

export interface ZkSpecification { statement: string; publicInputs: string[]; privateWitnessFields: string[]; proofSystem: string; trustedSetup: string; provingEnvironment: 'browser' | 'server'; verifier: string; leakageRisks: string[]; testVectors: Array<{ publicInput: unknown; witnessReference: string; expected: boolean }>; }
export function validateZkSpecification(spec: ZkSpecification): void {
  if (!spec.statement || !spec.publicInputs.length || !spec.privateWitnessFields.length || !spec.proofSystem || !spec.verifier || spec.testVectors.length < 2) throw new Error('zero-knowledge specification is incomplete');
  if (spec.publicInputs.some((field) => spec.privateWitnessFields.includes(field))) throw new Error('private witness is exposed as a public input');
  if (spec.testVectors.some((vector) => !vector.witnessReference || /seed|private|secret/i.test(JSON.stringify(vector.publicInput)))) throw new Error('zero-knowledge test vector leaks private data');
}

export interface ContentAddressedStoragePort { upload(content: Uint8Array): Promise<{ contentId: string; accepted: boolean }>; retrieve(contentId: string): Promise<Uint8Array>; }
export async function persistAndVerifyContent(port: ContentAddressedStoragePort, content: Uint8Array): Promise<{ contentId: string; contentHash: string; verified: true }> {
  if (!content.byteLength) throw new Error('empty content cannot be persisted');
  const hash = createHash('sha256').update(content).digest('hex'); const uploaded = await port.upload(content);
  if (!uploaded.accepted || !uploaded.contentId) throw new Error('storage upload was not accepted');
  const retrieved = await port.retrieve(uploaded.contentId); const retrievedHash = createHash('sha256').update(retrieved).digest('hex');
  if (hash !== retrievedHash) throw new Error('retrieved content hash does not match upload');
  return { contentId: uploaded.contentId, contentHash: hash, verified: true };
}

export interface AccountAbstractionPolicy { chainEvidenceId: string; entryPointVersion: string; bundlerEvidenceId: string; paymasterEvidenceId?: string; sessionExpiresAt: string; allowedMethods: string[]; maximumValue: bigint; maximumGas: bigint; sponsorBalance?: bigint; fallback: 'user_pays' | 'block'; }
export function authoriseSmartAccountAction(policy: AccountAbstractionPolicy, action: { method: string; value: bigint; gas: bigint; now: Date }): { sponsored: boolean } {
  if (!policy.chainEvidenceId || !policy.entryPointVersion || !policy.bundlerEvidenceId || new Date(policy.sessionExpiresAt) <= action.now) throw new Error('smart-account configuration or session is invalid');
  if (!policy.allowedMethods.includes(action.method) || action.value > policy.maximumValue || action.gas > policy.maximumGas) throw new Error('smart-account action exceeds session policy');
  const sponsored = Boolean(policy.paymasterEvidenceId && policy.sponsorBalance && policy.sponsorBalance >= action.gas);
  if (!sponsored && policy.fallback === 'block') throw new Error('gas sponsorship is unavailable; gasless execution cannot be promised');
  return { sponsored };
}

export interface ChainCapability { family: ChainFamily; chainId: string; networkEvidenceId: string; contractInterface: string; walletMethods: string[]; confirmations: number; limitations: string[]; }
export function buildChainCapabilityMatrix(capabilities: ChainCapability[]): Record<string, ChainCapability> {
  const matrix: Record<string, ChainCapability> = {};
  for (const capability of capabilities) { if (!capability.chainId || !capability.networkEvidenceId || !capability.walletMethods.length || capability.confirmations < 1) throw new Error('chain capability lacks explicit semantics or evidence'); if (matrix[capability.chainId]) throw new Error('duplicate chain capability'); matrix[capability.chainId] = structuredClone(capability); }
  return matrix;
}

export interface DeploymentManifest { schema: 'xroga.chain-deployment'; schemaVersion: '1.0.0'; migrationPath: string[]; productId: string; repositoryCommit: string; family: ChainFamily; network: string; chainId: string; toolchain: string; compiler: string; sourcePath: string; artifactHash: string; interfaceHash: string; initializationArgumentsHash: string; deployerAddress: string; transactionHash: string; deployedAddress: string; blockReference: string; upgradeAuthority: string | null; admin: string | null; explorerUrl: string | null; sourceVerification: 'pending' | 'failed' | 'verified' | 'unavailable'; sourceVerificationUrl: string | null; deployedAt: string; environment: 'local' | 'testnet' | 'mainnet'; evidencePath: string; }
export function validateDeploymentManifest(manifest: DeploymentManifest): void {
  const hashes = [manifest.artifactHash, manifest.interfaceHash, manifest.initializationArgumentsHash];
  if (!/^[a-f0-9]{40}$/i.test(manifest.repositoryCommit) || hashes.some((value) => !/^[a-f0-9]{64}$/i.test(value))) throw new Error('deployment manifest lacks content-addressed build evidence');
  if (!manifest.transactionHash || !manifest.deployedAddress || !manifest.blockReference || !manifest.evidencePath) throw new Error('deployment manifest cannot be created without real deployment evidence');
  if (manifest.sourceVerification === 'verified' && (!manifest.sourceVerificationUrl || !/^https:\/\//.test(manifest.sourceVerificationUrl))) throw new Error('source verification requires a real verification URL');
}

export interface MainnetReview { userConfirmed: boolean; networkConfirmed: boolean; signerConfirmed: boolean; balanceChecked: boolean; feesEstimated: boolean; addressesConfirmed: boolean; initializationConfirmed: boolean; authoritiesReviewed: boolean; testsPassed: boolean; staticAnalysisPassed: boolean; knownIssuesAccepted: boolean; rollbackPlan: boolean; legalAcknowledgement: boolean; professionalAuditEvidence?: string; }
export function mainnetSafetyGate(review: MainnetReview): 'mainnet_activation_pending' {
  const required = Object.entries(review).filter(([name]) => name !== 'professionalAuditEvidence');
  if (required.some(([, value]) => value !== true)) throw new Error(`mainnet blocked: missing ${required.filter(([, value]) => value !== true).map(([name]) => name).join(', ')}`);
  return 'mainnet_activation_pending';
}

export interface SecurityFinding { id: string; severity: 'critical' | 'high' | 'medium' | 'low'; category: string; message: string; }
export function analyzeContractSource(source: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const add = (severity: SecurityFinding['severity'], category: string, message: string) => findings.push({ id: createHash('sha256').update(`${category}:${message}`).digest('hex').slice(0, 12), severity, category, message });
  if (/tx\.origin/.test(source)) add('critical', 'broken_access_control', 'tx.origin authorization is forbidden');
  if (/delegatecall/.test(source) && !/allowlistedDelegate/.test(source)) add('high', 'unsafe_delegate_call', 'delegatecall requires an explicit allowlist');
  if (/selfdestruct/.test(source)) add('high', 'destructive_operation', 'selfdestruct requires explicit architecture justification');
  if (/approve\([^,]+,\s*type\(uint256\)\.max/.test(source)) add('high', 'unlimited_approval', 'unlimited token approval requires explicit user confirmation');
  if (/function\s+(?:initialize|upgrade|mint|pause)\b/.test(source) && !/(?:onlyOwner|onlyRole|authorised)/.test(source)) add('critical', 'unprotected_privileged_function', 'privileged function lacks visible access control');
  if (/blockhash|block\.timestamp/.test(source) && /random/i.test(source)) add('high', 'unsafe_randomness', 'block data is unsafe randomness');
  if (/call\{value:/.test(source) && !/(?:nonReentrant|checks-effects-interactions)/.test(source)) add('high', 'reentrancy', 'external value transfer lacks a visible reentrancy mitigation');
  return findings;
}
