# Batch One test strategy

Preserve the existing test frameworks. Use deterministic unit fixtures for boundaries; isolated databases for tenant/RLS and migration proof; dedicated staging for integration proof; production-safe read-only smoke tests only after release gates pass.

## Current baseline

The root `npm run verify:baseline` executes existing backend and frontend unit suites and actual compiler/build/lint commands. Its own negative fixtures prove lock drift, focused tests, unregistered skips, duplicate migration IDs, invalid SQL, missing runtime, a real TypeScript error, a real failing test and empty collection cannot pass. New intentionally broken examples live in owned temporary test directories, never production source paths.

Nineteen **pre-existing skip sites** are registered individually with owner, reason, command and review date in `tests/ci/known-skips.json`. The initial audit found 14; strengthening it to detect shorthand Node options found five more unchanged existing sites. This is a count of source sites, not a runtime skip count. No runtime tests were newly skipped. Linux CI executes POSIX shell/junction coverage and installs pinned Playwright Chromium into one shared test cache for the browser probe and local executor. The Linux backend suite passes all 2,717 tests with zero skips after cache alignment. A missing browser or platform limitation remains a reported gap. Focused tests, including Node `{only: true}`, are forbidden even if registered. Registration is manually reviewed, never a CI repair step.

Existing Playwright configuration and frontend E2E suite remain canonical. Authentication E2E requiring dedicated Supabase test credentials must run only against the approved isolated test project. Missing fixtures are blockers, never permission to use production accounts or weaken authorization. Later golden journeys must distinguish `PASS`, `FAIL`, and `BLOCKED_KNOWN_GAP`.

## Integration reference decisions

Primary source metadata and pinned licenses for Schemathesis, Pact JS, Testcontainers and Toxiproxy are recorded in `repository-candidate-register.md` and `research/repository-candidates.json`. They inform API fuzzing, consumer/provider contracts, disposable dependencies and failure injection. None is installed: current Node/tsx and Playwright tests plus a SQL parser meet Command 003 without introducing another test runtime. Pact licensing requires further review before adoption; metadata ambiguity is not a license grant.

## Safety and limits

Baseline subprocesses cannot inherit production credentials and known operational destinations are replaced with test values. This is not proof that every existing hard-coded URL is safe: later topology and egress audits must trace them. Unit suite success is not production integration success. SQL parsing is not executing migrations. Static source reachability is not a verified journey. Subsequent security commands must supply cross-tenant negative cases, replay/approval/evidence tests, secret-leakage canaries, and fresh/upgrade/staging proof before a release decision.

Never mask failing assertions, lower test collection floors, add runtime skips, disable CI or use fabricated telemetry to obtain a passing result. Record exact commands, test counts, exit codes, source SHA and environment class for every gate.
