# Xroga AI Routing

This file documents repository-specific production routing policy. It contains no credentials and the runtime does not depend on developer-local model metadata.

## Product contract

- Normal users describe outcomes; server-side routing chooses models, context, fallbacks, validation, and repair.
- Optimize the final validated outcome. Choose the least expensive route that still meets required quality.
- Never treat an environment-variable name as proof that a provider is healthy.
- Preserve validated project state across model switches. All file changes pass through the shared patch/file-writing pipeline.
- Never expose API keys, authorization headers, system prompts, private reasoning, raw provider payloads, or internal routing scores.

## Routing modes

- `balanced`: default. Strong models handle difficult subtasks; efficient models handle focused work.
- `intelligence`: architecture, large repositories, high-risk integrations, repeated failures, and independent review.
- `cost`: small edits, repetitive transformations, test scaffolding, and targeted validation repair. Validation requirements remain unchanged.

Administrators configure defaults and limits with server-side `XROGA_*` routing variables. Users do not select providers.

## Preferred roles

- Kimi: large-context repository analysis, architecture, multi-file consistency, difficult planning.
- GLM: general software engineering, repository updates, backend/API implementation, structured patches.
- DeepSeek Pro/Flash: focused edits, fast implementation, tests, type/build repair, cleanup.
- Grok: current web/X/crypto research and large document review when configured for those capabilities.
- Tavily: official documentation and focused source retrieval; it is not a coding model.

These are capability preferences, not unconditional hardcoded routes. Runtime configuration, health, context limits, validation history, quota, cost, and current failures can override them.

## Task graph and context

Complex requests are decomposed into dependent subtasks: understanding, targeted repository inspection, research, architecture, implementation, validation, review, repair, and publishing operations as required.

Each subtask declares its objective, dependencies, allowed files, expected output, risk, model route, fallbacks, validation, token budget, and timeout.

Context preparation must:

- include repository instructions, project manifest, relevant interfaces, target files, existing provider/database patterns, and relevant tests;
- retrieve targeted files from the incremental repository index;
- summarize unchanged large files;
- exclude unrelated files, secrets, and noisy logs;
- use broad-context models only when the task genuinely needs them.

## Validation and repair

- Patch misses route to structural repair.
- Syntax/type failures route to focused validation repair.
- Dependency/build failures route to build debugging.
- Runtime/integration failures route with the real response and affected files.
- Security findings route to a security-sensitive repair and independent review.
- Deployment failures preserve the last valid commit and route to deployment troubleshooting.

Never repeat the identical failed prompt. Add real validation evidence and repair only the affected subsystem. Repair attempts are bounded by server configuration.

## Review requirements

Independent review is required for authentication, payments, wallets/contracts, secret handling, database permissions, deployment infrastructure, critical complexity, repeated validation failure, or large change sets. The reviewer must be a distinct healthy model when available.

## Provider health and failover

Real calls update runtime latency, failures, validation success, and circuit state. Authentication, invalid-model, malformed-request, unsupported-operation, and known context-limit failures are not blindly retried. Retryable failures use bounded exponential backoff with jitter and cancellation.

Failover preserves the last validated checkpoint, supplies only necessary context, avoids duplicate file writes, and stops with the real blocker when all suitable routes fail.

## Safe observability

Store only privacy-safe routing outcomes: task class, mode, safe model identifier, latency, token/cost totals, patch/validation outcomes, repair count, model switches, and deployment result. Do not store raw secrets, private prompt content, hidden prompts, or chain-of-thought.
