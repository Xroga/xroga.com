# Xroga repository truth map

Source SHA: `87e33b94b3d85deaac12d4bcc691363f4876fa64`. Branch observed: `codex/xroga-phase4-prep-20261023`. Audit started: 2026-10-27T14:19:38.849Z.

This inventory records static source and call-path evidence. A mounted endpoint is reachable in source; that does not certify live success, tenant safety, approval enforcement, or completion. All implementation surfaces retain an unverified/partial/placeholder state until their own acceptance tests establish behavior. No architecture was replaced and no production operations were performed.

## Counts

- surfaces: 1637
- routeRegistrations: 296
- routes: 246
- reachableRoutes: 235
- queues: 4
- migrations: 148
- workflows: 20
- testSuites: 916
- declaredTests: 6079
- classifiedMarkers: 384
- reachableMarkers: 324
- absentRequiredPaths: 5
- duplicateIds: 0

## Required paths

| Path | Presence | Classification |
| --- | --- | --- |
| AGENTS.md | PRESENT | INSPECTED_CONFIGURATION_OR_DOCUMENT |
| README.md | PRESENT | INSPECTED_CONFIGURATION_OR_DOCUMENT |
| CONTRIBUTING.md | PRESENT | INSPECTED_CONFIGURATION_OR_DOCUMENT |
| DEPLOY.md | PRESENT | INSPECTED_CONFIGURATION_OR_DOCUMENT |
| ROUTING.md | PRESENT | INSPECTED_CONFIGURATION_OR_DOCUMENT |
| SECURITY.md | PRESENT | INSPECTED_CONFIGURATION_OR_DOCUMENT |
| SHIP_COMPLETENESS.md | PRESENT | INSPECTED_CONFIGURATION_OR_DOCUMENT |
| OWNER_SETUP.md | PRESENT | INSPECTED_CONFIGURATION_OR_DOCUMENT |
| package.json | PRESENT | INSPECTED_CONFIGURATION_OR_DOCUMENT |
| backend/package.json | PRESENT | INSPECTED_CONFIGURATION_OR_DOCUMENT |
| frontend/package.json | PRESENT | INSPECTED_CONFIGURATION_OR_DOCUMENT |
| Dockerfile.api | PRESENT | INSPECTED_CONFIGURATION_OR_DOCUMENT |
| Dockerfile.browser | ABSENT | UNKNOWN_BLOCKED |
| fly.api.toml | PRESENT | INSPECTED_CONFIGURATION_OR_DOCUMENT |
| fly.browser.toml | ABSENT | UNKNOWN_BLOCKED |
| cloudbuild-run-job.yaml | ABSENT | UNKNOWN_BLOCKED |
| cloudbuild-browser-worker.yaml | ABSENT | UNKNOWN_BLOCKED |
| vercel.json | PRESENT | INSPECTED_CONFIGURATION_OR_DOCUMENT |
| .vercel/project.json | ABSENT | UNKNOWN_BLOCKED |
| backend/src/index.ts | PRESENT | IMPLEMENTED_BUT_UNVERIFIED |
| backend/src/middleware/auth.ts | PRESENT | IMPLEMENTED_BUT_UNVERIFIED |
| backend/src/middleware/phase1Auth.ts | PRESENT | IMPLEMENTED_BUT_UNVERIFIED |
| backend/src/config/supabase.ts | PRESENT | IMPLEMENTED_BUT_UNVERIFIED |
| backend/src/config/jobQueues.ts | PRESENT | IMPLEMENTED_BUT_UNVERIFIED |
| backend/src/ai/taskGraphRunner.ts | PRESENT | DEAD_OR_UNREACHABLE |
| backend/src/ai/runReconciler.ts | PRESENT | IMPLEMENTED_BUT_UNVERIFIED |
| backend/src/ai/universal/semanticRequestPlanner.ts | PRESENT | IMPLEMENTED_BUT_UNVERIFIED |
| backend/src/services/integrations/composioClient.ts | PRESENT | IMPLEMENTED_BUT_UNVERIFIED |
| backend/src/services/integrations/businessAction.ts | PRESENT | IMPLEMENTED_BUT_UNVERIFIED |
| backend/src/services/integrations/pluginPermissionPolicy.ts | PRESENT | IMPLEMENTED_BUT_UNVERIFIED |
| backend/src/services/integrations/oauthPkceStore.ts | PRESENT | IMPLEMENTED_BUT_UNVERIFIED |
| backend/src/services/storage/projectFiles.ts | PRESENT | IMPLEMENTED_BUT_UNVERIFIED |
| backend/src/routes/billingWebhook.ts | PRESENT | IMPLEMENTED_BUT_UNVERIFIED |
| backend/src/services/publish/easCredentials.ts | PRESENT | IMPLEMENTED_BUT_UNVERIFIED |
| frontend/src/lib/xrogaBlocks.ts | PRESENT | IMPLEMENTED_BUT_UNVERIFIED |
| frontend/src/lib/xrogaRichResults.ts | PRESENT | IMPLEMENTED_BUT_UNVERIFIED |
| frontend/src/lib/xrogaEvent.ts | PRESENT | DEAD_OR_UNREACHABLE |
| frontend/src/app/(shell)/dashboard/automations/page.tsx | PRESENT | IMPLEMENTED_BUT_UNVERIFIED |
| frontend/src/app/(shell)/dashboard/library/page.tsx | PRESENT | IMPLEMENTED_BUT_UNVERIFIED |

