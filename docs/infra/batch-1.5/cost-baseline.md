# INFRA-001 · Cost baseline

**Measured additional spend by this work: $0.00.** No cloud resource was created, no paid API called, no Cloudflare/Fly/Oracle/Supabase account touched. All tests ran in the sandbox against a local PostgreSQL 16 and in-memory stores.

## Current monthly cost
`UNKNOWN`: no billing access to Fly, Vercel, Supabase, Cloudflare or Redis. Do not infer from list prices.

## R2 planning assumptions — UNVERIFIED (third-party sources, not Cloudflare's page)
Per [Filebase's 2026 R2 pricing summary](https://filebase.com/blog/cloudflare-r2-pricing-costs-savings-and-alternatives-in-2026/) and [Spendbase](https://www.spendbase.co/?p=35561): free allowance 10 GB-month, 1 M Class A, 10 M Class B per month; paid ≈ $0.015/GB-month, $4.50 per M Class A, $0.36 per M Class B; egress free.
These must be confirmed against the live Cloudflare dashboard/billing for the Xroga account **before any provider-backed test**; "free tier exists" is not "zero cost".

## Operation profile of this design (for later sizing)
| User action | R2 ops | Notes |
|---|---|---|
| single upload | 1 PUT (A) + 1 HEAD (B) + 1 range GET + 1 full GET (B) | the full GET is the SHA-256 read-back (egress free, still a Class B) |
| multipart upload of N parts | 1 create + N PUT + 1 list + 1 complete (A) + HEAD/GET (B) | |
| download | 0 server ops; browser GET (B) | |
| `reconcile()` | 1 HEAD per READY object checked | bounded by `limit` |
| migration copy | source LIST/HEAD/GET, destination PUT + HEAD + GET, verify GET | ~2–3 destination reads per object |

## Controls
Provider-backed tests are gated behind explicit operator-supplied, isolated test bucket credentials and a recorded confirmation that the account is inside its allowance (see `operator-checklist.md`). Budget alerts are not a guarantee of zero spend.
