# Proposed staging rollout — explicit approval required

This is a runbook for the existing frontend/backend, not a new orchestrator or deployment provider. None of these resource/deploy/migration steps has been executed. Current prepared scripts are PLAN/INSPECT tools, not a claim of executable end-to-end staging delivery.

## Before any deployment

1. Owner approves exact resource names, projected costs, time window and source SHA. Separate approval is required for creating resources and synthetic object/database writes; no automatic production promotion.
2. Verify the production resource inventory read-only; record all bucket names and service bindings. Create reviewed staging identities only after approval. Record non-sensitive platform evidence in the completed manifest outside Git; never insert token/key/password values.
3. Independently review synthetic-only database, Auth signing keys, callback allowlists, staging frontend/API identity, no production network reachability, no production Worker bindings/R2 credentials, and absence of live AI/billing/email/GitHub/deploy/MCP credentials. Reject unknown configuration; no fallback to production endpoints.
4. Keep automated `command3-auth-browser.yml` disposable Supabase untouched. Require successful exact-SHA isolated tests, all applicable migration history, preserved canonical workspace regressions and scoped semantic review. Staging is additional evidence, not a substitute for blocked prerequisites.
5. Review complete fresh staging migration history and representative upgrade process. The local full-history runner deliberately refuses remote databases; DO NOT remove its guard or point it at staging/production. Apply migrations only using separately approved staging credentials/process, preserve evidence, compare real catalog, grants, policies and sanitized pre-upgrade records. Do not execute production migration automation on the branch.

## Prepared plan and configuration

Use an empty-credential operator shell and a completed, independently reviewed copy of `deploy/staging/manifest.example.json`:

```text
node scripts/security/staging-preflight.mjs <reviewed-manifest.json>
```

The committed example must exit nonzero. A valid operator manifest prints PLAN_ONLY_NOT_DEPLOYED. It does not retrieve/decrypt envs, authorize a deployment or enforce firewall policy. Fly CLI deployment args in the plan explicitly target the separate app/config; require the scoped staging-only token in the approved deployment process, never the repository Production token. Vercel must be separately linked to the approved staging project with target Preview, not `--prod`; no `.vercel` project link or production env pull is changed here. The Fly template is not wired to any automatic workflow. Actual credentialed deployment wrappers remain BLOCKED pending resource/approval verification.

Staging app configuration uses normal existing backend/Next variable names *inside the isolated app only*. Operator tools deliberately refuse those generic variables in their own environment to prevent accidentally using a copied production shell. Set staging FRONTEND_URL, API_PUBLIC_URL, SUPABASE_URL and Next public API/Auth URLs consistently. No default xroga.com/xroga-api endpoints or production public R2 URLs are acceptable. Backend startup schema ensures/reconciliation must be reviewed against the staging DB, not treated as read-only operations.

STOP before deploying a self-hosted staging frontend: the current canonical `authBuildRealm.mjs`/`config.ts` does not admit the proposed Fly Auth origin. A reviewed, exact staging-only build/server admission extension and real rejection/positive tests are still required. Do not use the disposable-local CI flag on a hosted deployment, edit browser storage, set VERCEL_ENV to pretend it is CI, remove production pinning or treat this plan as proof of compatibility. No new public auth override was added.

## Prepared private R2 check

After resource identity/privacy and token-scope review, set only the dedicated test tool variables through protected secret handling:

- `XB01_R2_METADATA_READ_TOKEN`: Cloudflare account metadata read access, not an object token.
- `XB01_R2_TEST_ACCESS_KEY`, `XB01_R2_TEST_SECRET_KEY`: S3 Object Read/Write restricted to this exact private test bucket; no production bucket access.
- `XB01_STAGING_TEST_APPROVAL_SHA`: exact owner-approved source SHA (an explicit execution acknowledgement, not an authentication system).

Do not print/paste values or pass credentials as command-line arguments.

The CLI additionally requires the manifest's source SHA to match the actual clean checkout, so another version or uncommitted source cannot inherit a passing/approved test receipt. This still does not make the acknowledgement environment variable an identity or authorization system.

```text
node scripts/security/r2-private-check.mjs <reviewed-manifest.json> inspect
node scripts/security/r2-private-check.mjs <reviewed-manifest.json> canary
```

`inspect` performs only GETs of bucket identity, managed-domain settings and custom domains; fails if settings are missing, public or any custom domain exists. `canary` is a real object write/read/delete test, not currently authorized/executed. It requires explicit approval, <=1KB synthetic bytes and one random `xb01-canary/<uuid>/synthetic.txt` object; conditional creation prevents overwrite, exact cleanup is mandatory, denied anonymous response must be 401/403/404. No customer objects are touched, listed or deleted. An interrupted/ambiguous network PUT can require operator cleanup of that test prefix; approve a short test-object lifecycle/cleanup policy before execution. Never silently ignore failed cleanup.

PASS_BUCKET_CANARY_NOT_APPLICATION_AUTHORIZATION is deliberately narrower than private-file acceptance. Do not count it as proof of tenant ACLs, signed-link expiry/revocation, application uploads, R2 durability, encryption/KMS or Workers access. The current publicUrl/fallback delivery implementation must be repaired/reviewed before the end-to-end private file gate can pass. Canonical media endpoints are retired; never revive them as a public proxy just to pass a test.

## Evidence and teardown

Record exact staged SHA, build outputs, resource identities, migration hashes/catalog diff, real authenticated denial assertions and private-file evidence. Retain only safe/redacted summaries; exclude keys, raw Auth state, customer data and full provider errors. Use existing release/evidence contracts (`backend/src/operations/productionOperations.ts`, `docs/operations/environment-model.md`) rather than a second promotion engine.

With separate approval, stop staging machines, revoke dedicated test credentials, delete only known synthetic test objects/users and remove approved disposable resources. A failure means NO GO, not production rollback or credential replacement. Production remains unchanged. Review final ten-command manifests, advisory issues and GO/NO-GO before proposing merge/deploy; staging success alone never authorizes either.
