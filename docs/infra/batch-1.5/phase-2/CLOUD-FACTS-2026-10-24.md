# Read-only cloud facts (B-4), 2026-10-24

Established with already-connected, read-only access only: the Supabase and Cloudflare tools in this session (GET requests; no SQL, no write) and the GitHub API. No token or credential was printed or stored.
Nothing was modified. Items that need the Fly login are listed at the end.

## Established
| Checklist | Fact | How |
|---|---|---|
| A5 Supabase plan | Organization "Xroga AI" is on the **free** plan (`tier_free`). Free means no point-in-time recovery; backup retention is not exposed by the available tools, so the dashboard (Database, Backups) is the place to confirm what exists | `get_organization` |
| A5 projects | `xroga-ai` (production, `ap-northeast-1`, Postgres 17.6.1.121, `ACTIVE_HEALTHY`) and `Xroga LOGIN` (legacy, `ap-southeast-1`, **`INACTIVE`**, paused). No disposable project exists | `list_projects`, `get_project` |
| A5 isolation | PR code reaches no hosted database: the PR path of `supabase-migrate.yml` is offline; no `E2E_*` secret or variable exists; environments `Preview` and `Production` hold no secrets or variables of their own; 11 repository secrets, no Redis one | GitHub API |
| A1 Cloudflare account | one standard account; the connection authenticates as a user identity | `whoami`, `GET /accounts` |
| A1 R2 buckets | `xroga-assets`, `xroga-chat-archive`, `xroga-images`, `xroga-websites`, `xroga-drive-test` (Phase 1 test bucket, still present: its owner cleanup remains open) | `GET …/r2/buckets` |
| A1 public access | the `r2.dev` public domain is **enabled** on `xroga-chat-archive`, `xroga-images` and `xroga-websites`; disabled on `xroga-assets` and `xroga-drive-test`. No custom domains on any bucket | `GET …/domains/managed`, `…/domains/custom` |
| A1 CORS | none on the four legacy buckets; `xroga-drive-test` allows `http://localhost:3000` for GET, PUT, HEAD | `GET …/cors` |
| A1 usage | account-level R2 metrics report **0 objects and 0 bytes** in both storage classes (metrics can lag; treat as "very small or empty", not as proof of empty). That is inside any free allowance | `GET …/r2/metrics` |
| A4 Redis (partial) | no `REDIS_URL` repository secret; `fly.api.toml` sets none; the code uses Redis only when `REDIS_URL` is set; BullMQ has no consumer or producer; the only provider mention is Upstash in the capability registry | repository and GitHub API |
| A3 Fly (partial, from the repository) | app `xroga-api`, region `iad`, 1 GB VM, second app `xroga-sandbox` named in `XROGA_SANDBOX_FLY_APP` | `fly.api.toml` |

Findings worth acting on later (none was changed): public `r2.dev` access on `xroga-chat-archive` is risky for a bucket named as an archive of chats, even if it is empty today; the production database is on a plan with no PITR.

## Not established, and why
| Checklist | Missing | Blocked by | Exact next action |
|---|---|---|---|
| A3 Fly organization, machines, volumes, secret names | `fly status`, `fly volumes list`, `fly secrets list` for `xroga-api` (names only) and the organization | **no Fly session** (`flyctl auth whoami`: no access token) | you run `! flyctl auth login` in this session, then I run only those read-only commands |
| A4 Redis provider and persistence | whether `REDIS_URL` exists as a Fly runtime secret | the same Fly login (`fly secrets list`, names only); if absent, Redis is unused and A4 is closed | same login |
| A5 backups | Supabase backup schedule and retention | not exposed by the tools I have | you read the dashboard (Database, Backups) or tell me the plan's backup setting |
| A1 Cloudflare billing and per-bucket usage | subscription and plan | the connected token lacks billing read (`403 Authentication error`) | optional: a token with Billing Read, or a screenshot of the plan |
| A2 database counts | row counts, `pg_total_relation_size('swarm_runs')`, inline data URLs | requires production SQL, which this phase forbids | not needed for Phase 2; leave to a separately approved read-only export |
