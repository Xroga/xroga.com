# Current source call paths

Audited application base: `3b2bad21561e8abcb9a4a3bd0e98a7241d0efc3d`. Inventory tooling is added by Command 001. These paths are source evidence, not live execution certification. `current-state.json` supplies the per-file hashes, imports, callers, mount chains, boundaries, and test references.

## 1. Authenticated conversation

`frontend/src/context/TerminalChatContext.tsx` → `frontend/src/lib/api.ts` (`api.phase1.plan`, `api.phase1.chat`) → `backend/src/index.ts` (`/api/phase1`) → `backend/src/middleware/phase1Auth.ts` → `backend/src/middleware/auth.ts` / `backend/src/lib/resolveIdentity.ts` → `backend/src/routes/phase1.ts` (`/plan`, `/chat`).

The normal phase1 conversation uses a request/response path. Workspace builds use the separate existing SSE path below. Do not claim that every chat turn already streams. Auth derives `req.userId`; some error responses currently disclose internal configuration/error wording and need later hardening. Global admin access is a separate middleware boundary; a visible/hidden link does not authorize it.

## 2. Goal and plan creation

`backend/src/routes/phase1.ts` (`/plan`) → `backend/src/ai/universal/semanticRequestPlanner.ts` (`planSemanticRequest`, structured goal resolution, dispatch/coherence checks) → existing provider routing/structured output/quota/reservation helpers. Inspect the selected contract and scope before consequential action. A plan or model sentence is not execution evidence.

## 3. Workspace execution and recovery

`TerminalChatContext.tsx` → `streamSwarmExecute` in `frontend/src/lib/api.ts` → `/api/swarm/execute` mounted through `authMiddleware` → `backend/src/routes/swarm.ts` → `backend/src/ai/pipeline.ts` (`runBuildPipeline`) → `backend/src/synthesis/foundation.ts` (`runUniversalSynthesisFoundation`) and capability-specific adapters, including `backend/src/synthesis/softwareAgentImplementationAdapter.ts` → existing software-agent runtime/checkpoint and sandbox providers.

`backend/src/ai/runStore.ts` records states/events/conversations; route reconnect/history/cancellation and `backend/src/ai/runReconciler.ts` manage durable run evidence and stale leases. `backend/src/index.ts` calls reconciliation at startup and fails owned in-flight runs on shutdown. Some checkpoint/storage fallbacks are in memory; do not assume restart durability merely because a checkpoint interface exists.

`backend/src/ai/taskGraphRunner.ts` defines graph runners, but the initial source audit found no production call to those exports. It is a candidate for further call-path review, not a justified replacement target. Integration must follow the actually active pipeline rather than create another orchestrator.

## 4. Connected business action

Authenticated phase1 chat → `prepareBusinessAction` / `executePreparedBusinessAction` in `backend/src/services/integrations/businessAction.ts` → tool/account/session validation and plugin permission policy → `backend/src/services/integrations/composioClient.ts` → provider execution/result. `backend/src/services/integrations/businessActionConfirmations.ts` and `backend/src/routes/phase1BusinessPreflight.ts` provide stored confirmation handling. Existing digest and explicit-authorization concepts must be preserved and compared with Operations approvals in Command 008.

The direct `/api/integrations/xroga-connect/execute` route is currently a read-tool boundary. Trace every other mutating adapter before claiming canonical authority covers all writes. Tool metadata and returned content are data, not approval.

## 5. File persistence

Media/AI callers → `backend/src/services/storage/projectFiles.ts` → `backend/src/lib/r2.ts` for object storage plus Supabase `project_files` metadata. `storeProjectFile` can fall back to a data URL; `storeUserFile` can fall back to `localMediaCache.ts`, then a data URL. `readStoredFile` tries R2 and local cache. These paths need ownership and durability tests; a returned URL does not prove durable private storage.

Repository engineering also persists canonical project/run/checkpoint data through the existing synthesis/software-agent paths. Enumerate these separately from media storage so Drive/AI-budget/storage claims are not conflated.

## 6. Billing webhook

`backend/src/index.ts` mounts `/api/billing/webhook` before the general JSON parser → `backend/src/routes/billingWebhook.ts` (`/whop`, raw body) → `verifyWhopWebhookSignature` in `backend/src/services/BillingService.ts` → delivery ID + payload digest claim in `webhook_deliveries` → `BillingService.handleWebhookEvent` → recorded completed/failed receipt. Signature, replay/conflicting-digest, retry, and tenant/payment ownership tests are necessary. Retired Lemon Squeezy/Paddle endpoints return 410. No payment behavior is changed by this inventory.

## 7. Publishing

Authenticated `/api/publish` → `backend/src/routes/publish.ts` → existing `userOwnedPublish.ts`, `easPublish.ts`, `easCredentials.ts`, `chromeWebStore.ts`, and `electronSecrets.ts`; repository/web deployment adapters also live under integrations and `nonWebShip.ts`. The inventory includes every tracked publish module and route. Token availability, a triggered build, QA, submission, and confirmed provider status are distinct facts. Paid publishing tests must be isolated and must not charge/submit in normal CI.

## 8. Frontend result and event rendering

Existing `frontend/src/lib/api.ts` transport → `TerminalChatContext.tsx` → response/document adaptation (`frontend/src/lib/xrogaResponseDocument.ts`, `xrogaOutputAdapters.ts`) → `frontend/src/components/terminal/SwarmMessageLog.tsx` → `XrogaBlockView.tsx`, structured/rich result renderers and canonical `xrogaBlocks.ts` validation. `frontend/src/lib/xrogaEvent.ts` defines source-neutral event contracts; existing event adapters preserve the transport. Web-source cards use the existing rich-result adapter, not invented offer data.

Historical output restoration, citations, artifacts, and SSE remain distinct boundaries. Import reachability and renderer registration do not prove every streamed or restored payload is valid; existing fixture/unit/browser tests provide the next evidence.

## Registration caveats

- Retired route modules export an invoked `createRetiredRouter` factory. The inventory traces that factory's catch-all middleware through each actual mount.
- Router middleware, public guest routes, signature-authenticated webhooks, optional auth, admin auth, and signed runtime-preview hosts are different boundaries. The JSON retains registration/mount evidence instead of claiming every path has the same protection.
- Four BullMQ queues exist; no `Worker` consumer was found in application source. Queue names alone are not proof of a scheduler or durable execution service.
- Dynamic dispatch, generated code templates, server bootstrap schema helpers, and external worker registration require separate evidence. No unknown path is treated as verified operational success.
