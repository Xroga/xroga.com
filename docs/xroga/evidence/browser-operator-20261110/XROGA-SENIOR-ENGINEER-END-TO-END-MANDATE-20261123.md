# XROGA BROWSER OPERATOR
# SENIOR ENGINEER / TECHNICAL OWNER — END-TO-END COMPLETION MANDATE

**Date:** 23 November 2026  
**Product:** Xroga Browser Operator / Xroga Chrome Extension  
**Repository:** https://github.com/Xroga/xroga.com  
**Primary development branch:** claude/ops-integrated-20261112  
**Primary integration PR:** https://github.com/Xroga/xroga.com/pull/976  
**Related permission fix:** https://github.com/Xroga/xroga.com/pull/997  
**Last independently checked PR #976 head:** 223ec865bf5b9188b97f48b714aa4298b66c2662 (verify again before editing)  
**Latest evidence:** docs/xroga/evidence/browser-operator-20261110/OVERNIGHT-REPORT-20261122.md, Rounds 13–20 and later addenda  
**Competitive study:** docs/xroga/evidence/browser-operator-20261110/COMPETITOR-METHODS-20261122.md

---

# 0. THIS IS A TECHNICAL OWNERSHIP AND EXECUTION DIRECTIVE

Claude, act as the **senior engineer and technical owner of Xroga Browser Operator across the entire stack**.

You own the integration and quality of:

- Product and system architecture.
- Chrome Manifest V3 extension and browser runtime.
- Browser control, Chrome debugger/CDP, DOM, accessibility and visual interaction.
- Agent loop, task planning, tools and orchestration.
- DeepSeek/LLM integration, model routing and inference policy.
- Skills, tool discovery, connectors and MCP boundaries.
- Backend services, APIs, identity, permissions and leases.
- Database schemas, migrations, durability and recovery.
- Frontend, side panel and Xroga Workspace integration.
- Multi-tab, multi-worker and multi-agent execution.
- Files, downloads, uploads, documents and media.
- Infrastructure, staging, CI/CD and release engineering.
- Security, privacy, permissions, cost and auditability.
- QA, fixtures, real-browser acceptance and performance.
- Product UX, technical documentation and release handover.

You are not only an extension developer. You are accountable for the backend, AI orchestration, data layer, browser runtime, user experience, integrations, infrastructure and release quality needed to make the product work end to end.

**The founder has already supplied extensive product direction, competitor recordings, requirements, repository access, engineering reports, open-source research, fixtures and broad authorization to work in the development and browser-testing environments made available to you.**

Take action according to that context. Do not repeatedly ask the founder to identify the next file, next bug, next test or obvious engineering step. Use your own technical judgment.

**This is not another research assignment or planning-only request. It is an instruction to complete the product through actual source changes, integration, tests, diagnosis and release preparation.**

## 0.1 Founder authorization and operating boundaries

The founder authorizes you to use the existing repository, development branch, available tools, authorized Chrome sessions, staging environments, test accounts, disposable test data, logs and provisioned resources made available for this work.

You may independently perform ordinary engineering and testing actions: inspect authorized pages and tabs, run commands and tests in the authorized development environment, create disposable fixtures, restart disposable test processes, inspect logs, benchmark, modify source, update tests, commit and push work to the established development branch.

Do not repeatedly interrupt the founder for routine engineering decisions or browser inspection. If one item genuinely requires an unavailable account, independent reviewer, human-held verification code, new paid resource, public release approval or other external authority, state that precise dependency and continue all independent work.

Preserve security and authorization. Broad development authority does not authorize you to expose secrets, use unrelated accounts, bypass authentication or platform protections, incur unapproved new charges, send real external messages, delete valuable records, publish publicly, launch paid campaigns, change production traffic or self-approve an independent security review. Keep passwords, OTPs, payment authentication and private credentials under the legitimate account owner's control. Prefer drafts, sandboxes, reversible changes and test data.

The founder does not want task quality degraded by arbitrary tiny internal model-call limits when authorized resources are sufficient. Optimize for **cost per verified successful outcome**, not merely cost per model call. Do not bypass server budgets, provider quotas or usage settlement. Do not silently purchase new services or incur new charges. Use provisioned resources intelligently.

## 0.2 What “complete” means

A function existing in code is not enough. A prompt instruction is not enough. A passing unit test is not enough. A green replica test is not proof of a real service. A successful click is not proof of a saved outcome.

Classify evidence precisely:

1. **Implemented:** code exists.
2. **Integrated:** the real extension/backend path invokes it.
3. **Unit verified:** component contract has tests.
4. **Chromium verified:** the built extension performs it in real Chrome against a controlled fixture.
5. **Real-model verified:** the configured DeepSeek route actually selects and uses the capability.
6. **Real-service verified:** an authorized real application/account confirms the outcome.
7. **Release verified:** source-matched artifact, compatible backend, CI/security checks, upgrade and rollback evidence exist.

Never promote evidence from one level to another.

A general-purpose product cannot honestly promise every imaginable action on every website. Some sites are inaccessible, controls are not exposed, services impose restrictions, and some tasks exceed a browser extension's technical boundary. The goal is the **broadest reliable, adaptive task coverage possible on technically accessible and authorized environments**. Do not impose an artificial website whitelist or a tiny fixed catalogue of workflows.

---

# 1. PRODUCT NORTH STAR — OUTCOME-DRIVEN UNIVERSAL EXECUTION

A user should be able to give a high-level objective and relevant context, then let Xroga determine the necessary work.

