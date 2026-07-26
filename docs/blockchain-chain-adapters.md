# Blockchain chain adapters

Status: **Implemented contracts and local behavioral fixtures**; Solana and Stellar native toolchains are **external setup required on this host**.

EVM, Solana and Stellar/Soroban are explicit families; unknown families use a dynamic adapter contract rather than EVM assumptions. Network identity comes from runtime-verified official evidence with expiry. RPC failover stays on the selected chain. The indexer is idempotent and rolls back conflicting checkpoints.

Official setup references: [Solana installation](https://solana.com/docs/intro/installation) and [Stellar CLI installation](https://developers.stellar.org/docs/tools/cli/install-cli).
