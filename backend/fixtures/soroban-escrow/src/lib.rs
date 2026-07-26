#![no_std]

use soroban_sdk::{contract, contractimpl, token, Address, Env};

#[contract]
pub struct Escrow;

#[contractimpl]
impl Escrow {
    pub fn release(
        env: Env,
        token_address: Address,
        payer: Address,
        beneficiary: Address,
        amount: i128,
    ) {
        payer.require_auth();
        assert!(amount > 0, "amount must be positive");
        token::Client::new(&env, &token_address).transfer(&payer, &beneficiary, &amount);
    }
}