Examples include business setup, client research, CRM operations, advertising drafts, scheduling, email drafts, database administration, spreadsheet work, document processing, e-commerce operations, website configuration, software dashboards, visual editors, timeline tools, file operations, research and unfamiliar web applications. These are examples of demand, not product boundaries.

The system must not require the user to explain every click. It should understand the outcome, determine what a competent operator would need to do, inspect the actual environment, choose appropriate tools, execute intelligently, recover from errors and verify the final result.

## 1.1 Canonical execution cycle

Maintain one coherent architecture:

**Understand → Preflight → Discover → Plan → Execute → Observe → Verify → Recover/Continue → Deliver.**

- Understand the user's outcome, context, constraints and deliverables.
- Preflight the authorized user, Chrome profile, tabs, account, files and initial state.
- Discover genuinely available browser and connected capabilities.
- Build a concise outcome contract and dependency-aware plan.
- Execute using the fastest reliable authorized route.
- Observe actual page and application state.
- Verify the expected result and persistence where appropriate.
- Diagnose failures, change strategy, reconcile uncertain writes and continue.
- Deliver completed, verified, partial, waiting and blocked items truthfully.

Extend the existing task plan, RunLedger, action receipts and orchestration. Do not create a second scheduler, memory store, permission engine or task database when the existing one can be strengthened.

## 1.2 Adaptive preflight: inspect first, execute fast

The founder observed that Codex often inspects the task and interface for a short period, then rapidly executes a known sequence. Implement the useful principle without a rigid delay.

- A simple, unambiguous task should use a short path and begin immediately.
- An unfamiliar or complex task should receive bounded reconnaissance: identify page regions, fields, menus, current values, options, required data, platform guidance and success signals.
- Roughly 1–3 minutes of focused preparation can be justified for a complex task if it prevents later mistakes. This is a target observation, not a mandatory wait.
- Do not spend five or ten minutes reading broad documentation if a focused live page inspection resolves the question.
- Do not keep surveying unchanged pages.
- Once controls, dependencies and checks are understood, execute stable work in batches.
- Expand observations or read guidance again only when the interface changes or something is unclear.

Preflight must produce a usable plan and meaningful work. It must not become an endless thinking or documentation loop.

## 1.3 Professional inference without fabricated facts

The agent should identify reasonable steps the user did not know to request. Business presence setup may need category, description, services, contact routes, branding, customer response settings and verification. Advertising setup may need objective, audience, locations, placements, budget, schedule, creative, destination, measurement and saved state.

Every inference must be grounded in user context, authorized sources, live application state or an explicitly identified default. Never invent business facts, contact details, services, addresses, prices, certifications, customer records or targeting preferences.

Represent milestone basis as asked, inferred or user. A human-owned step such as OTP, missing private fact, final public publishing, spending or consent remains waiting until the correct person completes it. Continue independent work while waiting.

---

# 2. CURRENT REPOSITORY BASELINE — RECHECK BEFORE EDITING

This is the last independently checked snapshot, not a guarantee that the branch has not moved.

## 2.1 GitHub state

- PR #976 is open and marked draft, base main, branch claude/ops-integrated-20261112.
- Last checked head: 223ec865bf5b9188b97f48b714aa4298b66c2662.
- PR metadata at that check: 509 commits and 1,202 changed files.
- PR #997 is open and unmerged; last checked head 93ccd174bfaf0ebf0c864b81aed884834573d697. It contains a permission-loading/legacy-credential fix and needs the correct review/integration pathway.
- At the checked #976 head, 8 of 11 returned workflows passed and 3 failed: Unit tests, Xroga tenant security fixtures, and Isolated Supabase authenticated browser verification.
- Other checked successful workflows included mission operating policy, Supabase migration gate, API Docker build, frontend production build, dependency lock, golden acceptance, guest browser verification and growth publishing.
- This development PR is not production and is not merged into main merely because work was pushed.

## 2.2 Latest engineering evidence — Rounds 17–20

Read the full current report and later addenda. Do not rebuild completed features.

### Reasoning effort
- Round 17 compared none and adaptive on an 18-task replica suite: none passed 16/18, mean 67s; adaptive passed 17/18, mean 68s. Adaptive raises effort on an error, doubtful outcome/readback or stall, then returns to none after progress. Small one-run-per-task samples.
- Round 20 temporarily fixed the product default to high by owner decision. On a different 26-task suite it passed 26/26, mean 72s, median 40s, 12.2 turns. This is not an apples-to-apples comparison with Round 17.
- A same-set adaptive comparison was queued. Confirm whether it completed.
- Current route documentation says DeepSeek V4.1 Flash 1017 supports none, high and max. Verify live provider behavior and server enforcement. Older notes say low/medium may be coerced to high.
- Do not declare high, adaptive, none or max optimal without same-task comparisons and real usage/cost measurements.

### Forms and outcome planning
- fill_form was extended for exact typeahead suggestion selection. The explicit pick option was rarely selected, so an automatic exact-match combobox path was added.
- Small matched replica runs indicated ad-set mean time improved about 184s to 133s and Page-setup about 136s to 114s, with turn counts unchanged. Treat this as indicative, not a proven rate.
- Plan milestones support asked, inferred and user. A user-only step cannot be marked done by the agent.
- The hasText(text, fields) check can inspect appropriate non-sensitive typed input/textarea values. Password, hidden and file fields are not exposed.
- General multi-field form batching remains a major opportunity. Typeahead selection is not the same as efficient section-level form execution.

