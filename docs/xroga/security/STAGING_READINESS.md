# Batch 01 staged-security readiness — blocked, no deployment authorization

Observed 2026-10-14 local date using read-only repository/GitHub/Vercel metadata. No cloud resource, credential, DNS, production data or deployment was changed.

## Actual resource findings

| Resource | Observed name / evidence | Isolation conclusion |
| --- | --- | --- |
| GitHub environments | `Production`, `Preview`; both have no protection rules or deployment branch restrictions and no environment-scoped secrets | No dedicated staging environment. The repository's general Supabase/Fly secrets must NOT be reused for staged tests. |
| Vercel | `xrogaai.com`, `prj_OFS4CCMNe4dPFDpgdOtVUszg8vMv`, Next.js, configured Node 24.x; custom-environment list empty | Production-linked project; configured runtime differs from repository Node 22.21.1. A Preview target does not prove database or credential isolation. |
| Existing preview | GitHub deployment `7046899519`, source `934cb850`, reported success at `https://xrogaai-gm9qlm96o-xrogas-projects.vercel.app` | Metadata only, not probed/certified as isolated or current. Do not run security/destructive tests on it. |
| API | `fly.api.toml` deploys `xroga-api` through `fly-deploy.yml` using Production secrets; includes production frontend/OAuth/billing/sandbox identifiers | Not staging. `backend/fly.toml` is an older configuration of the SAME app, not a separate staging app. |
| R2 | Existing code defaults to `xroga-assets`, builds public URLs and permits inline/local fallbacks | No verified dedicated test bucket, account inventory or non-production token. Cloudflare account metadata access is unavailable in this checkout; no bucket listing attempted using production credentials. |
| Automated Auth/DB | CLI 2.120.0/Docker, per-run keys and loopback services in `command3-auth-browser.yml` | Real disposable Supabase remains the canonical automated test environment; no hosted test project required. |

GitHub repository secret *names* were inspected, not values. No R2/staging-specific secret names or repository variables were returned. Secret names and Preview deployment success do not prove live environment configuration. Owner has confirmed that staging/R2 isolation is not yet verified.

## Minimal proposed setup (NOT provisioned, cost approval required)

Reuse current accounts and release providers; no DNS changes. Provision only with explicit approval:

1. A separately linked Vercel project for `xroga-staging-*` using existing frontend/build config and Node 22.21.1. Do not copy production project envs or use its default Preview credentials.
2. A distinct `xroga-api-staging` Fly app built from `Dockerfile.api`. Proposed `deploy/staging/fly.api.toml` uses one shared 1GB machine, zero minimum running machines; exact resource capacity/cost still requires owner review. Stop it after verification. No sandbox/AI/billing/publishing credentials.
3. Temporary self-hosted Supabase for staging (`xroga-supabase-staging`) with an independent PostgreSQL volume and Auth keys, synthetic users only. It must not connect to either observed hosted Supabase project. This is NOT a request to maintain a separate hosted test project. Operational hardening, TLS, restricted ingress, Auth callback allowlist, backup/expiry policy and actual resource capacity remain unimplemented/provisioning prerequisites; do not claim the CLI's local development defaults are production-ready staging hosting.
4. Dedicated private R2 bucket `xroga-security-staging`, not a prefix of a production bucket. Disable r2.dev/public custom domains, do not bind production Workers, use bucket-restricted Object Read/Write credentials. Separate account-metadata read token is required; S3 object tokens cannot prove domain configuration. No numerical cost/free-tier assumption is made.
5. Protected GitHub `Staging` environment with required owner approval, branch restrictions and staging-only secrets. This document does not create it or change existing environments.

The app has existing hard-coded external destinations and startup reconciliation/schema ensures. Missing provider keys and the proposed `services: disabled` declaration alone are NOT a complete egress guarantee. Require staging network controls plus caller review before starting the app. Never supply billing, email, deployment, GitHub-write, Composio or provider tokens merely to silence readiness warnings. Boot/health is not integration success.

## Credential-free implementation delivered

- `staging-preflight.mjs`: validates exact SHA, separate origins/resource names, owner-reviewed production bucket inventory/isolation evidence, synthetic-only policy and inactive external services. Rejects inherited general-purpose production-capable env variables. Prints a plan only; cannot provision, deploy, migrate or fetch env secrets. Declarations are operator inputs, not independent platform attestation or authorization.
- `deploy/staging/manifest.example.json`: intentionally incomplete and fails closed. No resource in it is claimed to exist.
- `deploy/staging/fly.api.toml`: proposed separate-app template, NOT referenced by production CI.
- `r2-private-check.mjs`: explicit `inspect` mode performs fixed Cloudflare-origin GETs only and fails on unknown/private-domain state. `canary` mode is prepared but NOT executed: requires reviewed manifest, exact owner-approved SHA and test-only S3 credentials; conditional PUT, integrity read, unsigned/public denial and exact-object delete/absence verification. A timeout/5xx never counts as denial. No object enumeration/bulk deletion, secret logging, default production bucket, public proxy or new runtime dependency.
- Eight unit cases cover admission, isolation, read-only API shape, denial semantics and precise cleanup, included in existing baseline runner. Injected unit fixtures are not live R2 acceptance.
- A separate real Supabase Storage integration test exercises existing private OAuth bucket policy through actual Storage/Auth/browser roles and temporary synthetic bytes. It is NOT R2, encrypted credential-vault or signed-download acceptance.

Official API contract references used for the prepared R2 inspector: [managed domain GET](https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/domains/subresources/managed/methods/list/), [custom domains GET](https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/domains/subresources/custom/methods/list/), [token scope](https://developers.cloudflare.com/r2/api/tokens/). No reference/API response was treated as proof of Xroga resource configuration.

## Mandatory unresolved gates

| Gate | Status / exact prerequisite |
| --- | --- |
| Real staged app/Auth/database rollout and compatibility | BLOCKED: separately approved/provisioned resources, restricted network and synthetic dataset; full history and reviewed expand/migrate/contract rollout, actual revision and auth/role/tenant assertions. Isolated fresh/representative upgrade proof is not complete production-schema parity. |
| Actual R2 bucket privacy/durability | BLOCKED: reviewed private test bucket and metadata/S3 scopes, explicit approval for synthetic canary PUT/DELETE. Prepared inspector has not contacted Cloudflare. |
| Application-private file delivery | BLOCKED: existing R2 publicUrl/data-URL/local fallback cannot certify private downloads. Need canonical owner-authorized private download/signed-link adapter and actual A/B denial, revocation/expiry, range and restart tests. Bucket-only canary explicitly reports these as blocked. |
| All privileged caller semantics | IN PROGRESS: budgets/callbacks/webhooks/provisioning/memory/community/delivery remaining; 662 conservative candidates are not automatically certified. |
| Production credential-vault cutover | BLOCKED: Command 009 and independently reviewed real production KMS; never use local test keys. |
| Batch release | NO GO: 007 incomplete, 008–010 not started, dependency/advisory and final ten-manifest gates outstanding. PR #803 remains draft. |

Next owner action is approval of a bounded staging-resource/cost/isolation proposal, NOT a request for secret values in chat. After approval, configure secrets through scoped platform controls and record reviewed resource identities/evidence. No merge, production migration or deployment follows merely from this approval.
