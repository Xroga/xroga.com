# Xroga OS — Five upstream Composio projects (evaluation only)

**Scope:** Evaluation branch anchored to PR #985 head `6c9aaa5dc14552c6766b99478447a3bd5741c053`. No changes to app routing, credentials, authorization, scheduling, or deployed services. These are PINNED GIT SUBMODULE REFERENCES, not copied/compiled dependencies. The two MIT Composio skills already under `vendor/` were copied by PR #985.

## Upstream candidates

| Repository | Locked SHA | License / permission | Value | Reuse limit |
|---|---|---|---|---|
| [ComposioHQ/composio](https://github.com/ComposioHQ/composio) | `fdee7595166f` | MIT | SDK sessions, tool search, connected user auth, execution, triggers, supported API proxy | Reuse supported official SDK, not whole monorepo |
| [ComposioHQ/composio-mcp-plugin](https://github.com/ComposioHQ/composio-mcp-plugin) | `bbcb9ccce590` | MIT | Seven meta-tools, tool discovery skill, connected-app activity summary skill | Two exact skills already vendored by PR #985; compare before further copying |
| [ownpilot/OwnPilot](https://github.com/ownpilot/OwnPilot) | `eb4c27f29d4d` | MIT | Tool discovery, help, aliases, dispatcher, batch actions, plugin and workflow patterns | Extract only reviewed, compatible code; no default single-user identity |
| [shricodev/all-in-one-agent](https://github.com/shricodev/all-in-one-agent) | `f6c12d1bf3d1` | UNVERIFIED | In-chat OAuth, streaming tool activity, Next.js UI examples; in-memory conversation storage | Reference only; do not copy or distribute source without permission |
| [composio-temp/tool-router-agents](https://github.com/composio-temp/tool-router-agents) | `f76b98f325c2` | UNVERIFIED; ARCHIVED | Multi-app agent examples using older experimental Composio tool router | Historical reference only; do not copy or ship source without permission |

Submodule checkouts are isolated under `research/upstreams/composio-five/`. Do not import their code into the production app or include them in deployment artifacts by default. The branch is in a **public** repository, so do not add secrets, connected-account data or sensitive test results.

## What PR #985 already provides
- Exact copy of two MIT Composio skill files plus license and upstream provenance.
- Runtime hydration of deferred Composio action schemas for a bounded set of connected candidates.
- Pre-approval missing-input checks and a second check against fresh tool metadata before write dispatch.
- Existing account/tenant isolation and immutable approval permits are preserved.
- CI reported green for six checks at `6c9aaa5` as observed during review; real signed-in provider acceptance remains unverified.
- No native Composio multi_execute, proxy execution, remote workbench, or full skill runtime installation is added.

## Specific gaps / issues found in PR #985
1. **JSON Schema oneOf logic (confirmed):** `composioActionPreflight.ts` treats oneOf as anyOf; inputs matching multiple branches may pass. Add exact-one matching and tests.
2. **Partial schema validation (documented):** not a complete JSON Schema implementation. Invalid patterns/numeric bounds/conditionals and other constraints can pass. Do not present preflight as full validation.
3. **Fan-out metadata fragility (probable):** Promise.all across up to ten candidate metadata lookups can fail the entire preparation on one error. Evaluate bounded concurrency and isolated candidate failures, with strict security fail-closed.
4. **Missing-input workflow continuation (confirmed):** the run marks ACTION_INPUT_REQUIRED but the resume function rejects it. User must start a new workflow; earlier writes may already be committed. Add safe checkpoint continuation.
5. **Metadata round-trips:** selected action metadata may be fetched twice; measure latency, cache with short freshness/revalidation before dispatch.
6. **Complex multi-app planning not delivered:** existing explicit workflow splitter supports 2–4 steps and does not compile arbitrary dependency graphs.
7. **Batching / bulk / proxy not enabled:** `composioClient.ts` session configuration disables native multi-execute, remote workbench and proxy. These require risk gates, per-user account scope, cost and egress controls.
8. **No live E2E proof:** fixtures and CI passing do not show real Gmail→Google Sheets create/write/readback in signed-in Xroga Workspace.
9. **No new Workspace UI:** PR #985 does not add progressive execution/approval flow or a new live multi-app UI.
10. **License blockers:** Codev and Tool Router Agents lack a verified grant for source copying. Reference only.
11. **Production release path:** PR #985 remains open/draft targeting `codex/openui-production-integration-20261114`, not main. This evaluation branch is not production-ready.

## Recommended reuse (not implementation)
- **Composio official SDK:** supported version-pinned client and session contracts; compare with Xroga existing V3 session adapter.
- **Composio MCP plugin:** its two vendored skills can be registered only after skill validation, provenance and policy tests; never grant privileges based on skill text.
- **OwnPilot:** inspect `packages/gateway/src/tools/registry/meta-executors.ts`, `packages/gateway/src/plugins/composio.ts`, and `packages/gateway/src/services/composio-service.ts`. Adapt selected search, alias/help, execution and batching patterns; do not import its runtime, Hono routes, databases, default-user model or permission source of truth.
- **Codev:** study `lib/composio.ts`, `lib/agent.ts`, `components/activity-panel.tsx`, `hooks/use-chat.ts`. No direct source copy until licensing confirmed; never use its in-memory session storage in production.
- **Tool Router Agents:** study examples only for patterns and acceptance scenarios; archived/experimental APIs may be incompatible.

## Acceptance gates before any production promotion
1. Verify exact compatibility, licenses, dependencies, vulnerabilities and upstream SHA provenance.
2. Fix the confirmed oneOf defect and workflow continuation behavior; test new branch against existing suite.
3. Test each permitted action using the actual connected account, schema, scope, risk/approval and receipt requirements.
4. Run a test Gmail read → approved Google Sheet create/write → provider readback; ensure no duplicate write on retries.
5. Verify tenant isolation, multi-account selection, malicious tool metadata, token leakage and provider failure paths.
6. Benchmark token usage, cost, provider calls and task latency for sequential vs safe parallel connected-app reads.
7. Review feature branch and PR; **no automatic merge or deployment** from this evaluation catalog.

## Why not copy every file into Xroga?
Composio and OwnPilot are complete frameworks with separate orchestration/auth/runtime dependencies; wholesale imports duplicate Xroga's architecture. Codev and Tool Router Agents have unverified licenses. Submodules preserve exact upstream sources for evaluation without pretending they are installed, licensed for redistribution, or product-ready.

## In-branch code updates after the initial evaluation

The evaluation branch now includes:
- Fixed preflight `oneOf` matching and additional bounded validation for numeric ranges, maximum string lengths, array sizes, and object property counts. This is **not** a complete JSON Schema implementation.
- Resilient candidate schema lookups, preserving authorization and cancellation failures.
- The saved workflow clarification/resume UI without replaying already recorded steps.
- Bounded up-to-3 independent read operations through Xroga's existing `readBusinessData` and approval boundary.
- Expansion from 2–4 to 2–8 explicit connected-app steps; actions and dependent steps remain sequential and approval-gated.
- Focused TypeScript and regression checks, including read-wave planning tests.
- Derived source inventories regenerated by the existing `scripts/xroga/inventory.mjs` on the evaluation branch; this does not waive security evidence requirements.

### Remaining and safety boundaries
1. **Not delivered:** unrestricted action coverage, arbitrary natural-language DAG compiler, native Composio multi-execute, remote workbench, general API proxy, full workflow orchestration for independent writes, or a universal agent runtime.
2. **Not certified:** live connected-account Gmail → Google Sheets acceptance, external write and readback verification, production tenant safety, or deployment.
3. **Still requires review:** source-bound historical security review mapping and full baseline gates; do not rewrite or suppress these to obtain a green status.
4. **License restrictions:** the two unlicensed/archived projects stay reference-only. Exact OwnPilot files in `vendor/ownpilot/` are MIT-licensed but are not imported into the execution runtime.
5. **Scope of acceleration:** independent connected-app read **steps**, not simultaneous writes or unapproved account actions. The recorded result stream is preserved through existing workflow checkpoints.

Release state: **DRAFT; source improvements only; no production deployment.**

## Follow-up implementation notes (November 14)
- Source-linked requirement mappings were regenerated together with the repository inventory through a feature-branch-only generator; no accepted security proof was fabricated.
- Explicit dependent actions now receive a bounded union of relevant previous read evidence and the latest destination/action receipt when the user refers to earlier records.
- Existing approvals and per-account ownership still control external mutations.
- Integrated historical source-bound review mapping remains a separate mandatory security check; diagnostics were improved without disabling the check.
- Actual auth/provider integration and commercial action execution remain blocked until credentials and staging tests are available.

## Advanced connected-app execution additions — November 15

**Implemented on this evaluation branch (source-level, not live account verification):**

1. Bounded, validated explicit dependency edges (`dependsOnSteps`) in connected-app workflows. A step can reference at most three earlier results, with cycles/forward references, duplicates, and invalid source receipts rejected before execution.
2. Dependent **read** steps now pass exact bounded previous-step evidence into the existing connected-app read planner. This enables a read-back step to use an earlier created destination receipt rather than losing the identifier.
3. A server-side `executeApprovedComposioReadBatch` primitive supports two or three independent already-approved read actions concurrently. Each uses its own existing exact authority permit, discovered tool, connected account, egress policy, and completion receipt. Partial failures are returned per item, not silently retried. Internal Composio meta-tools, writes, destructive and opaque tools are explicitly excluded.
4. The branch's focused test workflow includes admission tests for the approved read batch, as well as workflow dependency and input-preflight tests. Backend and frontend TypeScript checks are included.

**Important boundaries:**

- The approved read-batch primitive is an internal backend capability and is **not wired to a user-facing batch approval flow**. It does not currently enable a native `COMPOSIO_MULTI_EXECUTE_TOOL` session.
- Xroga's session policy still disables raw multi-execute, API proxy and remote workbench. Composio calls these powerful but potentially consequential operations; they cannot be enabled without equivalent per-action permissions, account scoping, data-egress controls, budgeting, and appropriate auditing.
- The current workflow UI still uses individual confirmations. Independent read *preparation* may happen concurrently; this must not be confused with verified parallel provider reads unless individually approved.
- This branch is **not** a general arbitrary DAG scheduler and does not support parallel unapproved writes. It extends the existing canonical workflow engine only.
- The source-bound security review mismatch involving `backend/src/routes/phase1.ts` remains an independent mandatory merge gate. Any reconciliation requires a real security review, not replacement hashes without analysis.
- No live Gmail → Google Sheets provider write/readback, customer-account testing, or production deployment has been performed.

## Approved connected-app read-batch API (evaluated source, not live acceptance)

Endpoint: `POST /api/phase1/business-actions/confirmations/approved-reads/batch` (authenticated).

Request body:
```json
{
  "approveAll": true,
  "confirmations": [
    { "id": "<reviewed confirmation UUID>", "actionDigest": "<displayed SHA-256>", "accountReference": "<displayed account>" },
    { "id": "<second reviewed confirmation UUID>", "actionDigest": "<displayed SHA-256>", "accountReference": "<displayed account>" }
  ]
}
```

The endpoint requires 2–3 distinct, pending, unexpired, read-risk confirmations for the **same authenticated Xroga user**. It checks each exact account and plan digest, then refetches provider tool metadata for ALL operations before any dispatch. It invokes the existing `confirmBusinessAction` for each item in parallel. Every provider effect is tied to its own durable confirmation claim and receipt; partial outcomes are reported separately, with no silent retries.

**Not a generic Composio multi-execute endpoint.** Composio session configuration still disables native `COMPOSIO_MULTI_EXECUTE_TOOL`, authenticated raw proxy and remote workbench. The user-facing multi-confirmation review page and integrated per-run batch-preparation queue remain future work, so natural-language requests currently reach individual approval cards. Model-generated approval text cannot invoke this endpoint without an explicit authenticated `approveAll` request and exact reviewed digests/accounts.

Proof boundary: focused synthetic regression tests and TypeScript do not substitute for live connected account and human approval acceptance. Previous source-bound CI remains mandatory before merge.