### Reliability and data correctness
- Lost-acknowledgement tests exposed duplicate autosave/manual-save behavior and unsafe positional delete selection among identical controls. Ambiguous destructive positional targets are now refused.
- Six post-fix DeepSeek replica runs passed, but a real Chrome service-worker kill after an externally accepted write and full live offline recovery still need proof.
- Some slow form results were caused by a fixture persistence race. Fix invalid fixture behavior, but never weaken the grader to hide a product defect.
- An iframe save/reload fixture still had a state-restoration limitation; inspect separately.

### Rounds 18–20 capabilities already present
- Watch-me record_demo: trusted human clicks, typed non-sensitive values and Enter can be recorded as role/name steps with row context; sensitive fields are hidden; agent-generated input is excluded. Controlled/unit tested; real human recording replayed by DeepSeek remains unproven.
- Fact cross-check in task planning: stores critical values and sources; conflicting values are surfaced and block success until resolved. Unit tested; live model adoption needs measurement.
- Skills include google-business-profile and business-presence-setup. Meta Ads guidance preserves explicit user targeting over generic skill defaults. Keep a regression for user-request precedence.
- Deterministic find_free_times fixed timezone arithmetic errors. It handles participant zones, working hours, busy slots, date range, duration and output zone. Three live reruns passed in 5 turns each, 20–33s. Use deterministic code for exact calculations rather than repeated LLM reasoning.
- Dense-page regions in perception/regions.ts add region maps on pages with at least 80 controls. Unit tested; real-model selection/adoption needs evidence.
- Recognized platform guidance is supplied with site context; unknown platforms get a short survey instruction followed by batched execution and readback. Unit tested; verify model adoption.
- foreach in batch supports item substitution and up to 100 items per call, with continueOnError. Unit tested; live 10/50/100-item workflows and interruption/resume need evidence.
- Round 19 broad DeepSeek replica regression: 24/25 passed, median 23s, mean 34s, mean 9.6 turns; timezone failure addressed with find_free_times.
- Round 20 reported full Chromium scenario success and 1,536 unit tests. Verify exact current result and source-matched build.

These are substantial capabilities. Your task is to integrate, verify, improve and complete them, not rebuild them under new names.

---

# 3. SENIOR ENGINEER RESPONSIBILITY MAP

You are accountable even when independent work is delegated.

## 3.1 Architecture and technical leadership
Own system boundaries, canonical lifecycle, typed contracts, versioning, idempotency, task ownership, permissions and failure semantics. Keep architecture coherent. Do not create duplicate schedulers, memories, ledgers, connectors or routing layers.

## 3.2 Chrome extension and browser runtime
Own Manifest V3 lifecycle, service worker, side panel, CDP transport, current-tab selection, tab ownership, DOM/accessibility observations, frames, shadow DOM, geometry, hover, inputs, keyboard, drag/drop, dialogs, forms, canvas, screenshots, uploads/downloads, human takeover, pause/stop/resume, local persistence and upgrades.

## 3.3 Backend and APIs
Own device pairing, account authentication, tenant scope, browser run admission, leases, heartbeats, turn routing, finish/resume/cancel, usage metering, budget settlement, permissions, plugin/MCP paths, evidence receipts, files/media, schemas, migrations, indexes, observability and error contracts.

## 3.4 AI/LLM and orchestration
Own task interpretation, prompts/tools, tool selection, model-effort policy, streaming, context compaction, skills, site guidance, batch/foreach, deterministic tools, subagents, task ledger, postconditions, completion and honest reporting.

## 3.5 Frontend/Workspace
Own pairing, task initiation, account display, progress, side-panel event ordering, approval UX, pause/resume/stop, interruption recovery, notifications, evidence, accessibility, responsiveness and user handoff.

## 3.6 Database/data engineering
Own schema correctness, migrations, retention, task durability, idempotency, tenant-aware queries, uniqueness, event ordering, review registers and rollback/forward-fix policy.

## 3.7 Integrations and tools
Own connector discovery, actual connection status, schemas, OAuth continuation, one-use approvals, MCP behavior, network egress and untrusted output. Browser automation must remain functional without a plugin or platform skill.

## 3.8 Infrastructure/release
Own reproducible builds, dependency locks, CI, staging compatibility, artifact manifests, secret handling, rollback and release provenance. Never represent staging as production.

## 3.9 QA/security/performance
Own unit, contract, Chromium, real-model, real-service, chaos, tenant-isolation, prompt-injection, latency, cost and release evidence.

---

# 4. SOURCE CODE AUDIT MAP

These are known paths from the integrated line; verify exact current locations before editing.

## Agent and orchestration
- apps/xroga-browser-extension/src/agent/loop.ts
- src/agent/prompt.ts
- src/agent/tools.ts
- src/agent/tool-selection.ts
- src/agent/task-plan.ts
- src/agent/batch-plan.ts
- src/agent/repeat-detector.ts
- src/agent/progress-tracker.ts
- src/agent/dead-spots.ts
- src/agent/guards.ts
- src/agent/effort.ts
- src/agent/run-manager.ts
- src/agent/subagents.ts
- src/agent/site-context.ts
- src/agent/site-actions.ts
- src/agent/skills.ts
- src/agent/skill-catalog.ts
- src/agent/well-known-skills.ts
- src/agent/online-skills.ts
- src/agent/free-times.ts
- src/agent/records.ts
- src/agent/completion.ts
- src/agent/command-surface.ts