## Queue processing

- **email-jobs**: NO_PRODUCER_FOUND; NO_CONSUMER_FOUND. Definitions: backend/src/config/jobQueues.ts:36. Queue definition is not proof of active processing; no Worker consumer found in inspected source.
- **notifications**: PRODUCER_CODE_PRESENT; caller activation must be verified; NO_CONSUMER_FOUND. Definitions: backend/src/config/jobQueues.ts:18. Queue definition is not proof of active processing; no Worker consumer found in inspected source.
- **swarm-tasks**: NO_PRODUCER_FOUND; NO_CONSUMER_FOUND. Definitions: backend/src/config/redis.ts:22. Queue definition is not proof of active processing; no Worker consumer found in inspected source.
- **token-distribution**: PRODUCER_CODE_PRESENT; caller activation must be verified; NO_CONSUMER_FOUND. Definitions: backend/src/config/jobQueues.ts:27. Queue definition is not proof of active processing; no Worker consumer found in inspected source.

## Review candidates

- **execution_control_planes**: backend/src/ai/softwareAgent/SoftwareAgentRuntime.ts, backend/src/ai/taskGraphRunner.ts, backend/src/lib/adaptiveOrchestrator.ts, backend/src/operations/operationsEngine.ts. Multiple related boundaries exist. This is a review candidate, not a conclusion that implementations are redundant; compare callers, authority, durability and evidence before changing architecture.
- **approval_contracts**: backend/src/capabilities/modules/businessAction.ts, backend/src/operations/operationsEngine.ts, backend/src/operations/permissions.ts, backend/src/services/integrations/businessAction.ts, backend/src/services/integrations/businessActionConfirmations.ts. Multiple related boundaries exist. This is a review candidate, not a conclusion that implementations are redundant; compare callers, authority, durability and evidence before changing architecture.
- **cost_accounting**: backend/src/ai/providerBudget.ts, backend/src/ai/quota.ts, backend/src/ai/universal/costLedger.ts, backend/src/services/BillingService.ts. Multiple related boundaries exist. This is a review candidate, not a conclusion that implementations are redundant; compare callers, authority, durability and evidence before changing architecture.
- **credential_persistence**: backend/src/services/integrations/githubTokenStore.ts, backend/src/services/integrations/oauthPkceStore.ts, backend/src/services/publish/chromeWebStore.ts, backend/src/services/publish/easCredentials.ts, backend/src/services/publish/electronSecrets.ts, frontend/src/components/integrations/CustomCredentialsSection.tsx. Multiple related boundaries exist. This is a review candidate, not a conclusion that implementations are redundant; compare callers, authority, durability and evidence before changing architecture.
- **browser_execution**: backend/src/lib/browserbase.ts, backend/src/middleware/runtimePreviewGateway.ts, backend/src/sandbox/flyMachineSandbox.ts, backend/src/sandbox/remoteSandbox.ts, backend/src/synthesis/browserVerificationAdapter.ts. Multiple related boundaries exist. This is a review candidate, not a conclusion that implementations are redundant; compare callers, authority, durability and evidence before changing architecture.
- **completion_semantics**: backend/src/ai/measuredEvidence.ts, backend/src/ai/softwareAgent/completionGate.ts, backend/src/ai/verificationLifecycle.ts, backend/src/operations/completionGate.ts, backend/src/synthesis/webVerificationGate.ts, frontend/src/lib/verificationLifecycle.ts. Multiple related boundaries exist. This is a review candidate, not a conclusion that implementations are redundant; compare callers, authority, durability and evidence before changing architecture.

## Reproduction

`node scripts/xroga/inventory.mjs` generates the JSON, schema and summary from tracked source. `--check` validates the canonical schema, registered IDs, required paths, all registrations and source/config drift without writing. `--refresh` updates the audit identity for a deliberately re-audited HEAD. Run `node --test scripts/xroga/inventory.test.mjs` for positive and adversarial fixtures.

The JSON includes every discovered registration, source module, scheduler, migration, workflow, queue, frontend API call, test suite, focused/skipped test call, and marker location. Markers are recorded without source payloads and classified for review; a comment is not proof that a feature is simulated. Import reachability is conservative and does not treat type-only imports as executable calls.

## Limitations and next evidence

- Computed route paths, runtime registrations, Docker/worker commands and dynamic nonliteral imports require explicit manual reconciliation.
- No production credentials or customer data were read; live behavior remains unverified in this command.
- Static imports do not prove provider availability or authorization correctness.
- Unresolved local import scripts/render-software-art.mjs:17 -> ../node_modules/playwright/index.mjs
