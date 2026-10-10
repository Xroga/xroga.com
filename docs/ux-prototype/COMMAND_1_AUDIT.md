# Command 1 baseline audit — 2026-10-10

## Repository and release

- Clean `main` at `36b74d62` before work; implementation branch `feat/xroga-os-command-1-preview`.
- npm workspaces: `frontend` (Next.js 15.5.21, React 18, Tailwind 3.4, Zustand 5, Lucide, Motion, Recharts, TanStack) and `backend`. Root Playwright dev dependency 1.62.0.
- `vercel.json` builds only `frontend`; Git-linked preview deploys arise from feature-branch pushes. Production is `main` and requires the existing review/release controls. No Cloudflare or Cloud Run migration is in scope.
- CI: `vercel-build-check.yml` runs frontend lint/build; `unit-tests.yml` runs both suites. Existing frontend lint emits warnings in unrelated components (observed before Command 1). Prior production release `36b74d62` returned HTTP 200 from `/api/release`.

## UX contracts retained

- `/workspace` is a deliberate guest-capable product surface; nested workspace paths are protected. `/dashboard` and `/settings` allow guest browsing but backend mutations remain authenticated. Unknown document paths reach Next routing rather than a blanket login redirect.
- `TerminalChatContext`, canonical `terminalEventAdapter`, SSE transport, project workspace Zustand store, preview dock, approvals, delivery evidence, and `WorkspaceAuthGate` remain untouched. The new simulator is isolated and never calls their APIs.
- Four body themes use existing `--foreground`, `--card`, `--card-border`, `--muted`, and `--primary` tokens. The preview styles are namespaced; no global theme reset.
- Public marketing navigation is `PublicMarketingHeader` / `publicMarketing.ts`; workspace navigation is `Sidebar.tsx`. Command 1 adds an explicit preview entry without replacing either.

## Auth and security findings

- `frontend/src/lib/supabase/routeAccess.ts` is a protected-prefix list. `/os-preview/founder` must be added there explicitly; `/os-preview` stays public.
- Existing `/admin` server page calls `auth.getUser()` then `current_community_role()` and allows `admin` **or** `owner`. Backend `adminMiddleware` also allows both. Thus `/api/admin/errors` is **not founder-exclusive**. Existing operations endpoints require independent review. Neither endpoint will be called by Command 1's public preview or founder shell.
- `current_community_role()` is an authenticated RPC backed by `profiles.role`; the migration revokes it from `anon`. It is usable as a server-backed owner check, but identity, verified email, and current AAL2 must be checked separately on each founder request. Do not infer security from a hidden link.
- Existing `SecuritySettingsPanel` has Supabase MFA enrollment. Command 1 requires AAL2 for the founder shell, failing closed if unavailable.
- Existing shell error boundary logs `error.message`/`error.stack` in the browser console; not changed in this scoped command. The new preview boundary will not repeat raw error strings in its UI.

## Route map and conflict check

- Existing App Router has marketing (`/`, features, docs, showcase, research), guest workspace (`/workspace`), guest-browse dashboard/settings, protected admin/onboarding and auth routes, plus protected APIs. `/os-preview` has no existing page or redirect collision.
- Existing robots disallows `/admin`, `/dashboard`, `/workspace`, `/api`; add `/os-preview/founder`. Preview surfaces get `noindex` metadata while remaining directly accessible.
- No migrations, production keys, account roles, billing records, connected-service sessions, or backend admin permissions are changed.

## Baseline defects not caused by Command 1

- Existing admin UI is broader than founder-only and reads admin errors/readiness client-side. This command does not relabel it as founder secure.
- Frontend lint has pre-existing unrelated warnings. Exact post-change check outcomes appear in `DEPLOYMENT_REPORT.md`.