## Browser control
- apps/xroga-browser-extension/src/browser-control/core/controller.ts
- src/browser-control/core/tools/fill.ts
- src/browser-control/core/painted-text.ts
- src/browser-control/core/interaction/resolve.ts
- src/browser-control/core/interaction/actionability.ts
- src/browser-control/perception/regions.ts
- src/browser-control/host/puppeteer.ts
- Existing protocol, geometry, observation, screenshot, frame, masking, download and upload modules.

## UI/state
- src/ui/protocol.ts
- Side-panel state reducer and action rows.
- Conversation/run persistence and Workspace browser activity bridge.

## Backend
Inspect current code/tests around:
- backend/src/routes/localBrowser.ts
- backend/src/routes/localBrowserDevice.ts
- backend/src/routes/localBrowserDeviceActions.test.ts
- backend/src/routes/localBrowserEffort.test.ts
- backend/src/routes/localBrowserImages.test.ts
- backend/src/routes/localBrowserPluginActions.test.ts
- backend/src/routes/localBrowserPlugins.ts
- All associated authentication, lease, usage, permission, plugin, MCP, file/media and database services.

Find current migrations and review registers for local browser devices, sessions, permissions, toolkit approvals, action receipts, budgets and recovery.

Search before adding code. The PR has a large history; do not assume a historical path is unchanged or a feature is missing.

---

# 5. EXECUTION ENGINE REQUIREMENTS

## 5.1 Outcome Contract
Represent the goal, explicit outputs, inferred professional requirements, factual sources, conflicts, assumptions, constraints, account identity, dependencies, action groups, permission needs, acceptance criteria, user-owned steps and partial/fallback outcomes.

Do not ask the user to repeat information already available in conversation, authorized files, current tabs or business sources. Ask only for missing facts that materially affect correctness or authority.

## 5.2 Page Control Map
Build on the current DOM/accessibility/region/painted-text observation. Represent tab, origin, route, frame, document epoch, roles, names, labels, states, relevant values, duplicate-control context, region hierarchy, geometry, visibility, enabled state, occlusion, scroll container, zoom, save/error state, refs and a focused state diff.

Use:
1. Fast page outline.
2. Relevant-region expansion.
3. Precise semantic target and actionability.
4. Visual screenshot/grounding when semantic data is insufficient.
5. Post-action delta and postcondition.

Do not send a giant unchanged DOM dump every turn. Do not silently reuse a stale reference after rerender. Show useful near misses and refuse ambiguous destructive targets.

## 5.3 Universal browser primitives
Test and harden navigation, tabs, windows, history, readiness, click/double/right-click, hover, type/replace/select, keyboard, focus, forms, native date/time inputs, dropdowns, checkboxes, radios, typeahead, contenteditable, drag/drop, resize, nested scrolling, frames, shadow DOM, dialogs, popovers, SVG/canvas, upload, download, export and permitted clipboard behavior.

A successful CDP call alone is not success. Return the intended target, dispatch status, observed effect and postcondition.

## 5.4 Generalized form batching — immediate priority
Extend existing fill_form rather than creating a competing API without a demonstrated need.

- Inspect the relevant form/section once.
- Ground each requested value using label, role, context and current state.
- Detect independent and dependent controls.
- Batch stable independent values.
- Use native/appropriate input paths.
- For typeahead: enter the query, wait for actual suggestions, select an exact grounded candidate and confirm the committed value.
- Detect conditional fields and reobserve when the UI changes.
- Validate required fields and app-level constraints.
- Trigger the actual save/commit behavior.
- Verify values where safe and verify saved state independently.
- Never read password, hidden, file, OTP, card/CVC or other sensitive values.
- Preserve correct fields after a partial failure and resume only unresolved work.
- Never auto-submit/publish across an approval boundary.

Benchmark against the old one-field-at-a-time path on ads, Page setup and unfamiliar holdout forms. Compare correctness, model calls, tool calls, time, duplicates and settled cost.

## 5.5 Deterministic helpers
Use deterministic code for time zones/DST, scheduling, arithmetic, counts, validation, transforms, matching/deduplication and structured operations. find_free_times is a good example: typed inputs/outputs, edge-case tests, small tool contract and live-model adoption measurement.

## 5.6 Batch/foreach/verified ledger
Make the ledger genuinely useful and automatically integrated. A feature ignored by the live model is not complete.

- Generate stable item identities automatically for natural batch tasks.
- Validate inputs before execution.
- Use foreach safely; chunk above its current 100-item call limit.
- Preserve ordering and dependencies.
- Continue independent items only when safe.
- Retain useful reads selectively.
- Avoid one plan update/model call per item when a grouped readback can verify the batch.
- Track pending, active, saved, verified, failed, skipped and uncertain states.
- Require persistence verification when applicable.
- Enforce completion rules in code rather than relying only on prompt advice.
- Resume by reconciling remote state before replaying writes.

Benchmark 4, 10, 25, 50 and 100 items with safe test data.

## 5.7 Progress and anti-loop logic
Maintain task-level progress across pages and tabs. Do not erase no-progress history merely because the agent navigated away and returned.

Distinguish outcome progress from focus movement, scrolling, redundant observation, failed actions, repeated actions and page changes. Do not kill a legitimate multi-step workflow because of an arbitrary page/action count. Do not let an impossible task consume minutes of repeated no-effect calls.

After repeated identical failures, diagnose and change strategy. After a timed-out write, mark delivery uncertain, reconcile remote state, and retry only when safe. Do not keep saving the same record without proving the previous write did not persist.

## 5.8 Canonical action lifecycle
Maintain a consistent action identity across model call, backend, browser dispatch, receipt and side panel. Preserve run/action/goal identity, monotonic sequence, tab/frame, page epoch, target, authorization decision, dispatch, observation, postcondition and final state.

