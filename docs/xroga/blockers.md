# Repository evidence gaps

Source SHA: `66508abb103a895d86d1c4595d9a648c6f9d7986`. These are pre-existing findings, not changes made by Command 001.

- OAuth credentials and PKCE state persist in `oauthPkceStore.ts` database fields and a storage mirror. Command 009 must establish encryption, expiry and one-use semantics with verified KMS before cutover.
- Auth middleware can return internal configuration/error text. Repair and test safe public errors in Command 007.
- Queue definitions have no discovered Worker consumers; do not call notifications/token distribution/email/swarm processing active from queue names alone.
- `taskGraphRunner.ts` has no discovered production caller. The reachable software-agent/synthesis paths must be traced before choosing the canonical integration surface.
- Task/run/operations/business-action/cost/credential/browser boundaries overlap. Review candidates are not permission to delete or rewrite them.
- Upcoming Automations and Library presentations are not evidence of real workflow, employee, pack or Drive backends.
- Migration history mixes short numeric/alphanumeric and timestamp prefixes. Preserve actual installer ordering and verify clean/upgrade compatibility in Command 003.
- Installed runtime/toolchain and old AGENTS descriptions differ; reproduce from lockfiles in Command 003.

## Absent named paths

- Dockerfile.browser: Absent from tracked repository; no substitute silently created.
- fly.browser.toml: Absent from tracked repository; no substitute silently created.
- cloudbuild-run-job.yaml: Absent from tracked repository; no substitute silently created.
- cloudbuild-browser-worker.yaml: Absent from tracked repository; no substitute silently created.
- .vercel/project.json: Absent from tracked repository; no substitute silently created.

## Unresolved static evidence

- Computed route paths, runtime registrations, Docker/worker commands and dynamic nonliteral imports require explicit manual reconciliation.
- No production credentials or customer data were read; live behavior remains unverified in this command.
- Static imports do not prove provider availability or authorization correctness.
- Unresolved local import scripts/batch3/live-github-check.ts:22 -> ../../backend/src/existingSource/change/localProcessPort.testsupport.js
- Unresolved local import scripts/batch3/local-supabase-check.ts:17 -> ../../backend/src/existingSource/change/localProcessPort.testsupport.js
- Unresolved local import scripts/render-software-art.mjs:17 -> ../node_modules/playwright/index.mjs
