# XROGA OS — BATCH 4
## COMPLETE SHARED ENGINEERING ENGINE — THREE-PHASE IMPLEMENTATION

Codex, you are assigned **Batch 4: Complete Shared Live Development, Testing & Execution Engine**.

Repository: https://github.com/Xroga/xroga.com

The founder has attached the complete Batch 4 engineering specification.

**Read the entire attached document before beginning implementation.** It is the authoritative feature specification.

IMPORTANT: The document originally names Claude Code as the implementation owner. That assignment is superseded.

**You, Codex, own Batch 4. Claude independently owns Batch 3.**

## 1. Current project status

The founder has adopted a BUILD-FIRST strategy.

- Batch 1: Development and integration complete. Final closure PR #879 merged.
- Batch 1.5: Substantially built; production activation paused.
- Batch 2: Built and merged; production activation paused.
- Batch 3: Claude is actively developing and integrating it in draft PR #865.
- Batch 4: Your new assignment.

After all five batches are built, we will undertake their coordinated production integration, activation and real-world acceptance.

**Do not activate Batch 4 or any other unfinished batch in production.**

Your responsibility is to implement all Batch 4 source functionality, backend/frontend integrations, security controls, automated tests, recovery mechanisms and development-level verification.

## 2. Understand Batch 4's purpose

Batch 4 provides the **shared software-development execution engine** for Xroga.

It serves:

**Batch 2 — New projects**
Users request websites, applications, SaaS products and software builds.

**Batch 3 — Existing projects**
Users connect repositories, request modifications, repair bugs and extend software.

Both must reuse the same underlying execution, sandbox, testing, preview, verification and recovery mechanisms.

Do not create separate engineering engines for Batch 2 and Batch 3.

Preserve Xroga's existing:

- Canonical task graph and scheduler.
- Durable execution and Google worker infrastructure.
- Cline/SoftwareAgent.
- Authentication and authorization.
- Cost and budget ledger.
- Project source/revision storage.
- Sandbox providers.
- Existing preview system.
- Evidence and verification gates.
- GitHub, Supabase and Vercel integrations.
- Existing Xroga chat and workspace UI.

Reuse and extend existing implementations.

## 3. Divide Batch 4 into exactly THREE phases

These three phases cover all eight checkpoints (A–H) and every requirement from the attached specification.

Complete one phase's implementation and available engineering tests before progressing to the next.

Do not stop after each phase waiting for another founder instruction.

---

# PHASE 1 — CANONICAL EXECUTION, DURABILITY AND ISOLATED DEVELOPMENT

**Covers original checkpoints A, B and C.**

### A. Current-state integration audit

Inspect the actual current repository.

Read:

- Root and applicable nested `AGENTS.md` instructions.
- Current backend/frontend source.
- Existing execution architecture.
- Database migrations.
- Security and authorization contracts.
- Existing runtime and sandbox implementations.
- Current CI requirements.
- Batch 2 implementation.
- Claude's current Batch 3 PR #865.

Verify current `main` rather than relying on historical SHAs.

Create a concise ownership map for:

1. Canonical task/run state.
2. Queue and worker dispatch.
3. Checkpoints and recovery.
4. Project and source revisions.
5. Sandbox admission.
6. Process execution.
7. Preview management.
8. Test and repair execution.
9. Events and evidence.
10. Budget and resource limits.
11. Authorization and tenant isolation.

Identify functionality that is already implemented, incomplete, defective or genuinely missing.

Do not rebuild completed systems.

### B. Durable canonical execution

Implement or repair:

- Persistent engineering run identity.
- Correct tenant/project/task/run/attempt binding.
- Durable task admission before queue dispatch.
- Worker claims and leases.
- Generation-based fencing.
- Duplicate-delivery protection.
- Heartbeats and lease expiration.
- Safe retry scheduling.
- Checkpoint creation and restoration.
- Recovery after worker/process crashes.
- Outbox and dispatch reconciliation.
- Durable source-state preservation.
- Correct cancellation propagation.
- Idempotent reservation settlement.
- Honest blocked/failed/verified states.

Use the existing canonical scheduler and Google execution interfaces.