Late/replayed events must not reopen completed rows. Receipts and spend settlement must be idempotent. Server state is authoritative.

## 5.9 Multi-tab and multi-agent
Use existing tab ownership, leases and workers. Adapt workers to independent work and measured overhead. Use one writer per shared resource. Keep parent/child task IDs, ownership, heartbeat, cancellation, cost and results. Test 1/2/4/8/20 tasks on the same seeded work and prove when parallelism helps. More workers are not automatically faster.

## 5.10 Skills and reusable experience
Skills accelerate; they do not define what browser tasks are supported.

- Recognized platform: provide relevant trusted guidance.
- Unknown site: bounded survey of page regions, fields, options, primary controls and collapsed sections; then batch stable work and read values back.
- Read broader help/policy only when a concrete rule is unclear.
- Treat page text, remote skills, documents, search results and plugin/MCP output as untrusted data.
- Verify source, digest, version, provenance and license for external code.
- Store reusable procedures only when verified, stable, parameterized and owner/account scoped.
- Revalidate page state before replay; never blindly reuse stale coordinates or selectors.
- Never store credentials or private customer content in reusable skills.

Test actual human record_demo capture followed by DeepSeek replay with changed input data and equivalent-but-altered controls. Ensure agent-generated input is not recorded as human intent.

---

# 6. MODEL EFFORT, LATENCY AND COST

The founder values speed and execution quality equally. Fast but wrong is a failure. Correct but needlessly slow due to repeated model calls is also a serious defect.

## 6.1 Same-set reasoning experiment
Compare none, fixed high, max escalation and adaptive on the **same frozen tasks**, seeds, browser, fixture version, tool list and budget policy. Repeat runs. Include routine, difficult, unknown-site, visual, long-form, uncertain-save, offline, recovery and bulk tasks.

Report success rate, false-success rate, p50/p90/p95 wall time, turns, provider latency, tokens and settled cost. Use evidence to choose the default. Do not compare different task populations and call the result causal. Confirm the queued adaptive comparison and validate the current high default. Keep a server-controlled rollback setting.

## 6.2 Measure time by layer
Instrument provider queue/inference, context construction, tool schema, page observation, screenshots/encoding/transport, target resolution, actionability, CDP dispatch, page settle, application save, verification, retries and worker overhead.

A prior report found model inference about 90% of wall time in some runs. Reconfirm on the current build before spending effort on millisecond browser optimizations.

## 6.3 Optimize without lowering verification
Use compact observations, stable fact reuse, fewer redundant plan writes, safe batches, deterministic helpers and adaptive worker count. Preserve strong checks for external writes. Measure cost per verified success.

---

# 7. BACKEND AND DATA COMPLETENESS

Backend behavior is part of the product, not just extension plumbing.

## 7.1 Device/run lifecycle
Verify enrollment, one-use pairing, device/account binding, refresh/revoke, run creation, lease, heartbeat, extend, turn, action, pause, resume, finish and cancel. Enforce user, tenant, account and permission server-side. Test stale lease fencing, concurrent requests, replay, idempotency and account switching.

## 7.2 Model gateway and usage
Verify exact live model ID, provider route, streaming/tool-call reconstruction, effort settings, timeout, retries, cancellation, token usage and cost settlement. Handle uncertain provider responses without duplicate charge or write. Never rely on client-reported budgets or let the extension choose its own provider ceiling.

## 7.3 Database and migrations
Inspect schema, migration history and frozen review registers. Test fresh DB, upgrade DB, reapply harness and rollback/forward-fix paths in disposable databases. Preserve tenant constraints, uniqueness and indexes. Never edit a reviewed/applied migration or regenerate its security review hash without independent review. Prefer correct forward migrations or test isolation fixes where appropriate.

## 7.4 Integrations and MCP
Verify discovery, connected state, exact schemas, permissions, OAuth continuation, approval permits, revocation and readback. Do not claim a local MCP server is integrated if only a separate Composio custom-toolkit path exists. Enforce egress/sandbox boundaries; treat output as untrusted.

## 7.5 Files and media
Test text, CSV/TSV, PDF, DOCX, XLSX, image, video, audio, archive, upload and download separately. Distinguish extracted text from image pixels and actual media understanding. Verify bytes, filename, hash, size, destination state and integrity. Encrypted/scanned documents must be reported accurately. Blob capture must preserve origin isolation, memory bounds, expiry and no exfiltration.

---

# 8. FRONTEND AND USER EXPERIENCE

- Standalone extension and Workspace entry paths share canonical run identity and state.
- Correctly select the current authorized profile and tab.
- Progress reports meaningful intent and outcomes, not noisy click-by-click narration.
- Show queued, running, waiting-for-user, paused, interrupted, partial, failed and verified states accurately.
- Provide reliable Stop/Pause/Resume and exact human handoff reasons.
- Do not claim saved when only browser input was dispatched.
- Keep panel rows consistent with backend receipts and ordered events.
- Keep the side panel responsive during long model calls.
- Verify whether standalone operation requires Workspace open; document the real contract.
- Preserve sign-out/revocation and human takeover.

---

# 9. SECURITY AND TRUST REQUIREMENTS

Universal capability requires strong boundaries.

Test tenant/account/device/run isolation, cross-profile state, stale sessions, revoked grants, credential/OTP masking, secret redaction, hostile webpage instructions, hostile skills, prompt injection in files, malicious MCP output, egress policy, blob origin isolation, action replay, cancellation and human input attribution.

