# Xroga – AI Swarm Operating System

AI Swarm OS: prompt → build → GitHub sticky repo → Vercel ship. Black Hole V∞ cores, honest token billing (Spark ~6.17M tokens/mo; free trial ~0.55M).

## Architecture

```
xroga/
├── frontend/          # Next.js 14 (App Router) – Vercel
├── backend/           # Express API – Fly.io
├── supabase/          # Database migrations
└── package.json       # Monorepo root
```

### Swarm loop

1. **Route** – Pick Black Hole V∞ core + optional live research (web + X)
2. **Convert / Architect / Build** – Generate or surgically patch code
3. **QA** – Validate output
4. **Ship** – Push sticky GitHub repo + deploy Vercel (OAuth required)

Connect **GitHub + Vercel** early (optional Supabase for auth/data). First successful ship remembers the repo; later prompts update the same live product.

## Billing honesty

- Metered in **tokens**, not legacy “actions”
- Spark: **~6.17M tokens/mo**, 2 concurrent
- Free trial: **~0.55M tokens**, 1 concurrent
- No emergency-token grants; upgrade for more pool

## Phase highlights

- [x] Next.js frontend + Express API + Supabase auth
- [x] SSE swarm stream + Phase 1 chat
- [x] Sticky GitHub repo after first ship
- [x] Live research via Xroga Live (web + X) with Tavily/SearXNG fallback
- [x] Model fallback transparency (shows which core actually ran)
- [x] Early OAuth ship preflight before long builds finish ship

See `/docs/platform` for model table and build steps.
