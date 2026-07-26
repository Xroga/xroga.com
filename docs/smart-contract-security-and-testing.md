# Smart-contract security and testing

Status: **Implemented local analysis and behavioral tests**; professional audit is **not claimed**.

The EVM escrow fixture has real Solidity source and was compiled with `solc 0.8.30`. Deterministic tests cover authority, terminal state, conservation and 1,000 fuzz inputs. Solana tests cover signer/PDA/account-substitution behavior; Soroban tests cover authorization and value conservation. Static analysis flags dangerous origin, delegate call, self-destruction, unlimited approvals, weak randomness, privileged functions and interaction ordering.

Rust, Solana validator and Stellar CLI were not installed, so native program builds/local-validator evidence remain incomplete rather than silently skipped. Fixture manifests pin the registry versions resolved on 2026-07-26 (`solana-program 4.0.0`, `soroban-sdk 27.0.2`); they must be revalidated before later upgrades.
