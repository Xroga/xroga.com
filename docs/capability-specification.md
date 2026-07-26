# Capability specifications

Status: **Implemented**.

`backend/src/synthesis/capabilityGraph.ts` converts each graph node into a versioned capability specification with operations, contracts, security, permissions, providers, files, migrations, tests, evidence and rollback. It then compiles implementation and validation task nodes. Compiled nodes begin in `ready` or `pending`; planning never marks them completed.

Advanced chain requirements create separate oracle, cross-chain, DeFi, asset, governance, identity, zero-knowledge, content-storage and account-abstraction nodes only when the request requires them.