No parallel scheduler, Redis control plane, Temporal deployment or replacement orchestration architecture.

### C. Isolated workspace and sandbox lifecycle

Complete:

- Secure workspace allocation.
- Exact source-revision restoration.
- Project/source hash verification.
- Sandboxed command execution.
- Dependency/toolchain detection.
- Secure environment-variable handling.
- Bounded installation and build execution.
- Process creation and management.
- Resource limits and timeouts.
- Workspace snapshot persistence.
- Source/artifact durability.
- Provider failure classification.
- Workspace expiry and restoration.
- Orphan-resource detection.
- Cancellation cleanup.
- Sandbox ownership and isolation.

Use existing supported sandbox providers and Google infrastructure.

**Do not reintroduce retired Fly.io production infrastructure or provision new paid resources.**

### Phase 1 acceptance

Prove with deterministic local/integration tests that:

- Durable runs survive process restarts.
- Duplicate workers cannot overwrite newer attempts.
- Cancelled work cannot subsequently report verified.
- Saved source revisions survive workspace destruction.
- Cross-tenant access is denied.
- Workspaces and resources are cleaned up correctly.
- Persistence failure cannot produce false success.

Use process-level crash tests where feasible, not only mocked exceptions.

**Phase 1 ends only when its implementation and available verification pass.**

---

# PHASE 2 — LIVE PREVIEW, TESTING, DEBUGGING AND BOUNDED REPAIR

**Covers original checkpoints D and E.**

### A. Shared live development preview

Complete the existing preview architecture.

Required capabilities:

1. Correct development-server detection.
2. Supported framework/runtime identification.
3. Real process startup inside the selected sandbox.
4. Readiness and health checks.
5. Secure preview session creation.
6. Owner-authorized preview access.
7. Preview binding to the exact source revision.
8. Preview refresh after source changes.
9. Process crash detection.
10. Safe restart and expiry.
11. Preview cleanup.
12. Appropriate HTTP/WebSocket/HMR support.
13. Accurate preview error states.
14. Frontend preview controls and status.

An open port is not sufficient evidence of a healthy application.

A stale source revision must never be displayed as the verified current version.

Preview access must not expose Xroga's internal authentication cookies or other tenants' applications.

### B. Shared testing and validation

Implement one reusable testing system for supported new and existing projects.

Cover:

- Project and language detection.
- Dependency and lockfile verification.
- Type checking.
- Syntax validation.
- Build and compilation checks.
- Unit tests.
- API/integration tests.
- Local disposable database tests where applicable.
- Browser and responsive UI tests.
- Error and log collection.
- Actual test-result persistence.
- Artifact and screenshot handling.
- Source-SHA-bound verification.

Reuse existing Playwright and test facilities.

Do not introduce another independent test engine.

### C. Debugging and automatic repair

Finish the shared repair controller.

It must support:

- Failure classification.
- Relevant error/log extraction.
- Minimal source-context selection.
- Existing SoftwareAgent/Cline integration.
- Scoped repair attempts.
- Maximum attempt limits.
- Budget limits.
- Retesting after repairs.
- Regression checks.
- Failure evidence.
- Revisions and rollback.
- Correct PARTIAL/BLOCKED/FAILED outcomes.

**Build and test the repair-controller logic with deterministic scripted agents and fixtures. Do not make paid AI-model calls.**

The model router and Cline integration should be ready in source code, but real AI-powered working tests are deferred.

Never disable failing tests or weaken authorization to obtain a green result.

### D. Verification contracts

A task may report VERIFIED only when:

- Its required checks genuinely pass.
- Tested and delivered source revisions match.
- Required source/artifacts are durable.
- Security conditions pass.
- Runtime/preview evidence is real when applicable.
- No stale or cancelled worker claims success.
- External provider success is backed by an actual receipt if claimed.

Missing runtime or provider verification must be recorded honestly.

### Phase 2 acceptance

Pass the applicable local tests for:

- Preview readiness and failure.
- Source revision changes.
- Preview grant security.
- Browser QA fixtures.
- Test-command detection.
- Failed builds.
- Unsupported runtime classification.
- Bounded repair.
- Source/evidence integrity.
- Correct frontend states.

