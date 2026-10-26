# Runtime/dependency contract

Source SHA: `9bd8c9f59100135166849211f691b8aca0beff07`. Existing runtime semantics are preserved; this audit does not create another provider router, scheduler, vault or backend.

## Runtime classes

- ACTIVE requires dated observed service/deployment evidence, not a manifest or key-name presence.
- CONFIGURED_BUT_UNVERIFIED records code/configuration without current authoritative proof.
- LEGACY is retained and not deleted or automatically activated.
- LOCAL_ONLY must never silently claim durable production storage.
- PROPOSED is design intent, not infrastructure permission.

Canonical engineering runtime: Node 22.21.1/npm 10.9.4/TypeScript 5.9.3. Current API image uses that Node pin. Frontend project metadata is configured 24.x; exact running frontend binary is not inferred from that setting. Docker API emits dist/index.js; Vercel builds frontend with its existing standalone npm pipeline. The Fly host test job currently lacks explicit setup-node; document/fix this through normal review, never assume its runner default.

## Configuration and admission

The existing source helpers remain canonical. Supabase server service-role access bypasses RLS and needs independent owner/tenant checks (Command 007). OAuth/PKCE/private storage and existing BYOK encryption need verified KMS and migration (009). Existing action authority/digest/approval/budget boundaries must be unified (008) before consequential calls. API/worker/tool egress and untrusted input need central guard coverage (010).

Frontend production Supabase remains pinned. Command 007 admits an explicit, validated non-production CI build realm; this does not grant roles or bypass founder/MFA authorization. Real authenticated E2E proof is still blocked pending the dedicated test configuration; never use production users. Missing isolated GitHub secrets/variable remain BLOCKED_PENDING_TEST_CONFIGURATION. Stage security/migration proof and KMS are release gates, not optional metadata.

## Mechanical check

Run `node scripts/xroga/runtime-inventory.mjs` to regenerate after review, then `node scripts/xroga/check-runtime-config.mjs`. Zod/schema, exact source/config hashes, known dynamic bindings, named environment coverage, service IDs, canonical public hosts, credential-like inventory values and explicit high-risk fallback records are checked. Positive/negative tests use only fake canaries. Current high risks remain recorded and unwaived; validation is inventory consistency, not production security certification.

## Production rollout

No deploy, key rotation, DNS edit or DB migration in Command 004. Future release must pass authenticated E2E, isolated fresh/upgrade DB and staging tests, credential/KMS verification, advisory review, final GO/NO-GO and ten command manifests. Only then use the existing authorized release workflow. Rollback is a normal revert of audit/tooling commits; no user data was changed.
