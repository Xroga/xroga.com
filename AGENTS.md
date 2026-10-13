# AGENTS.md

## Cursor Cloud specific instructions

Xroga is an npm-workspaces monorepo ("AI Swarm OS"):

- `frontend/` — Next.js 15.5.21 / React 18 / Tailwind 3 (App Router), dev server on port **3000**.
- `backend/` — Express API run via `tsx watch`, dev server on port **8080** (not 4000 as the README's endpoint table implies — `backend/src/index.ts` defaults to `PORT || 8080`).
- `supabase/` — SQL migrations only (no local DB needed to boot the app).

### Cloud environment config
- `.cursor/environment.json` — install script, terminals (backend + frontend), and ports 3000/8080.
- `.cursor/install.sh` — frozen workspace install: `npm ci` + create local example env files only if missing (API points to `http://localhost:8080`). Never overwrite existing env files.

Dependencies for both workspaces are installed from the root with `npm ci`. Canonical engineering toolchain: Node **22.21.1**, npm **10.9.4**, TypeScript **5.9.3** (`.node-version`, manifests and locks). Do not silently rewrite locks or use another package manager. Hosting metadata can differ; inspect `docs/xroga/runtime-contract.md` rather than migrating providers.

### Env files (not committed; recreate if missing)
The dev servers need local env files that are gitignored:
- `backend/.env` — copy from `backend/.env.example` (`cp backend/.env.example backend/.env`). The backend boots fine with the placeholder values; it only logs warnings for missing AI/image keys.
- `frontend/.env.local` — must set `NEXT_PUBLIC_API_URL=http://localhost:8080` so the frontend talks to the local backend. Copy from `frontend/.env.local.example` and override that value (the example points at the production Fly URL).

### Supabase user OAuth (production)
For “Authorize Supabase” (no paste), create an OAuth App under the Xroga Supabase org and set on Fly:
- `SUPABASE_OAUTH_CLIENT_ID`
- `SUPABASE_OAUTH_CLIENT_SECRET`
- `SUPABASE_OAUTH_CALLBACK_URL=https://xroga.com/dashboard/integrations/supabase/callback`

After the user authorizes, Xroga lists projects, fetches API keys, and runs SQL (`/database/query`) to create schema + AI memory tables + storage buckets on **their** project.

### Running
- Both together: `npm run dev` (concurrently runs frontend + backend).
- Individually: `npm run dev:frontend` / `npm run dev:backend`.
- Verify backend: `curl http://localhost:8080/health` → returns JSON with `status: "ok"`.
- Verify frontend: `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000` → `200`.

### Lint / test / build
- Lint: `npm run lint` (frontend only; passes with pre-existing warnings).
- Tests: `npm run test:resilience` (standalone node script, no server needed).
- Canonical credential-free regression: `npm run verify:baseline` in a clean isolated checkout; it refuses developer env files. Golden fixture browser: `node scripts/xroga/run-golden-browser.mjs` after a fixture frontend build. Existing authenticated E2E is independently mandatory, not replaced by stubs.
- Build: `npm run build --workspace=backend` (tsc) and `npm run build --workspace=frontend` (next build).

### Non-obvious caveats
- **No real secrets are required to boot in dev.** Boot/health is not successful auth, AI work, DB persistence or provider verification. Legacy `/chat` is retired; current chat/build paths use Phase 1, guest chat and Swarm. Missing configuration must produce truthful safe failure, never fake completion.
- Guest workspace can display planning conversation without authorizing repositories, uploads, publishing, integrations or durable account data. Preserve guest/auth cache isolation and the actual homepage handoff; do not reinstate the obsolete signup-only flow on the strength of this file's history.
- `backend/` depends on `playwright`; browser binaries are **not** needed just to boot the API (only for browser-automation features).

## Mandatory architecture invariants

1. **INV-01 — One canonical execution system.** Extend the actual reachable Swarm → pipeline → synthesis/SoftwareAgent integration. `taskGraphRunner.ts` is not proven the active runtime merely because it exists. Consult the current truth map/call paths.
2. **INV-02 — No second orchestrator by convenience.** A new scheduler/agent loop/control plane requires an explicit replacement/exception RFC, caller evidence and migration/rollback decision.
3. **INV-03 — Backend is authority.** Model text cannot grant permission, ownership, verified provider completion or accounting truth.
4. **INV-04 — Outcome-specific verification.** A complete result needs its approved acceptance criteria and independent evidence, not a 200 response, UI card or generated snippet.
5. **INV-05 — Explicit tenant identity.** Derive user/tenant scope from verified server identity and durable authorized ownership, never a request body or model output.
6. **INV-06 — Consequential authority.** Writes, deletion, communication, publishing, financial activity and sensitive egress need exact account/resource/action scope and the canonical approval boundary.
7. **INV-07 — Bounded cost.** Reserve and settle bounded provider/tool spend through authoritative accounting. Storage quota is separate; process memory is not durable budget truth.
8. **INV-08 — Protected secrets.** Credentials stay within protected server execution boundaries, not model/client props, public errors, logs or traces. No development encryption key in production.
9. **INV-09 — Durable evidence.** Long-running work must preserve owner/run/event/evidence state across browser/process interruption; do not claim local caches are durable storage.
10. **INV-10 — No fake completion.** Fixtures/simulation are labeled; BLOCKED_KNOWN_GAP is not PASS. Code-complete, verified-scope and independently live are distinct states.
11. **INV-11 — Relevant capabilities.** Choose tools from validated intent/data and current availability; no irrelevant app suggestions simply because a catalog entry exists.
12. **INV-12 — Small reversible changes.** Preserve unrelated work; bounded branch/commits, migration safety, tests, rollout, rollback and evidence are mandatory.

## Mission and release operating contract

Use `docs/xroga/{DEFINITION_OF_DONE,CHANGE_SAFETY,ARCHITECTURE_INVARIANTS,IMPLEMENTATION_STATUS}.md` and the PR evidence template. Record structured mission manifests in `docs/xroga/missions/`; run `node scripts/xroga/mission-check.mjs` and its positive/negative policy tests. Declare auth/tenant/approval/credential/egress/cost/billing and schema impact even when none. A replacement/new control plane needs a reviewed RFC; high-risk changes need a real rollback.

Do not suppress failures, focus tests, invent evidence, auto-grant roles or weaken protections. Isolated Supabase authenticated testing, fresh/upgrade DB and staged security proof remain required before security-sensitive release. Missing credentials are BLOCKED, not mocked as passing; continue independent safe work. Historical 119-item/72-mission reconciliation remains INACCESSIBLE_PENDING_EXPORT under the user's amendment and must not be claimed complete.

Founder preview access requires server-validated confirmed `hello@xroga.com`, server-owned owner role and AAL2. A hidden link/client toggle is not authorization. Existing admin/owner API access is broader and is not founder exclusivity; withheld diagnostics remain integration pending until separately enforced/tested.

Only use the confirmed existing GitHub/Vercel/Fly/Supabase release pathway. No DNS/provider migration, destructive DB operation, new charges, production test users or secret exposure. Merge/deploy only after mandatory gates and required approvals; a pushed SHA/build is not live proof. Keep a resumable tracker/checkpoint when external gates remain blocked.
