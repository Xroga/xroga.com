# Focused production-readiness review (source behaviour, not test names)

Each statement cites the code that enforces it and the test that proves it. "R2-unproven" marks anything that depends on Cloudflare actually enforcing a signed constraint.

## Upload path: authenticated request → READY
| Property | Enforced by | Proof |
|---|---|---|
| tenant/owner cannot be supplied or replaced | `routes/drive.ts` builds the actor from `req.userId` only; zod `.strict()` rejects `tenantId/ownerUserId/bucket` | `drive.test.ts` "identity cannot be supplied by the client" |
| project membership re-validated on every call | `StorageService.#authorizeProject` reads the project owner from the DB each time | `project revocation takes effect…` |
| server generates ids and keys | `newObjectId()` + `buildObjectKey()`; client filename → `sanitizeFilename` | keys/filename tests |
| capability scoped and expiring | presigned PUT: one key, ≤ 15 min, signs `content-type`, `content-length` (R2-unproven), `x-amz-checksum-sha256` | `r2ObjectStore.test.ts` (SDK output); emulator for the memory model |
| concurrent completion idempotent | CAS `updateObject(from=[PENDING,UPLOADING,VERIFYING])`, `storage_commit` returns `ALREADY_COMMITTED`, DB `storage_objects_ready_is_verified` | `concurrent completions … exactly once` (real Postgres, 8 parallel) |
| unverified objects inaccessible | `getDownload`/`readObjectBytes` require `READY` + verified size/hash | download refusal tests |
| expired reservations reclaimed safely | `storage_expire_reservations`; late completion re-reserves and re-checks quota | `a slow upload whose reservation expired…` |
| READY impossible without content | trigger + CHECK in SQL; service verifies read-back SHA-256 | SQL mutation "drop READY-is-verified CHECK" is caught |
| oversize via dishonest metadata | provider signed length (R2-unproven) **and** HEAD size **and** streamed byte count must equal the declared size; mismatch → QUARANTINED, reservation released, never charged | `an oversized body can never pass for a small declared size` |
| same-origin active content | active types (html/svg/js/xml) are served `attachment` + `application/octet-stream` + `nosniff` + CSP sandbox; bytes served from the R2 origin, not xroga.com | `serves active content as an attachment` |

**Provider-enforced restrictions:** the presigned PUT *requests* content-type, content-length and a SHA-256 header; Cloudflare's published examples sign only `host` (+ `content-type`), and its docs do not say that a signed `content-length` or `x-amz-checksum-sha256` is enforced. Therefore the design never relies on it: admission is by server read-back. If R2 rejects a signed content-length, set `XROGA_DRIVE_PRESIGN_SIGN_LENGTH=0`; safety is unchanged.

## Download path
Tenant + current project owner + `READY` + sha present are checked; deleted/quarantined/corrupt → 404. URL ≤ 300 s (default 60 s); forced content-type/disposition/`no-store`; no key/bucket/credential in responses or audit (`no signed material in logs…`). Drive never creates a public URL; the legacy public bucket name is refused for Drive.
**Residual risk (recorded explicitly):** *an already-issued presigned URL stays valid until it expires even if access is revoked a second later.* Revocation prevents **new** signatures only. Mitigation: ≤ 5 min cap; rotating the R2 token invalidates every outstanding signature at once.

## Integrity
SHA-256 is computed by the server over streamed object bytes (`hashStream`, constant memory); browser digests are only *compared*, never trusted; multipart ETag is never used as a hash (R2 part ETag = MD5; composite ETag is a hash of hashes). `readObjectBytes` is the only buffering read: bounded (default 50 MiB, configurable) and used for trusted server consumers, with a re-hash on every read.

## Quota (database-enforced)
`storage_reserve/commit/release/free/expire/reconcile` in PL/pgSQL with a per-tenant row lock. Proven on real Postgres: 50 concurrent reservations → exactly 10 admitted; commit/release/free idempotent; non-negative CHECKs; drift repair from the ledger; wrong-tenant reservation refused by the database. Memory-repo parity test pins identical semantics. Not covered: Postgres **serializable** behaviour under pgbouncer *transaction* pooling — the functions are single-statement RPCs, so each call is its own transaction (safe), but this was not run through a pooler.

