# Runtime and dependency contract

Source SHA: `669e3af0f46686cf37aedcd8b9d155a0feb6da88`. Xroga retains its canonical scheduler, authority, budget ledger, vault and durable state. This inventory creates no competing execution system.

## Runtime classes

- ACTIVE requires dated observed service/deployment evidence.
- CONFIGURED_BUT_UNVERIFIED records source/configuration without operational acceptance.
- LEGACY is retained history, never automatically activated.
- LOCAL_ONLY cannot claim durable production storage.
- PROPOSED is design intent, never infrastructure permission.

Canonical engineering runtime is Node22.21.1, npm10.9.4 and TypeScript5.9.3. The immutable Google API image starts node dist/index.js and preserves both compatibility/security dependency checks. Vercel retains its separate frontend build. Exact deployed frontend binaries require deployment evidence. No Fly manifest is required to validate a Google API build.

## Admission and configuration

Production frontend/API origins are xroga.com and api.xroga.com. Preview uses isolated owned workers under preview.xroga.com. Native Google service identity, scoped managed KMS and pinned Secret Manager versions replace Fly federation. Supabase tenant authorization, consequential-action confirmation, current credentials, reservation and accounting remain mandatory. Data from tools, models and websites cannot grant authority. Arbitrary external URLs need canonical SSRF/redirect policy and outbound data needs canonical egress admission.

The accepted Google migration receipt is dated evidence for its exact source and immutable forward/recovery images. New Phase4 source and later batch activation are not accepted merely because that infrastructure passed. Hosted Auth cookie hardening requires fresh sign-in and new disposable/browser acceptance before rollout.

## Mechanical checks and release

Regenerate with node scripts/xroga/runtime-inventory.mjs, then run node scripts/xroga/check-runtime-config.mjs. Inventory consistency is separate from security and product acceptance. Original Command010 criteria, strict caller audit, authenticated/disposable tests, exact final-source CI, schema compatibility and reviewed release gates stay unchanged. No production change follows from generation.

Use the verified compatible Google recovery image and documented protected restore path. Never roll v3-writing production back to a legacy-only image or blindly re-enable a held Fly/automatic deployment workflow. Preserve revisions, tombstones, encrypted data and recovery assets.
