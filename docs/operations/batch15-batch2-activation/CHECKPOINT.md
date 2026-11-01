# Batch 1.5, then Batch 2 activation

Founder scope: [Issue #898](https://github.com/Xroga/xroga.com/issues/898),
October 31, 2026. Activation is not complete. No production mutation, model call,
paid resource creation or Cloud Shell session has occurred in this continuation.

## Current verified production boundary

At 07:52 UTC, `xroga-api-batch1-85f-serving-1031` had default traffic 100%.
API and `xroga-canonical-production` Job matched digest
`sha256:bbade2872d2468188f951c8e9fdaf4b447f52d2b7544a773e243d6a4b4a49a80`,
source `85f83e3f1dcbb057d4a28d8a696dae8396d45114`. The queue was RUNNING.
The production admission fence still permits only that source. Preserve it.
`live-runtime-preflight.json` records native readiness and identity.

Microphone routing has advanced independently: the `voice-9f62bba5` tag points
to `xroga-api-voice-fe2c6486c`. The exact voice rule in `xroga-api-url-map` and
the frontend must remain untouched. This branch starts at current main
`b86a037700631ab3a237da5c5d7da4f6034afd5d`. It is not itself an approved
production API or frontend release source.

The hosted production migration ledger already includes Drive foundation,
browser runs and all four Builder expansions. Relevant tables have RLS enabled,
browser/lease/storage tables deny anon and authenticated SELECT, and Builder
tables permit authenticated SELECT subject to their existing owner policies.
This catalog check is not a fresh two-user live RLS acceptance test. Do not
replay the historical seven migration files merely because identifiers differ.

## Resource reuse and exact blockers

`resource-inventory.json` shows no Compute instances, an existing
`xroga-browser-runs` queue and an existing PAUSED `xroga-browser-recover`
scheduler. Reuse those resources when their configuration passes review.
No configured browser URL is present in the serving revision's explicit
environment. Protected configuration payloads have not been exported.

The old standalone `scripts/browser/browser-coordinator.mts` does exist and
uses the accepted coordinator and hardened container worker. Its mutable local
probe tags and immediate process exit are not a production packaging contract.
The new compiled `browserCoordinatorHost.ts` reuses those same components,
requires immutable images and a dedicated role, refuses privileged API/model/DB
credentials, bounds concurrency to 1 or 2 and binds only loopback or an explicit
private IPv4 address. Full Chromium remains selected for Stagehand extensions.
The historical harness remains available and is labelled accordingly.

An actual negative test proved that a fresh HMAC-signed job carrying an expired
lease reached the worker. The coordinator now refuses expired/missing expiry
and nonpositive fencing tokens before container dispatch. It retains the same
request authentication, tenant job parser and protocol. Three unchanged
outbound call sites in that file need only new source/evidence hashes, not new
authority or broader caller dispositions.

The host still needs a separately approved Google deployment and live sandbox,
network, cancellation, recovery and two-process verification. It must hold no
database, user or model credential. Do not enable browser UI before acceptance.
There is no safe in-process API or hosted-browser fallback.

The existing `xroga-api-universal-staging` service is a separate staging release
with another identity and multiple historical tags. Do not overwrite it without
checking ownership. The existing synthetic Supabase staging project is
`dqxnatoessviphudbhei`. Confirm schema and isolation before use. No new paid
Supabase branch or project is necessary merely to start preparation.

## Local verification

`LOCAL-VERIFICATION.json` preserves red/green job references and log hashes.
The focused coordinator, protocol and durable-run suite passed 28 tests with no
skips. Container protocol/host tests also passed. They use real loopback HTTP
with deterministic worker ports, not real Google Chromium execution.

An attempted backend type check used an existing shared dependency install
and failed because development declarations, including `@types/express`, are
missing there. No new host-file error was emitted. This is not a type-check
PASS. Required exact-source CI must install the frozen dependencies and pass.
No shared installation was modified. The temporary dependency junction belongs
only to this worktree and must be removed after local checks without touching
its target or Claude's dependencies.

## Ordered continuation

1. Finish source/register integrity and exact-source CI for this bounded host
   and lease correction. Fix genuine regressions without weakening the audit.
2. Prepare the exact isolated host verification package with immutable artifacts,
   minimal existing-resource reuse, specific IAM/secret/network actions, hard
   duration/resource limits, cost ceiling, rollback and cleanup. Obtain the
   specific approval before creating a paid host or granting new access.
3. Verify Drive and browser execution with synthetic data in isolation, including
   cross-tenant denial, quotas, durable claims, cancellation and recovery. Only
   then stage a source-paired Batch 1.5 API/Job release and a pinned frontend.
   Any new production SQL needs its own explicit approval.
4. Accept Batch 1.5 live before enabling Batch 2. Independently diagnose its two
   historical failures in source while infrastructure approval is pending:
   missing reliable provider usage, and stranded Builder slots/deliveries after
   terminal cancellation or process loss. Never release uncertain provider spend
   or fabricate usage to make generation pass.
5. Batch 2 requires bounded model-spend approval and disposable, action-approved
   provider accounts before its full live build/QA/GitHub/Supabase/Vercel journey.
   Reuse Batch 1 Preview evidence where unchanged, but do not count model-free
   infrastructure as a successful generated application.

Retained production host cost, any new IAM/secret access, public routing changes
and any customer/provider external write remain unapproved. The founder goal
authorizes the work, not bypassing these Issue #898 gates. Batch 3, Batch 4,
Composio and StackEndBox activation remain outside this assignment.
