# AGENTS.md

## Cursor Cloud specific instructions

Xroga is an npm-workspaces monorepo ("AI Swarm OS"):

- `frontend/` — Next.js 14 (App Router), dev server on port **3000**.
- `backend/` — Express API run via `tsx watch`, dev server on port **8080** (not 4000 as the README's endpoint table implies — `backend/src/index.ts` defaults to `PORT || 8080`).
- `supabase/` — SQL migrations only (no local DB needed to boot the app).

Dependencies for both workspaces are installed from the repo root with a single `npm install` (handled by the startup update script). Package manager is **npm** (root `package-lock.json`).

### Env files (not committed; recreate if missing)
The dev servers need local env files that are gitignored:
- `backend/.env` — copy from `backend/.env.example` (`cp backend/.env.example backend/.env`). The backend boots fine with the placeholder values; it only logs warnings for missing AI/image keys.
- `frontend/.env.local` — must set `NEXT_PUBLIC_API_URL=http://localhost:8080` so the frontend talks to the local backend. Copy from `frontend/.env.local.example` and override that value (the example points at the production Fly URL).

### Running
- Both together: `npm run dev` (concurrently runs frontend + backend).
- Individually: `npm run dev:frontend` / `npm run dev:backend`.
- Verify backend: `curl http://localhost:8080/health` → returns JSON with `status: "ok"`.

### Lint / test / build
- Lint: `npm run lint` (frontend only; passes with pre-existing warnings).
- Tests: `npm run test:resilience` (standalone node script, no server needed).
- Build: `npm run build --workspace=backend` (tsc) and `npm run build --workspace=frontend` (next build).

### Non-obvious caveats
- **No real secrets are required to run in dev.** The app runs without valid Supabase/AI keys, but any flow that hits real auth, chat (`/chat` requires `OPENAI_API_KEY` + a real Supabase service-role key), or DB will not complete — expect graceful 503s / fallback messages, not crashes.
- The homepage chatbar does **not** call the AI directly: it stashes the prompt in `localStorage` and routes unauthenticated users to `/auth/signup`. This is the intended core entry flow and works without secrets.
- `backend/` depends on `playwright`; browser binaries are **not** needed just to boot the API (only for browser-automation features).
