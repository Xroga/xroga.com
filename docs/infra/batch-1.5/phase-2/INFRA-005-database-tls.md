# INFRA-005 prerequisite: verified database TLS for the storage pool

| Field | Value |
|---|---|
| Requirement | Phase 1 acceptance open item 4; handoff risk 7: "fix database TLS certificate validation before any real Supabase deployment" |
| Source | `claude/xroga-batch-1-5` @ `6febf505` (code + tests + mutation group); the mutation script was then corrected (reporter and verdict logic, docs/evidence only) |
| Evidence class | **LOCAL_TESTED** (planning rules, real TLS handshakes against a stub server with generated certificates, `pg` end to end) and **REAL_PROVIDER_VERIFIED for TLS trust only** (handshake against the live Supabase pooler). Not STAGING, not PRODUCTION: no authenticated database session was opened anywhere |
| Cost | $0 |

## What changed
`backend/src/storage/databaseTls.ts` plans every storage connection; `createPool` uses it. Phase 1 would connect encrypted but unverified
unless `STORAGE_DB_SSL_CA` was set. Now:
- **Loopback** hosts (judged from the *parsed* host only) are plain. Phase 1 decided this with `/localhost|127\.0\.0\.1|sslmode=disable/.test(url)`
  over the whole URL, so `postgresql://u:localhost@remote.example.com/x` skipped TLS.
- **Every other host is verified**, trusting in order: `STORAGE_DB_SSL_CA` (PEM or file), the **pinned Supabase Root 2021 CA** for
  `*.supabase.co` / `*.supabase.com`, else the platform store. A failed verification is a failed connection (Drive reports unavailable).
- **The URL is never given to `pg` as a connection string.** `pg` merges values parsed from the string over the `ssl` option
  (`node_modules/pg/lib/connection-parameters.js:55-60`), so `?sslmode=no-verify` would silently switch verification off; a test pins that
  premise. Discrete fields only; a URL asking for plain text or no verification is refused.
- **No override exists**, in any environment. A developer with a private CA supplies it through `STORAGE_DB_SSL_CA`.
- `probeDatabaseTls` and `scripts/storage/check-db-tls.mts` check a plan by **handshake only** (8-byte SSLRequest + ClientHello; no startup
  packet, user, password or query), usable before enabling Drive and for readiness.

## The Supabase trust anchor (observed, not assumed)
Supabase's SSL page names `prod-ca-2021.crt` and recommends `verify-full` but gives no URL, host coverage or expiry, so I observed it:
| | |
|---|---|
| Live chain, `aws-1-ap-northeast-1.pooler.supabase.com:5432` (production region), 2026-10-24 | leaf `*.pooler.supabase.com` (SAN also `*.pooler.supabase.co`, valid to 2030-03-11) -> `Supabase Intermediate 2021 CA` (to 2033-10-21) -> `Supabase Root 2021 CA` (self-signed, to **2031-04-26**) |
| Public trust | **None.** Node's default store rejects it (`SELF_SIGNED_CERT_IN_CHAIN`); pinning is required |
| Independent confirmation | Supabase's own bucket (`supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt`) serves a certificate with the **same** SHA-256, `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA` |
| Pinned | `backend/src/storage/certs/supabaseRoot2021.ts`; the planner refuses it if its fingerprint, count (exactly one) or expiry ever stops matching |
| Not observed | the **direct** host `db.<ref>.supabase.co`: it does not resolve from this machine (IPv6 only). If production uses it, its chain is unverified here; with verification on, a chain not rooted in the pinned root **fails closed** and an operator supplies `STORAGE_DB_SSL_CA`. Run `check-db-tls.mts` against the real `DATABASE_URL` first |
| Renewal | the root expires 2031-04-26; pin its successor before then (the planner will start refusing the pinned root on that date) |

## Positive and negative outcomes
| Case | Result |
|---|---|
| Live pooler, default plan (pinned root) | **verified**, TLS 1.3 (`evidence/real-tls-handshake-2026-10-24.json`) |
| Live pooler, an unrelated CA supplied | refused, `SELF_SIGNED_CERT_IN_CHAIN` |
| Live pooler server, platform store only | refused, `SELF_SIGNED_CERT_IN_CHAIN` |
| Stub server, trusted CA | verified |
| Stub server: different root / wrong host name / no CA / no TLS offered | each refused (`SELF_SIGNED..`, `ERR_TLS_CERT_ALTNAME_INVALID`, ..., `the server does not offer TLS`) |
| `pg` against an untrusted server | stops at TLS; the stub **never receives the startup packet** (user name, password) |
| `sslmode=disable/allow/prefer/no-verify`, `ssl=false/0`, any letter case, on a remote URL | refused |

## Tests and defect injection
24 tests in `databaseTls.test.ts` (the strict runner picks them up with the rest of `backend/src/storage`; the real-handshake group needs
`openssl` and is skipped visibly without it; CI has it). Storage suite: **167/167**, backend typecheck: **0 errors**. Seven injected defects,
each **CAUGHT** (`evidence/logs/mutation-checks.log`, 17/17 with the Phase 1 non-database mutants): verification off; loopback by URL text;
weakening `sslmode` accepted; raw URL passed to `pg`; Supabase suffix without a dot boundary; fingerprint unchecked; several certificates accepted.
Phase 1's own test asserted the unverified behaviour as its contract; it is replaced by the new contract.

## Impact and compatibility
Production behaviour does not change today: the storage pool is created only when Drive is configured (`XROGA_DRIVE_R2_*` and a database
URL), and it is not. When it is, a URL that carries `sslmode=no-verify|prefer|allow|disable` will be refused instead of tolerated.
The mutation script was also repaired: under Node 24 it printed no test summary and reported every defect as SURVIVED; it now forces the TAP
reporter and reports INCONCLUSIVE rather than SURVIVED when there is no summary, and exits non-zero on either.

## Remaining gaps
The three other unverified connections (migration gate, `postgresConnect.ts`, `supabaseProvision.ts`) are unchanged by design. No
authenticated session, staging or production verification. Direct-host chain not observed.
