# Activation continuation after founder authority

Founder instruction: complete Batch 1.5 and Batch 2 end to end. Preserve the specific model and infrastructure spending controls until an exact amendment is approved.

## Fresh read-only production observations

- Google API remains Ready, 100% default traffic to `xroga-api-b15b2-ac8168-serving-1031`.
- Both prior voice tags remain unchanged: `voice-054d7ae4` and `voice-9f62bba5`, the latter points to `xroga-api-voice-fe2c6486c`.
- `xroga-canonical-production` queue is RUNNING. Its Job retains digest `sha256:7b3551559fa0585c2efb422397163fc796dd0e287b9f833936df98046944d549` in the existing standard registry.
- Compute Engine instance list is empty. There is no existing VM host available to reuse for Browser Worker.
- Initial gcloud checks failed to resolve `oauth2.googleapis.com` through the laptop resolver. A read-only process-local fallback resolved Google API hosts through Google's HTTPS DNS endpoint and left certificate/hostname validation enabled. It made no system DNS, IAM, cloud resource or production configuration changes. No token was printed or written to evidence.

## Focused source correction

PR 903, source `d338b37c269dbf29693d5656b9cf0c8f53c31c2a`, fixes a demonstrated terminal-state persistence problem. Builder previously marked a binding closed before its database write succeeded. Failed writes could never be retried. Concurrent callers now await the same write, and failed finalization remains retryable. Owner/run predicates remain unchanged.

Three regressions failed before repair. Fifteen focused tests passed after repair. Strict egress audit: 150 total, 150 reviewed, zero pending, zero unresolved high-risk. Caller rows and review packets were asserted unchanged before refreshing the source digest. Mission policy and inventory integrity passed locally.

The first CI source passed build but exposed generated-inventory drift and a disposable database test setup deadlock. The follow-up refreshes inventory and runs the two schema-reapplying ledger suites serially. Their internal concurrent worker and SIGKILL tests remain intact. Exact-source CI on the follow-up is pending. No merge or release is claimed.

Local full typecheck was blocked by missing types in the shared dependency installation. New test callback types were corrected. Clean CI, not that local failure, must establish the final build result. This change alone does not establish complete process-loss recovery.

## Remaining execution boundaries

The existing Operations provider-budget RPC only accepts `run_model_benchmark`, with real actor, lease and separate-approver authority. It must not be repurposed by fabricating an Operations action for Builder.

The existing production test account has a free-cycle entitlement of $1.65, with expiry safely after the proposed bounded test. Its remaining capacity is above the current $0.10 approval. The specific `BUILDER-EXISTING-CYCLE-TEST-AMENDMENT.md` proposes one test capped by the existing $1.65 cycle instead, avoiding budget-schema changes. Owner decision is pending. No model request was sent and no balance or reservation was modified.

Browser Worker still requires a retained isolated host and its scoped identity/signing-secret configuration. The prior temporary host package does not authorize a permanent deployment. Do not count an unprovisioned host as LIVE or let this stop independent Builder verification.

Production mutations: none. New cloud resources: none. Model use: $0. Actual CI billing is not measured. Batch 1.5 and Batch 2 full live acceptance remain unproven.
