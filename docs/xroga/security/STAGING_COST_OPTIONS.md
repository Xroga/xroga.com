# Revised staging options — proposal only, no infrastructure authorization

Reviewed 2026-10-14. No resource, token, bucket, DNS record or deployment was created. Disposable Supabase GitHub CI remains the default for automated Auth/PG/Storage verification. This proposal is only for the separate staged rollout and actual private R2 application-delivery gates.

## Specifications and comparison

| | A: on-demand temporary environment (recommended for one verification window) | B: earlier separated self-hosted setup |
| --- | --- | --- |
| Existing account/provider | Fly account, separate staging-only app; Cloudflare account, new private test bucket | Same accounts; separate staging frontend/API and Supabase apps; private test bucket |
| Region | Fly `iad` (Ashburn); R2 automatic location with North America hint, not a guaranteed region | Same |
| Machines | One performance-2x, 2 performance vCPU, 8GB RAM; prebuilt Next 15 + Express + real isolated Supabase services | App: shared-cpu-4x, 4 shared vCPU, 4GB RAM for Next/Express; Auth/DB: performance-2x, 2 performance vCPU, 8GB RAM |
| Disk | One 10GB dedicated disposable encrypted Fly volume | Two dedicated 10GB volumes |
| Lifetime | Four hours including setup/testing; destroy, not just stop | Comparison: four-hour test window OR 730-hour always-running month; neither authorized |
| Public exposure | None for web/API/Auth/PG/Studio; approved operator and runner access through short-lived WireGuard/tunnel only | Same private access; no production Vercel project, public Auth endpoints or public database |
| Test data | Synthetic users/files only; full fresh history and sanitized pre-upgrade history | Same |
| Capacity | Proposed, not measured. Prebuild outside VM; fail on memory pressure, request revised approval rather than increase size | Same: runtime capacity and multi-service image composition require validation |

Option A still self-hosts Supabase temporarily: it is not a new hosted Supabase project. B replaces the earlier unpriced Vercel staging frontend with Next on the isolated app machine for comparable, bounded compute pricing. Neither option is deployable today: the existing reviewed staging manifest expects separate Vercel/API/Auth identities. A private-combined topology requires a separately reviewed canonical admission extension and TLS/internal-origin design. The staging build work in this branch supports the earlier manifest only; it must not be mistaken for either option's isolation proof. Docker-in-Docker privileges and CLI development defaults are NOT an acceptable unattended staging host; prepare a reviewed multi-service image/init, private port binding and lifecycle before any approval.

## Estimated cost and bound (USD, excluding taxes/credits/account fees)

Rates checked against [Fly's October 1, 2026 update](https://fly.io/pricing-update/): performance-2x/4GB $0.0917/hour; additional RAM $6/GB-month; shared-cpu-4x/1GB $0.0122/hour; volumes $0.15/GB-month; North America egress $0.02/GB. Use 730 hours/month for estimates. No dedicated IPv4, snapshots or paid Vercel project is proposed.

- A compute: `0.0917 + 4*6/730 = $0.12458/hour`; 10GB volume prorated estimate `$0.00205/hour`; approximately `$0.12664/hour`. Four hours plus at most 1GB egress: approximately `$0.527` before R2. Conservatively charge a FULL month for the volume in the approval envelope: `$0.49834 + $1.50 + $0.02`.
- B compute: `0.12458 + 0.0122 + 3*6/730 = $0.16144/hour`; 20GB volume estimate `$0.00411/hour`; approximately `$0.16555/hour`. Four hours plus 1GB egress: approximately `$0.682` before R2. A 730-hour always-running month is approximately `$117.852 + $3 + $0.02 = $120.872` before R2.
- [R2 Standard pricing](https://developers.cloudflare.com/r2/pricing/) is $0.015/GB-month, $4.50/million Class A and $0.36/million Class B, rounded up by billing unit. Assume NO remaining account free tier. Limit this test to <=20MB retained, <=100 Class A, <=1000 Class B, no Infrequent Access/Workers. Conservative extra rounded units: `$0.015 + $4.50 + $0.36 = $4.875`; deletions are free. Existing account usage may already absorb those rounded units; this is not a promise of free service.
- Proposed four-hour approval ceiling: **A $7**, **B $9** (includes conservative full-month provisioned volumes, R2 rounding and 1GB egress; before tax/account minimums). B's 730-hour comparison ceiling: **$126** under the same operation/egress limits. GitHub Actions minutes, artifact storage and one-time image builds use existing account quotas and are excluded; their remaining quota is not verified.

These are conditional maximum estimates, NOT a provider-enforced spending cap. Before authorizing A, confirm account-specific regional price, usage/minimums and taxes; require a separate approved four-hour janitor plus a six-hour operator backstop. If a machine/volume/bucket remains allocated or test limits are exceeded, this bound is invalid. Stopping a machine does not delete paid volumes/rootfs. No autoscale, extra replicas or automatic capacity upgrade permitted.

## Required controls before provisioning

1. Record exact staging app IDs, volume IDs, private bucket identity, production resource denylist, reviewed SHA, isolation evidence and end timestamp. Require protected GitHub `Staging` environment approval; do not reuse Production/Preview secrets.
2. Ingress: PG, PostgREST, Auth admin, Studio, backend and frontend bind private interfaces only. WireGuard peers scoped to staging services; fixed approved operator/CI endpoints; short session lifetime. No public Fly service/ports, shared org-wide development peer or production peer access. If this cannot be independently restricted in the existing organization, stop and review a separate staging network/org—do not silently expose ports.
3. Egress: default deny; permit only reviewed staging inter-service origins and fixed Cloudflare S3/account-metadata endpoints/DNS/TLS necessities. No GitHub writes, AI providers, SMTP delivery, billing, webhooks, Composio, deploy APIs or production Supabase/R2. Mock mail remains local; no real mail credentials. Check actual calls, not only absent keys.
4. Credentials: per-run Supabase signing/API/service keys scoped to this DB; separate app-scoped Fly deploy/lifecycle token, explicit staging-only volume management, <=6-hour operator access; bucket-only R2 Object Read/Write (no production bucket), separate account-metadata read-only token, dedicated ephemeral file-link key. Metadata-read scope may cover the account: keep server-only and revoke after test. Exact platform TTL/scopes must be verified; if TTL cannot be restricted, schedule and confirm manual revocation. No organization-wide production key copying.
5. R2: r2.dev disabled, no custom domains, no production Workers binding, no public proxy. Runtime verifies metadata before object operations; still audit bindings independently. Canary operations remain approval-blocked. Existing public objects require a separate migration/revocation plan, not deletion here.
6. Teardown: stop new tests; collect only bounded redacted evidence/hashes; remove exact synthetic canary objects and confirm absence; revoke staging object/metadata/Fly/VPN/link keys; destroy exact reviewed machines/apps/volumes/snapshots and private bucket after confirming no non-test content; inspect resource list/billing afterward. Never recursive-delete a production namespace or follow a prefix-only match. Preserve evidence, not credentials/customer data.

Owner action later: approve **one** topology, exact SHA, four-hour window, cost envelope, isolated resource identities/scopes and synthetic PUT/DELETE test scope. That approval must not authorize production merge/deployment/migrations/KMS. For now finish credential-free code/CI; all creation/deployment/canary writes remain blocked.
