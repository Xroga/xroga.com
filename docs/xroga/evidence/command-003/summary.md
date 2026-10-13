# Command 003 evidence — verification checkpoint

Status: **IN PROGRESS / NOT RELEASED**. Baseline infrastructure is implemented; full clean runs and CI are not yet verified.

- Actual selected toolchain: Node 22.21.1, npm 10.9.4; locked TypeScript 5.9.3.
- `node --test scripts/ci/baseline.test.mjs` under the pinned toolchain: 10 passed, zero failed/skipped.
- `node scripts/ci/validate-migrations.mjs`: 67 migrations pass PostgreSQL WASM syntax and identifier ordering; no database execution.
- Agent dependency resolution: Cline 0.0.82, backend Zod 3.25.76, prompt registry Zod 4.6.5; actual import succeeds. Cline's import-only package identity is checked using backend module search paths.
- Known pre-existing skip sites: 14; no new runtime skips; runtime skip totals still pending full suite execution.
- Frozen root `npm ci` succeeded. Clean-checkout repeatability/build/CI results remain pending.
- Existing installation audit: root 62 advisories including six critical, standalone frontend 21 including one critical. Runtime impact and remediation remain to be classified; these are not declared safe or fixed.
- Changed CI: unit aggregate, Agent V2 lock check, frontend build, Supabase PR parser, and common Node setup references in auth/authority/community/browser/growth/launch/SEO workflows. API Docker build and protected deployment/migration responsibilities are preserved.
- Intended aggregate check: `Unit tests / unit`; actual protected-branch settings must be independently inspected.

No production deploy, product migration, application runtime rewrite or payment operation was performed. Full stage manifests will be added after clean runs; do not interpret this checkpoint as acceptance completion.
