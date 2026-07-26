import { createHash, randomBytes, randomUUID } from 'crypto';

export type ChainFamily = 'evm' | 'solana' | 'stellar_soroban' | 'other';
export interface ChainNetworkFact { family: ChainFamily; name: string; chainId: string; rpcUrls: string[]; explorerUrl?: string; sourceUrl: string; verifiedAt: string; expiresAt: string; }

export function validateNetworkFact(fact: ChainNetworkFact, now = new Date()): ChainNetworkFact {
  if (!fact.chainId || !fact.name || !/^https:\/\//.test(fact.sourceUrl)) throw new Error('chain identity requires an authoritative HTTPS source');
  if (new Date(fact.expiresAt) <= now || new Date(fact.verifiedAt) > now || new Date(fact.verifiedAt) >= new Date(fact.expiresAt)) throw new Error('chain fact is stale or has an invalid evidence window');
  if (!fact.rpcUrls.length || fact.rpcUrls.some((url) => !/^https:\/\//.test(url))) throw new Error('chain RPC URLs must be explicit HTTPS endpoints');
  return structuredClone(fact);
}

export const CHAIN_TOOLCHAINS = [
  { id: 'evm_foundry', family: 'evm', build: 'forge build', test: 'forge test', sourceUrl: 'https://getfoundry.sh/' },
  { id: 'evm_hardhat', family: 'evm', build: 'npx hardhat compile', test: 'npx hardhat test', sourceUrl: 'https://hardhat.org/docs' },
  { id: 'solana_native', family: 'solana', build: 'cargo build-sbf', test: 'cargo test', sourceUrl: 'https://solana.com/docs/programs' },
  { id: 'solana_anchor', family: 'solana', build: 'anchor build', test: 'anchor test', sourceUrl: 'https://www.anchor-lang.com/' },
  { id: 'stellar_soroban', family: 'stellar_soroban', build: 'stellar contract build', test: 'cargo test', sourceUrl: 'https://developers.stellar.org/docs/build/smart-contracts' },
] as const;

export interface WalletChallenge { id: string; address: string; domain: string; chainId: string; nonce: string; message: string; expiresAt: string; usedAt: string | null; }
export interface WalletChallengeStore { load(id: string): Promise<WalletChallenge | null>; save(value: WalletChallenge): Promise<void>; }
export class InMemoryWalletChallengeStore implements WalletChallengeStore {
  private readonly values = new Map<string, WalletChallenge>();
  async load(id: string) { return structuredClone(this.values.get(id) ?? null); }
  async save(value: WalletChallenge) { this.values.set(value.id, structuredClone(value)); }
}

export async function issueWalletChallenge(input: { store: WalletChallengeStore; address: string; domain: string; chainId: string; ttlMs?: number; now?: Date }): Promise<WalletChallenge> {
  if (!input.address.trim() || !input.domain.trim() || !input.chainId.trim()) throw new Error('wallet challenge requires address, domain and chain identity');
  const now = input.now ?? new Date();
  const nonce = randomBytes(18).toString('base64url');
  const value: WalletChallenge = { id: randomUUID(), address: input.address, domain: input.domain.toLowerCase(), chainId: input.chainId, nonce, message: `${input.domain.toLowerCase()} requests wallet authentication\nAddress: ${input.address}\nChain ID: ${input.chainId}\nNonce: ${nonce}\nIssued At: ${now.toISOString()}`, expiresAt: new Date(now.getTime() + (input.ttlMs ?? 300_000)).toISOString(), usedAt: null };
  await input.store.save(value); return value;
}

export async function verifyWalletChallenge(input: { store: WalletChallengeStore; challengeId: string; domain: string; chainId: string; signature: string; verifier: (message: string, signature: string, expectedAddress: string) => Promise<boolean>; now?: Date }): Promise<{ address: string; evidenceId: string }> {
  const value = await input.store.load(input.challengeId); const now = input.now ?? new Date();
  if (!value || value.usedAt || new Date(value.expiresAt) <= now) throw new Error('wallet challenge is missing, expired or already used');
  if (value.domain !== input.domain.toLowerCase() || value.chainId !== input.chainId) throw new Error('wallet challenge domain or chain mismatch');
  if (!await input.verifier(value.message, input.signature, value.address)) throw new Error('wallet signature is invalid');
  value.usedAt = now.toISOString(); await input.store.save(value);
  return { address: value.address, evidenceId: createHash('sha256').update(`${value.id}:${value.usedAt}`).digest('hex') };
}

export interface SignerPolicy { allowedChainIds: string[]; allowedContractAddresses: string[]; allowedMethods: string[]; maximumValue: string; expiresAt: string; requireConfirmation: boolean; }
export function enforceSignerPolicy(input: { policy: SignerPolicy; chainId: string; contractAddress: string; method: string; value: bigint; ownerConfirmed: boolean; signerMaterial?: string; now?: Date }): void {
  const now = input.now ?? new Date();
  if (input.signerMaterial && /(?:seed phrase|mnemonic|private key|0x[a-f0-9]{64})/i.test(input.signerMaterial)) throw new Error('raw signer material is forbidden');
  if (new Date(input.policy.expiresAt) <= now) throw new Error('signer policy expired');
  if (!input.policy.allowedChainIds.includes(input.chainId) || !input.policy.allowedContractAddresses.map((v) => v.toLowerCase()).includes(input.contractAddress.toLowerCase()) || !input.policy.allowedMethods.includes(input.method)) throw new Error('transaction is outside signer policy');
  if (input.value > BigInt(input.policy.maximumValue)) throw new Error('transaction exceeds signer spend limit');
  if (input.policy.requireConfirmation && !input.ownerConfirmed) throw new Error('transaction requires explicit owner confirmation');
}

export interface ContractSpecification { name: string; family: ChainFamily; invariants: string[]; roles: string[]; upgradePolicy: 'immutable' | 'owner_authorised' | 'multisig'; emergencyControls: string[]; deploymentNetworks: ChainNetworkFact[]; }
export function validateContractSpecification(spec: ContractSpecification): void {
  if (!spec.name || !spec.invariants.length || !spec.roles.length || !spec.deploymentNetworks.length) throw new Error('contract specification lacks required invariants, roles or networks');
  for (const network of spec.deploymentNetworks) validateNetworkFact(network);
  if (spec.upgradePolicy !== 'immutable' && !spec.emergencyControls.length) throw new Error('upgradeable contracts require explicit emergency controls');
}

export type TransactionStatus = 'prepared' | 'awaiting_authorisation' | 'submitted' | 'confirmed' | 'finalised' | 'reverted' | 'dropped' | 'blocked';
const TX_TRANSITIONS: Record<TransactionStatus, TransactionStatus[]> = { prepared: ['awaiting_authorisation', 'submitted', 'blocked'], awaiting_authorisation: ['submitted', 'blocked'], submitted: ['confirmed', 'reverted', 'dropped'], confirmed: ['finalised', 'reverted'], finalised: [], reverted: [], dropped: ['submitted'], blocked: [] };
export interface TransactionRecord { id: string; chainId: string; status: TransactionStatus; transactionHash?: string; blockReference?: string; history: Array<{ status: TransactionStatus; at: string; evidenceId?: string }>; }
export function transitionTransaction(record: TransactionRecord, next: TransactionStatus, evidence?: { transactionHash?: string; blockReference?: string; providerEvidenceId?: string }, now = new Date()): TransactionRecord {
  if (!TX_TRANSITIONS[record.status].includes(next)) throw new Error(`illegal transaction transition ${record.status} -> ${next}`);
  if (['submitted', 'confirmed', 'finalised'].includes(next) && !evidence?.transactionHash) throw new Error('on-chain state requires a real transaction hash');
  if (next === 'finalised' && !evidence?.blockReference) throw new Error('finality requires a block reference');
  return { ...record, status: next, transactionHash: evidence?.transactionHash ?? record.transactionHash, blockReference: evidence?.blockReference ?? record.blockReference, history: [...record.history, { status: next, at: now.toISOString(), evidenceId: evidence?.providerEvidenceId }] };
}

export interface IndexedChainEvent { id: string; chainId: string; blockHeight: number; blockHash: string; payload: unknown; }
export class ChainIndexerState {
  private checkpoint: { height: number; hash: string } | null = null;
  private readonly events = new Map<string, IndexedChainEvent>();
  private readonly deadLetters: Array<{ event: IndexedChainEvent; reason: string }> = [];
  ingest(event: IndexedChainEvent, process: (event: IndexedChainEvent) => void): { duplicate: boolean; rolledBack: number } {
    if (this.events.has(event.id)) return { duplicate: true, rolledBack: 0 };
    let rolledBack = 0;
    if (this.checkpoint && event.blockHeight <= this.checkpoint.height && event.blockHash !== this.checkpoint.hash) {
      for (const [id, existing] of this.events) if (existing.blockHeight >= event.blockHeight) { this.events.delete(id); rolledBack += 1; }
    }
    try { process(event); } catch (error) { this.deadLetters.push({ event, reason: error instanceof Error ? error.message : 'processing failed' }); throw error; }
    this.events.set(event.id, structuredClone(event)); this.checkpoint = { height: event.blockHeight, hash: event.blockHash };
    return { duplicate: false, rolledBack };
  }
  snapshot() { return { checkpoint: structuredClone(this.checkpoint), eventCount: this.events.size, deadLetters: structuredClone(this.deadLetters) }; }
}

export interface RpcEndpoint { url: string; chainId: string; health: 'healthy' | 'degraded' | 'open'; latencyMs: number; }
export async function rpcWithFailover<T>(input: { expectedChainId: string; endpoints: RpcEndpoint[]; operation: (endpoint: RpcEndpoint, signal: AbortSignal) => Promise<T> }): Promise<{ value: T; endpoint: string }> {
  const compatible = input.endpoints.filter((endpoint) => endpoint.chainId === input.expectedChainId && endpoint.health !== 'open').sort((a, b) => a.latencyMs - b.latencyMs);
  if (!compatible.length) throw new Error('no healthy RPC endpoint for the selected chain identity');
  let last: unknown;
  for (const endpoint of compatible) {
    try { return { value: await input.operation(endpoint, AbortSignal.timeout(10_000)), endpoint: endpoint.url }; } catch (error) { last = error; }
  }
  throw Object.assign(new Error('all compatible RPC endpoints failed'), { cause: last });
}