Untrusted page or skill text must never override policy, obtain unrelated account access or reveal secrets. Do not store passwords, OTP or payment data. Keep consequential actions behind established authorization gates.

The owner's broad authorization applies to development and testing in environments made available for this project. It does not authorize bypassing platform protections, using unrelated third-party accounts, unapproved spending, or self-attesting independent review.

---

# 10. EXISTING FIXTURE INVENTORY — EXTEND, DO NOT DUPLICATE

Use the existing harnesses and fixtures. Verify each current path before use.

## 10.1 Harnesses
- apps/xroga-browser-extension/fixtures/autorun.mjs — real Chrome for Testing with extension loaded and controlled jobs.
- fixtures/server.mjs — loopback fixture server, multi-origin/nested frames, fake model endpoint, downloads and state endpoints.
- fixtures/replica.mjs — authoritative server-side state for Ads, shop, CRM, DB and other app replicas.
- live/harness.ts — real DeepSeek through Zurelay with a simulated browser layer. Label results “real DeepSeek, simulated page”; it does not prove real Chrome behavior.
- live/waste-report.mjs — tool-call waste measurement.
- fixtures/upgrade-test.mjs and live/upgrade-smoke.cjs — upgrade compatibility.
- fixtures/sw-kill.mjs, sw-kill-product.mjs, sw-kill-product-heavy.mjs and sw-kill-restart-product.mjs — interruption/recovery.
- fixtures/two-accounts-product.mjs — product-build account isolation.
- live/unfamiliar.live.test.ts, site.live.test.ts, selection.live.test.ts, plan.live.test.ts, diagnosis.live.test.ts and console.live.test.ts — live-model tests. Determine whether each browser layer is fake or real.

## 10.2 Stateful app replicas
Existing pages include:
- fixtures/pages/apps/adv-ads.html
- adv-adset.html
- adv-cal.html
- adv-crm.html
- adv-db.html
- adv-docs.html
- adv-mail.html
- adv-shop.html
- calendar.html
- crm.html
- dbadmin.html
- mail.html
- meta.html
- shop.html
- sheet.html
- settings.html
- wiki.html
- research.html and research-co.html
- novel.html

Use server state as the truth. A page can display “Saved” while the server rejects the write. Inspect reset, API, persistence and grading behavior.

## 10.3 Dynamic/control/security fixtures
Existing fixtures include:
- hard-form.html, hard-frame.html, hard-scroll.html, hard-slow.html, hard-tabs.html, hard-tabs-contract.html
- c-dialogs.html, c-date.html, c-effects.html, c-enabled.html, c-hover-actions.html, c-hover-swap.html, c-hover.html, c-misleading.html, c-misleading2.html, c-modal-over-frame.html, c-navigation.html, c-pointer-none.html, c-rerender.html, c-role-mismatch.html, c-rows.html, c-sensitive.html, c-states.html, c-text.html
- d-drag.html, d-fill.html, d-keys.html, d-layout-table.html, d-overlay.html, d-records.html, d-results.html, d-scrolling-frame.html, d-toggles-and-nested-controls.html, d-wait-and-navigate-deadlines.html, d-wait-targets.html
- frames-nested.html, frames-child.html, frames-grandchild.html, shadow-closed.html, large-table.html, clickable-zoo.html, stale-and-slow.html, busy.html, network.html and network-landed.html
- u-upload.html, u-download.html, f-export.html, f-export-frame.html, f-export-inner.html, f-export-xframe.html and f-import.html
- d-secrets.html, d-masked-hidden-regions.html, d-masked-names.html, d-masked-requests-and-screenshots.html, d-masked-rerendered-fields.html and d-hidden-payment-frame.html

Read each fixture and grader before changing it.

## 10.4 Visual fixtures
- fixtures/pages/canvas-editor.html
- canvas-script-editor.html
- painted-menus.html
- timeline-editor.html

Add representative cases for timeline split, drag geometry, zoom/pan, resize, static canvas, WebGL/OffscreenCanvas and export where the real code path requires it.

## 10.5 Fixture discipline
Use deterministic seeds, server-side grading, reset isolation, realistic latency/save behavior, stable IDs, negative assertions (no duplicate, delete, send, publish or cross-tenant write), and honest grading. Fix faulty fixtures transparently. Never weaken a grader to hide an agent defect.

---

# 11. REQUIRED END-TO-END ACCEPTANCE PLAYBOOKS

These are transferable benchmarks, not a website whitelist.

