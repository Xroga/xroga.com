# Command 003 — PASS (credential-free engineering baseline)

Verified code SHA: `9c4fc0a5fa64760c8dbf5dbc1d6a41f0856af3ab`. Tested PR merge SHA: `6d4cfeb0392b131dcdfb08283a5dc02fa7ac9438`. [Successful aggregate CI](https://github.com/Xroga/xroga.com/actions/runs/38389954256); draft [PR 803](https://github.com/Xroga/xroga.com/pull/803). Not a production merge/deployment or Batch One completion.

## Commands and actual results

Node 22.21.1 / npm 10.9.4; TypeScript 5.9.3 in both workspaces. Root `npm ci` succeeds in clean Linux CI and the isolated Windows clone. CI installs pinned Chromium in a shared test cache, runs `npm run verify:baseline` twice and `node scripts/ci/compare-baseline-runs.mjs`. Both complete 17-stage executions pass:

| Stage | Result per run |
| --- | --- |
| Frozen locks / installed state | Three identical lock hashes; 1,144 indexed packages; matching actual installed fingerprint |
| Focus/skip governance | 19 reviewed pre-existing source sites; zero focused tests; no new runtime skips |
| Backend type-check / build | Exit 0 each |
| Backend tests | 2,717 passed; zero failed/skipped |
| Next route types / frontend type-check | Exit 0 each |
| Frontend lint / production build | Exit 0 each; existing warnings retained |
| Frontend tests | 987 passed; zero failed/skipped |
| SQL syntax / identifiers | 67 passed; no database execution |
| Inventory / requirements integrity | Exit 0; missing historical sources remain deferred |
| Baseline negative fixtures | 12 passed; zero failed/skipped |
| Inventory / ledger fixtures | 18 passed; zero failed/skipped |
| Agent dependency resolution / whitespace | Exit 0 each |
| Repeat comparison | Same SHA, toolchain, locks, installed versions, suite counts and unchanged tracked source |

Full sanitized records: `ci-run-a.json` / `ci-run-b.json`. Linux installed fingerprint: `5ecdde70804b5ef055d7d58ded18b23690f30774e8e153332956949bae064e34`. Platform optional packages differ legitimately; cross-OS equality is not claimed. Windows supplemental verification passes backend tests with 13 existing platform skips and frontend type-check/lint; its complete repeat is not yet claimed.

## Defects repaired and compatibility

The aggregate correctly failed before fixes: five Linux sandbox/browser tests used a cache different from the successful probe; Windows lost mixed-case system `ComSpec`; full frontend type-check found 27 pre-existing test/configuration errors. The cache and system allowlist were corrected without changing assertions or product execution. Existing dotAll regexes require ES2018; TypeScript remains noEmit. Two test fixtures match actual contract/value types; all eight affected tests pass.

The original root lock resolved backend TypeScript 6.0.3, dotenv 17.4.2 and Node types 26.0.1 outside declared ranges. Restore/pin existing standalone versions 5.9.3/16.6.1/22.20.1; frozen install and installed-range/index checks now pass. No broad upgrade. Only added package: dev-only `libpg-query@18.1.5` (MIT), with `@pgsql/types@18.0.0`.

`unit-tests.yml` supplies aggregate `unit`; API Docker/standalone frontend build checks remain and pass. Agent V2 retains workspace/standalone checks but cannot rewrite locks/push main. Supabase PR parsing is secret-free; protected production migration behavior unchanged. Node setup changed in auth, authority, community, browser, growth, launch and SEO workflows. No workflow removed. Main protection returned “Branch not protected” (404), rulesets empty; user-mandated gates still apply.

## Acceptance and limits

All ten Command 003 baseline criteria pass: documented command; non-zero mandatory failures; frozen install; explicit runtime; focused/unregistered skip rejection; SQL identifiers/order; actual CI builds without production credentials; repeated clean execution without source mutation. Negative fixtures run genuine failing unit/type-check processes and reject missing runtime, lock drift, bad SQL/IDs, unsafe installed versions and false repeatability.

Authenticated-browser CI is **BLOCKED_PENDING_TEST_CONFIGURATION**, not passing or disabled. User authorized continued safe work but forbids security-sensitive production merge/deploy before authenticated E2E and staged proof. SQL parsing is not fresh/upgrade DB, RLS or staging proof; these remain mandatory in Commands 007–010. Root audit: 62 advisories including six critical; runtime impact/remediation remains a final security gate. Timing/cache speed is nondeterministic; versions, counts and outcomes match.

No production deploy, DNS/provider migration, key rotation, payment operation or product schema change. Revert Command 003 commits for tooling/workflow rollback; no user data needs rollback.