Real-model acceptance remains deferred until the final Xroga activation stage.

---

# PHASE 3 — CONCURRENCY, BUDGETS, USER EXPERIENCE AND FULL CERTIFICATION

**Covers original checkpoints F, G and H.**

### A. Parallel execution and fairness

Implement and test:

- Multiple independent projects executing concurrently.
- Same-project write serialization.
- Revision conflict detection.
- Per-user heavy-run limits.
- System-wide capacity limits.
- Queue priority/fairness.
- Bounded backpressure.
- Retry fairness.
- Resource-slot cleanup.
- Provider outage handling.
- Responsive lightweight chat during heavy work.

No tenant may access another tenant's code, process, browser session, credentials or logs.

Use the existing scheduler's capacity mechanisms.

### B. Budgets, quotas and cost controls

Complete accurate accounting for:

- AI-model usage.
- Sandbox compute.
- Browser testing resources.
- Persistent storage.
- Runtime allocations.
- Retries.
- Resource cleanup.
- Reservation and settlement.

Reuse the existing ledgers and extend only genuine missing categories.

Maintain Xroga's preferred user-facing allowance display as a percentage out of 100%, while preserving accurate internal resource accounting.

Do not invent cloud costs or guarantee capacity without measurements.

### C. Durable events and frontend integration

Complete the frontend/backend connection for:

- Real-time task progress.
- Persistent execution events.
- Ordered event replay.
- Browser refresh/reconnection.
- Concurrent task status.
- Project and revision context.
- Preview visibility.
- Test and error reports.
- Repair progress.
- Cancellation controls.
- Retry/resume controls.
- Resource-limit messages.
- Accessible responsive UI.

The user should have one conversation and workspace.

Heavy engineering tasks must not prevent ordinary chat.

No fake progress animations, fabricated completion percentages, placeholder preview URLs or nonfunctional controls.

### D. Observability and operations

Complete:

- Run/task/attempt correlation.
- Redacted execution logs.
- Failure classification.
- Sandbox and preview diagnostics.
- Lease and queue diagnostics.
- Resource usage evidence.
- Cleanup receipts.
- Safe trace/artifact retention.
- Operator-only diagnostics where needed.
- Secure evidence retrieval.
- Source revision and test receipt consistency.

Reuse existing traces/evidence systems.

No new paid monitoring subscription.

### E. Security and adversarial verification

Cover:

- Cross-tenant access.
- Credentials and secret exfiltration.
- Prompt injection.
- Unsafe repository instructions.
- SSRF and internal-network access.
- Preview origin/cookie isolation.
- Untrusted package scripts.
- Duplicate worker delivery.
- Stale leases.
- Cancellation races.
- Provider ambiguity.
- Database and object-store failures.
- Concurrency conflicts.
- Source-hash mismatches.
- Missing or unsupported toolchains.
- Orphan-resource cleanup.

Security tests must have positive controls. A system that simply refuses all legitimate work is not accepted.

### F. Golden acceptance scenarios A–V

The original Batch 4 specification defines **22 Golden acceptance scenarios**.

Preserve every one.

Implement their applicable deterministic and isolated test fixtures.

Test both:

- Representative Batch 2 new-project workflows.
- Representative Batch 3 existing-project workflows.

Both must use the same shared engineering contracts.

Since Claude is still developing Batch 3, use compatible shared interfaces and local fixtures where necessary.

Do not copy incomplete Batch 3 work into another competing implementation.

For each scenario record:

- Test ID.
- Exact source SHA.
- Environment.
- Test type.
- Result.
- Evidence.
- Security assertions.
- Known limitations.
- PASS/PARTIAL/BLOCKED/FAILED/NOT_RUN.

**Do not falsely mark live-provider scenarios passed through mocks.**

### Phase 3 acceptance

Run:

- Relevant backend/frontend unit suites.
- Integration tests.
- Schema/security checks.
- Process restart and recovery tests.
- Concurrency tests.
- Sandbox and preview tests available locally.
- Deterministic QA/repair tests.
- Existing repository regression gates.
- Exact-source CI.
- Reviewable PR verification.