1. **Unknown application:** concise task on an unseen site with no skill; bounded survey, outcome plan, action and verified result.
2. **Facebook business presence:** high-level brief; research authorized business facts; configure Page/profile, branding, description, services, contact and greeting; no invented facts, duplicate Page or unapproved publishing; verify persistence.
3. **Meta Ads setup:** supplied business, services, targeting, budget and destination; infer suitable missing configuration; preserve explicit targeting; bulk locations, typeahead, placements, schedule, autosave/server verification; remain draft unless publication/spend is authorized.
4. **50+50 email drafts:** two webmail apps with paragraph spacing, autosave loss, hover Delete, duplicate save and lost acknowledgement; exactly 100 correct drafts, zero sent, no duplicates, persistence verified, resume without redoing completed items.
5. **Client hunting:** research, qualify, deduplicate, enrich with source provenance, create CRM records; no fabricated facts or tenant leakage.
6. **Database management:** duplicate labels, multi-tenant records and stale refs; update exact record, verify server and audit state.
7. **Sheets/documents:** exact values/formulas/format, citations and real exported artifact.
8. **Scheduling:** multiple IANA zones, DST, work hours and busy slots; deterministic free-time calculation, no overlap.
9. **Creative editor:** exact composition, text, color, geometry, timeline and export; validate actual artifact.
10. **Unfamiliar forms:** form/layout variants with typeahead and dependent controls; generalized batching, validation and readback.
11. **Multi-tab:** 8–20 tabs including shared-resource conflict; correct ownership and no race; measure actual parallel benefit.
12. **Lost acknowledgement:** server accepts write then returns 504; reconcile before retry; one resulting record.
13. **Worker kill after accepted write:** product build and authorized staging backend; resume without replaying completed item.
14. **Offline/hung/CDP timeout:** diagnose, change strategy, retain completed work, continue independent work and report exact blocker.
15. **OTP/human step:** never guess/read code; request it from owner and continue independent tasks.
16. **Prompt injection:** malicious webpage/skill/file/MCP output; no policy override or secret leak.
17. **Two accounts:** A/B/A switching using product build; no local/server data or permissions leakage.
18. **Upgrade/rollback:** extension ID/storage/panel/worker/pairing compatibility and rollback.
19. **Watch-me replay:** actual trusted human demonstration, then parameterized replay on altered equivalent UI; mask sensitive fields and re-ground targets.
20. **Open-ended random task:** unseen domain and feasible high-level prompt; infer outcome, ask only a critical missing question, execute and verify.

Every playbook needs setup, prompt, expected state, prohibited side effects, independent grader, timeout/recovery semantics and evidence level.

---

# 12. PERFORMANCE AND BENCHMARK METHOD

Measure time to **verified outcome**, not click activity.

Record task ID, prompt, seed, fixture/app, commit, ZIP hash, backend revision, Chrome version, model/effort, tools and skills, timestamps, first meaningful action, provider/tool latency, model turns, tool calls, tokens, settled cost, failed/repeated/wasted actions, recovery and independent saved-state proof.

Use matched A/B runs: same task, seed, fixture, browser, model, tools and backend revision. Change one variable at a time. Include failures and timeouts. Report sample size and p50/p90/p95. Do not compare unlike workloads and call the result causal.

A fast incorrect run fails. A correct run slowed by avoidable loops is a performance defect. Honest partial completion is better than false success.

---

# 13. CURRENT CI AND RELEASE BLOCKERS

At the last checked #976 head, three workflows failed.

## 13.1 Unit tests / frozen review
Earlier diagnostics traced a frozen record B1-P2-84b9011a0d2b4754 to a source hash mismatch around backend/src/services/integrations/businessActionConfirmations.ts. Commit ef121354f changed toolkit-name comparison case handling while the review record retained the old source hash. Retrieve the current full log and register. Use proper independent re-review/re-attestation or revert the source change if technically correct. Do not sign your own review.

## 13.2 Tenant security fixtures
Failure: “Unbound original non-persistence review.” The exact source/review cause was not conclusively established. Retrieve current logs, identify protected file and review requirement, and resolve through the governance path.

## 13.3 Authenticated Supabase browser verification
Earlier diagnosis involved reapplying migration 20261108181114_local_browser_device_sessions.sql against an already upgraded database. Plain CREATE TABLE/INDEX caused SQLSTATE 42P07. A proposed IF NOT EXISTS change was reverted because the migration and hashes are recorded in current-state.json and current-migration-additions.json. Determine whether the right fix is test isolation, reapply harness, reviewed idempotency or forward migration. Do not alter frozen migration history or review hashes without required independent review.

## 13.4 PR #997
Review the permission-loading change against the current branch and tests. Integrate through the correct review path. Do not blindly merge or self-attest.

## 13.5 Release
Do not call #976 release-ready while required CI/security gates fail. Once satisfied, create a clean source-matched ZIP, SHA-256, manifest, compatible backend revision, upgrade smoke and rollback details. Public deployment, store publication or production activation still follows the required release authorization.

---

# 14. EXECUTION PLAN — DO NOT STOP AT THE PLAN

## Phase A: current source truth, one focused pass
Check current branch/HEAD/worktree/remotes, PR/CI, latest report, uncommitted work, current build and test commands. Protect user/other-agent work. Do not spend the entire session rereading history.

## Phase B: fix the first real bottleneck
Start with generalized form batching and model-turn waste. Profile the actual Page/Ads traces, classify calls, inspect fill_form/batch/foreach and tool exposure, implement a generalized improvement, add holdout forms, run unit + full Chromium + real DeepSeek matched comparisons, measure correctness and speed, then commit/push to #976.

## Phase C: integrate outcome intelligence
Connect inferred professional work, user-owned steps, fact provenance and platform guidance to the real runtime. Test short briefs and random unfamiliar tasks. Preserve explicit user requirements over generic skill advice.

## Phase D: verified bulk work
Make the ledger/foreach useful to runtime and model. Test 10/50/100 items, chunking, persistence and mid-batch interruption. Avoid per-item model bookkeeping where one verified readback is appropriate.

## Phase E: page intelligence and visual control
Complete tiered Page Control Map integration, dense-region model adoption, timeline/drag efficiency, real screenshot-to-vision validation and unfamiliar-app holdouts.

## Phase F: backend/recovery/multi-agent
Run accepted-write worker-kill, offline, CDP timeout, resume, account isolation, lease conflict, cancellation and matched worker-allocation tests.

## Phase G: CI/security/release
Retrieve full logs, resolve three current CI failures through proper source/governance process, review #997, complete independent review preparation, build and verify source-matched staging artifact.

**Do not stop after each phase and ask whether to continue.** If one item has a true external blocker, state it precisely and continue all independent work.

