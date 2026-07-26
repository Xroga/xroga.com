import { createHash } from 'crypto';

export const EVM_ESCROW_SOURCE = `// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
contract MilestoneEscrow {
  enum State { Funded, Released, Refunded }
  address public immutable payer; address public immutable beneficiary; address public immutable arbiter;
  uint256 public immutable fundedAmount; State public state; bool private locked;
  event Released(address indexed beneficiary, uint256 amount); event Refunded(address indexed payer, uint256 amount);
  modifier nonReentrant() { require(!locked); locked = true; _; locked = false; }
  constructor(address _beneficiary, address _arbiter) payable { require(msg.value > 0); payer = msg.sender; beneficiary = _beneficiary; arbiter = _arbiter; fundedAmount = msg.value; }
  function release() external nonReentrant { require(msg.sender == payer || msg.sender == arbiter); require(state == State.Funded); state = State.Released; (bool ok,) = beneficiary.call{value: address(this).balance}(""); require(ok); }
  function refund() external nonReentrant { require(msg.sender == beneficiary || msg.sender == arbiter); require(state == State.Funded); state = State.Refunded; (bool ok,) = payer.call{value: address(this).balance}(""); require(ok); }
}`;

export type EscrowState = 'funded' | 'released' | 'refunded';
export class EvmEscrowFixture {
  readonly initialAmount: bigint; state: EscrowState = 'funded'; balance: bigint; payerBalance = 0n; beneficiaryBalance = 0n;
  constructor(readonly payer: string, readonly beneficiary: string, readonly arbiter: string, amount: bigint) { if (amount <= 0n || new Set([payer, beneficiary, arbiter]).size !== 3) throw new Error('invalid escrow actors or funding'); this.initialAmount = amount; this.balance = amount; }
  release(caller: string): void { if (this.state !== 'funded' || ![this.payer, this.arbiter].includes(caller)) throw new Error('release denied'); const amount = this.balance; this.balance = 0n; this.state = 'released'; this.beneficiaryBalance += amount; }
  refund(caller: string): void { if (this.state !== 'funded' || ![this.beneficiary, this.arbiter].includes(caller)) throw new Error('refund denied'); const amount = this.balance; this.balance = 0n; this.state = 'refunded'; this.payerBalance += amount; }
  invariant(): boolean { return this.balance + this.payerBalance + this.beneficiaryBalance === this.initialAmount && !(this.payerBalance > 0n && this.beneficiaryBalance > 0n); }
}

export const SOLANA_REGISTRY_SOURCE = `use solana_program::{account_info::{next_account_info, AccountInfo}, entrypoint, entrypoint::ProgramResult, program_error::ProgramError, pubkey::Pubkey};
entrypoint!(process_instruction);
pub fn process_instruction(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
  let mut iter = accounts.iter(); let authority = next_account_info(&mut iter)?; let record = next_account_info(&mut iter)?;
  if !authority.is_signer { return Err(ProgramError::MissingRequiredSignature); }
  let (expected, _) = Pubkey::find_program_address(&[b"record", authority.key.as_ref()], program_id);
  if expected != *record.key || data.len() != 32 { return Err(ProgramError::InvalidSeeds); }
  record.try_borrow_mut_data()?[..32].copy_from_slice(data); Ok(())
}`;

export interface SolanaRecordAccount { pda: string; authority: string; dataHash: string; bump: number; }
export class SolanaRegistryFixture {
  private readonly records = new Map<string, SolanaRecordAccount>();
  constructor(readonly programId: string) { if (!programId) throw new Error('program ID is required'); }
  derivePda(authority: string): { pda: string; bump: number } { const digest = createHash('sha256').update(`record:${authority}:${this.programId}`).digest('hex'); return { pda: digest.slice(0, 44), bump: Number.parseInt(digest.slice(-2), 16) }; }
  write(input: { signer: string; authority: string; pda: string; dataHash: string }): SolanaRecordAccount { const expected = this.derivePda(input.authority); if (input.signer !== input.authority) throw new Error('missing required authority signature'); if (input.pda !== expected.pda) throw new Error('account substitution or PDA mismatch'); if (!/^[a-f0-9]{64}$/i.test(input.dataHash)) throw new Error('record requires a content hash'); const record = { pda: expected.pda, authority: input.authority, dataHash: input.dataHash, bump: expected.bump }; this.records.set(input.pda, record); return structuredClone(record); }
  read(pda: string): SolanaRecordAccount | null { return structuredClone(this.records.get(pda) ?? null); }
  reset(): void { this.records.clear(); }
}

export const STELLAR_ESCROW_SOURCE = `#![no_std]
use soroban_sdk::{contract, contractimpl, Address, Env};
#[contract] pub struct Escrow;
#[contractimpl] impl Escrow {
  pub fn release(env: Env, payer: Address, beneficiary: Address, amount: i128) {
    payer.require_auth(); assert!(amount > 0); let token = soroban_sdk::token::Client::new(&env, &env.current_contract_address()); token.transfer(&payer, &beneficiary, &amount);
  }
}`;

export class StellarSorobanFixture {
  private readonly balances = new Map<string, bigint>();
  setBalance(address: string, amount: bigint): void { if (!address || amount < 0n) throw new Error('invalid Stellar balance fixture'); this.balances.set(address, amount); }
  release(input: { authenticatedAddress: string; payer: string; beneficiary: string; amount: bigint }): string { if (input.authenticatedAddress !== input.payer) throw new Error('Soroban authorization denied'); if (input.amount <= 0n || (this.balances.get(input.payer) ?? 0n) < input.amount) throw new Error('Soroban escrow amount invalid'); this.balances.set(input.payer, this.balances.get(input.payer)! - input.amount); this.balances.set(input.beneficiary, (this.balances.get(input.beneficiary) ?? 0n) + input.amount); const balances = [...this.balances].map(([address, amount]) => [address, amount.toString()]); return createHash('sha256').update(JSON.stringify({ ...input, amount: input.amount.toString(), balances })).digest('hex'); }
  balance(address: string): bigint { return this.balances.get(address) ?? 0n; }
}

export function sourceArtifact(source: string, interfaceValue: unknown): { sourceHash: string; interfaceHash: string } { return { sourceHash: createHash('sha256').update(source).digest('hex'), interfaceHash: createHash('sha256').update(JSON.stringify(interfaceValue)).digest('hex') }; }

export function deterministicFuzz(iterations: number, seed = 17): number[] { if (iterations < 1) throw new Error('fuzz suite cannot run zero cases'); let state = seed >>> 0; const values: number[] = []; for (let index = 0; index < iterations; index += 1) { state = (state * 1_664_525 + 1_013_904_223) >>> 0; values.push(state); } return values; }