Produce the full Golden A–V matrix and a final development acceptance report.

---

# 4. Mandatory coordination with Claude

Claude is concurrently developing Batch 3 in draft PR #865.

The latest reported Batch 3 work touches shared Google worker, canonical execution and model-adapter interfaces.

You must:

1. Inspect the latest PR #865 before editing overlapping files.
2. Identify specific shared interfaces likely to conflict.
3. Keep Batch 4 development isolated on its own branch.
4. Preserve Claude's existing changes and accepted contracts.
5. Avoid overwriting, cherry-picking or merging Claude's unfinished work blindly.
6. Develop compatible shared interfaces or adapters.
7. Communicate exact required compatibility changes if necessary.
8. Reconcile final integration against verified source once both development streams are ready.

Do not restart Batch 3 or take over its feature-specific scope.

Do not reopen completed Batch 1 security work unless a real regression requires correction.

## 5. BUILD-FIRST — STRICT PRODUCTION HOLD

The founder explicitly prohibits production activation during Batch 4.

Therefore:

**Allowed**

- Source development.
- Backend/frontend changes.
- Safe additive migrations committed to source.
- Local disposable databases.
- Local isolated development fixtures.
- Deterministic testing.
- CI.
- Security and regression testing.
- Review branches and PRs.
- Documentation and implementation evidence.

**Not authorized**

- Production deployments.
- Production migrations.
- Production feature-flag activation.
- Live Xroga customer-style task execution.
- Paid AI-model tests.
- New OpenRouter/Moonshot/API spending.
- New always-on VMs.
- New paid cloud resources or subscriptions.
- Production traffic changes.
- Production customer-data mutations.
- Unapproved external publication.
- DNS/domain changes.

Do not require real-model API keys to finish development.

Where a real provider or model is required for final certification, mark its status **DEFERRED BY FOUNDER** and preserve the corresponding acceptance test for the later activation stage.

Do not call the functionality production-verified until it actually is.

## 6. Engineering workflow

Use normal engineering autonomy for safe implementation.

1. Inspect actual source.
2. Establish baseline.
3. Create your Batch 4 development branch.
4. Implement Phase 1.
5. Test and checkpoint Phase 1.
6. Implement Phase 2.
7. Test and checkpoint Phase 2.
8. Implement Phase 3.
9. Test and checkpoint Phase 3.
10. Complete cross-phase security and integration checks.
11. Run final exact-source CI.
12. Push reviewable PRs.
13. Deliver complete acceptance evidence.

Use separate PRs if needed for reviewability, with explicit dependency and merge order.

**Do not merge protected branches or deploy production.**

Do not stop after writing plans or architecture documents. Actual working source code is required.

Don't waste time repeatedly rerunning already-proven unchanged tests. Rerun affected tests and final-source gates whenever required.

## 7. Final deliverables

Your final report must include:

1. Batch 4 implementation summary.
2. Phase 1 PASS/PARTIAL/BLOCKED matrix.
3. Phase 2 PASS/PARTIAL/BLOCKED matrix.
4. Phase 3 PASS/PARTIAL/BLOCKED matrix.
5. All original eight checkpoint outcomes.
6. Golden acceptance A–V results.
7. Actual backend/frontend changes.
8. Existing architecture reused.
9. Security and adversarial test evidence.
10. Crash-recovery/concurrency evidence.
11. CI status and exact commits.
12. PR links and merge dependencies.
13. Deferred real-model/provider acceptance.
14. Known bugs and remaining genuine development gaps.
15. Future activation prerequisites and rollback strategy.

Report development completion honestly, separately from production activation.

## 8. Execution instruction

**START BATCH 4 DEVELOPMENT NOW.**

Work through all three phases automatically.

Do not ask for repeated phase approvals, model API keys or additional paid infrastructure.

Preserve all completed Xroga work.

Finish the source-level engineering mission thoroughly and produce a verified, reviewable Batch 4 development release candidate.

Our objective is to complete Xroga's entire Batch 1–4 codebase first, then begin the coordinated activation and real-world verification of the complete Xroga OS.