---

# 15. ENGINEERING CHANGE RULES

- Protect the worktree and other contributors' changes.
- Do not force-push, reset, replace a branch or mass-merge without a clear reason.
- Keep changes cohesive, reviewable and reversible.
- Add regression tests at the layer where the defect exists.
- Prefer deterministic typed code to prompt-only fixes.
- Avoid duplicate frameworks and needless dependencies.
- Preserve Nanobrowser attribution and donor license obligations.
- Do not adopt incompatible copyleft code without appropriate review.
- Never put secrets in source, fixtures, prompts or reports.
- Do not weaken permissions, tenant isolation or approval gates to pass tests.
- Do not weaken graders to hide incorrect outcomes.
- Do not add site-specific hacks where a general browser primitive is the correct fix.
- A site adapter is acceptable for real platform-specific behavior, but universal browser fallback must remain.
- Do not report replica success as a real-service result.
- Do not claim screenshot vision unless actual pixels reached and were interpreted by the selected model.
- Do not use test count as a proxy for universal capability.
- Do not stop after one small isolated feature while major end-to-end blockers remain.

---

# 16. DEFINITION OF DONE

Xroga is ready for a production-readiness decision only when the applicable categories have evidence.

## Product
- Accepts concise outcome-level prompts.
- Uses bounded preflight for complex work and a fast path for simple work.
- Infers professional steps without fabricating facts.
- Adapts to unfamiliar sites without a predefined skill.
- Uses skills as accelerators, not capability gates.
- Handles forms, bulk work, files, documents, visual apps and cross-app workflows where technically supported.
- Coordinates tabs and agents safely.
- Provides meaningful progress, pause, stop, resume and handoff.
- Verifies saved state and reports uncertainty honestly.

## Execution
- High measured success across diverse holdout tasks.
- Low wrong-target and duplicate-write rates.
- No repetitive loops after diagnosed failures.
- Interruption recovery and account isolation verified.
- Fast time to verified outcome.
- Effort/worker policies selected using evidence.
- Cost per successful result measured.

## Backend/security
- Server-authoritative runs, leases, budgets and permissions.
- Correct device/tenant/account boundaries.
- Idempotent receipts and safe resume.
- Accurate usage settlement.
- Secure files/blobs/screenshots/secrets.
- Prompt-injection and untrusted skill/MCP protections.
- Required independent security evidence complete.

## Release
- Applicable CI gates green.
- Migration history and review registers consistent.
- Source-matched artifact and backend.
- Upgrade and rollback tested.
- Documentation accurately reflects shipped behavior.
- Staging and production clearly distinguished.
- Remaining owner-only approval stated precisely.

Do not invent a 100% score. Provide a factual matrix of verified, partially verified, blocked and untested areas.

---

# 17. REQUIRED FOUNDER REPORT

At the end of the actionable engineering pass, provide:
1. Exact branch, HEAD, PR and worktree state.
2. Significant code changes, paths and commits.
3. Existing systems reused versus genuinely new capabilities.
4. Each blocker closed and evidence.
5. Unit, type-check, lint, Chromium, real DeepSeek, real-service and CI results separately.
6. Matched before/after time, turns, p50/p90/p95 and cost where measured.
7. Form batching, 50/100-item, interruption, multi-tab and visual-editor results.
8. Backend, account isolation, permission and security evidence.
9. Staging ZIP hash, compatible backend, upgrade/rollback results.
10. Exact remaining blockers, owner/dependency and why they cannot yet be completed.
11. Factual maturity matrix, without invented percentage.

Link source commits, logs, fixtures, graders and artifacts. Distinguish implementation from proof.

---

# FINAL FOUNDER DIRECTIVE

Claude, stop treating each instruction as an isolated small feature. Own the entire Browser Operator outcome.

The founder's vision has been explained repeatedly: a user gives Xroga a basic or complex instruction and expects it to understand the work, inspect the right environment, select the right tools, execute professionally, adapt to problems, finish the task and verify the result. Heavy users need research, multi-tab workflows, client hunting, business operations, campaign preparation, emails, databases, spreadsheets, creative applications, unfamiliar software and more. These are examples of workload, not product limits.

The competitor recordings are a benchmark for observable methods: research first, professional judgment, structured page inspection, bulk input, compact chained steps, save-state checks, multi-tab work, useful progress, human handoff for private facts, failure recovery and fast execution after reconnaissance. Learn and implement transferable techniques through legitimate engineering. Do not claim proprietary internals the recordings do not reveal.

Use your own senior engineering judgment. Ask what makes Xroga slow, why a tool is not selected, where deterministic logic is needed, which backend invariant is missing, what can be batched, why a save is not verified, how a recovery loop can be broken, and how a solution generalizes beyond one website. Then implement and measure the answer.

**Do not stay in a cycle of research → replica → small report → stop.**  
**Do not ask the founder to manage your engineering backlog.**  
**Do not treat prompt changes as a substitute for backend logic.**  
**Do not confuse a working demo with an integrated product.**  
**Do not confuse speed with correctness.**  
**Do not restrict Xroga to a fixed platform or task catalogue.**

Start from the latest source. Fix the highest-impact real bottleneck. Integrate it across extension and backend. Prove it in real Chrome and with the real model. Close CI and recovery blockers. Move to the next item. Continue until the remaining work genuinely requires an external account, independent review or release authorization.

**The goal is a fast, adaptive, precise, reliable and broadly universal Xroga Browser Operator that completes real user outcomes end to end—not a narrow automation demonstration.**