## Database
RLS enabled **and forced** on all six tables; `authenticated` can only `SELECT` 14 non-sensitive columns of its own `READY` rows (no key/bucket/upload id); `anon` nothing; every function has `search_path = public, pg_temp` and `EXECUTE` only for `service_role`; migration applied to clean and populated schemas, twice, with a tested rollback script. **Precondition (unverified in Supabase):** because RLS is forced, the API's database role must have `BYPASSRLS` (Supabase's `postgres`/`service_role` do) — check `select rolbypassrls from pg_roles where rolname = current_user` in staging before enabling Drive; if false, Drive fails closed (no writes) rather than weakening RLS.
Not exercised: the real Supabase migration chain (001…) replayed from scratch — the tests use a faithful stand-in for `auth.*` and the two pre-existing tables.


## Closure addendum (2026-10-22)
- **Semgrep (p/secrets, p/typescript) over every file changed on the branch:** 2 findings, both triaged. (1) a synthetic AWS-key-shaped test fixture — now assembled at runtime so no secret-shaped literal exists in source; (2) `ssl: { rejectUnauthorized: false }` on the remote database pool in `storage/runtime.ts`. That mirrors `lib/postgresConnect.ts` and `integrations/supabaseProvision.ts` (repo-wide convention), but it is a real MITM exposure: `STORAGE_DB_SSL_CA` now turns on verification (unit-tested); the default is unchanged to avoid breaking the existing Supabase connection. **Open:** supply the Supabase CA and make verification the default in Phase 2.
- **Run-output artifact adapter:** ownership is taken from `swarm_runs.user_id`, never from the JSON; a run whose project is not the owner's is refused by Drive (`NOT_FOUND`, BLOCKED, not retried); credential-like names/content are never copied (`CREDENTIAL_LIKE_CONTENT`); credential-bearing *fields* of the output JSON are never read; the source row is only ever read (byte-identical before/after in the test).
- **Multipart copy:** a stored part is trusted only when its size and ETag equal the MD5 of the bytes the source yields now; a provider ETag that does not describe what was sent is rejected before completion; the authoritative control remains the read-back SHA-256 compared with the source hash (a lying provider is still caught: `CORRUPT_DESTINATION`).

## Phase 2 addendum (2026-10-24)
Details and evidence classes: `phase-2/PHASE-2-CRITERIA.md`.
- **Closed for the Drive pool:** database TLS is verified by default, Supabase is pinned, no unverified override exists, and the URL is never handed to `pg` as a connection string (it would override `ssl`). Still open: three other unverified database connections (migration gate, `postgresConnect.ts`, `supabaseProvision.ts`).
- **New, closed:** a service identified as staging, preview or unclassified used to run schema DDL and fail `running` production runs at boot if it held a service-role key; the staging descriptor's `XROGA_DEPLOYMENT_ENVIRONMENT=staging` and `RUN_SWARM_WORKER=false` were read by nothing. Boot duties are now gated (`runtime/startupPolicy.ts`).
- **New, closed:** `morgan` wrote request URLs, including OAuth `code=` and `state=`, to stdout outside console; all log output is now redacted (`runtime/safeLogging.ts`).
- **Browser worker:** Playwright's `chromiumSandbox` defaults to false (silently `--no-sandbox`); the launch policy sets it true and refuses weaker options. In a container, Chromium's sandbox needs `clone`, `clone3`, `unshare`, `setns` and `chroot`, which Docker's default seccomp profile only allows with capabilities the worker must not have; the derived profile adds exactly those five. Residual: user namespaces enlarge the kernel surface (a founder decision); application-level egress control does not stop a browser that escapes its sandbox, so network-level deny rules are required at deploy time and are **unverified**.
- **Open, found by audit (not fixed; production credential paths):** plaintext OAuth token writers W1 to W5; W6 and W8 master-key fallbacks to the service-role key and the JWT secret; W8 has no associated data and uses a hardcoded key outside `NODE_ENV=production` (`phase-2/INFRA-004-credential-audit.md`, F1 to F8). `Preview` CI shares production secrets (`phase-2/BOUNDARY-CHECK.md`). `Dockerfile.api` runs as root.
