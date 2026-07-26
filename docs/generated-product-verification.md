# Generated-product verification

Status: **Implemented compiler and executor**; external tiers remain **external setup required**.

`backend/src/synthesis/verificationCompiler.ts` derives checks from permissions, lifecycles, critical workflows, payments, domains, AI, blockchain capabilities, graph validation strategies, the production build and accessibility requirements. A plan with zero tests fails. A test passes only after its executor returns evidence.

The exact tiers are unit, integration, generated fixture, external sandbox and authorised live/testnet. Missing internal executors fail; missing external authorization produces `external_validation_pending` with the exact blocker.
