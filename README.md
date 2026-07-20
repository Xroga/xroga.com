# Xroga — AI Swarm Operating System

**Prompt → product → your GitHub → live on your Vercel.**  
One model you meet: **XROGA Black Hole V∞**. Six specialist cores under one event horizon. No model picker. No orphan repos. Continuous Event Horizon updates.

> Others count up. We count forever.  
> The first and last model you will ever need.

---

## Why Xroga is the #1 coding agent

Most AI tools stop at chat. Xroga finishes the loop:

| Step | What happens |
|------|----------------|
| **1. Converter (Pulse)** | Your prompt becomes a precise builder brief |
| **2. Architect / Builder (Apex · Horizon · Forge)** | Real project files — not a toy snippet |
| **3. Live intel (Live)** | Web + X research when the brief needs current facts |
| **4. Lens** | PDFs, screenshots, docs folded into the same build |
| **5. Ship** | Push to **your** GitHub · deploy on **your** Vercel |
| **6. Sticky updates** | Later prompts patch the **same** live product |

You authorize **GitHub + Vercel** (optional **Supabase**). Code and deploys live on **your** accounts. First successful ship remembers the sticky repo — Workspace stays on one project thread forever.

---

## Black Hole V∞ — one model, six cores

You never pick a vendor model. Xroga routes specialist capacity inside Black Hole V∞:

| Core | Role | What it actually does |
|------|------|------------------------|
| **Apex** | Chief Architect | Flagship reasoning for complex full-stack, crypto, long-horizon coding — king-of-code depth on hard multi-file systems |
| **Horizon** | Project Engineer | Million-token context for whole-repo engineering, large refactors, project-scale continuity |
| **Forge** | Deep Executor | High-volume agent execution, knowledge work, shipping throughput |
| **Pulse** | Converter | Prompt → builder brief at speed; high-volume chat and routing |
| **Live** | Real-Time Intel | Native web + X (Twitter) firehose research — no separate X developer API |
| **Lens** | Document Mind | Files, PDFs, vision, multimodal backup context |

**Context window:** up to **1M tokens**.  
**Event Horizon updates** land new capability inside Black Hole V∞ on a continuous cadence — you never wait for a “next model” rename.

Built to compete at the frontier of coding agents: deep reasoning, long-context repos, volume execution, live research, and multimodal docs — presented as **one #1 coding agent**, not a vendor menu.

---

## Honest token billing

Metered in **tokens** (not legacy “actions”). Every plan unlocks the full feature set — you pay for **pool size + concurrency**.

| Plan | Price | Monthly tokens | Concurrent swarms |
|------|-------|----------------|-------------------|
| Free trial | $0 | **~0.55M** | 1 |
| **Spark** | $19 | **~6.17M** | 2 |
| **Pulse** | $29 | **~9.42M** | 8 |
| **Nova** | $49 | **~15.9M** | 12 |
| **Zenith** | $99 | **~32.2M** | 30 |
| **Singularity** | $999 | **~325M** | 100 |

Trial is tiny by design. Spark is the baseline monthly pool. Higher plans scale the same Black Hole cores — more tokens, more parallel work.

---

## Architecture

```
xroga/
├── frontend/    # Next.js 14 (App Router) — Vercel
├── backend/     # Express API — Fly.io
├── supabase/    # Auth + DB migrations
└── package.json # npm workspaces monorepo
```

### Dev

```bash
npm install
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local
# set NEXT_PUBLIC_API_URL=http://localhost:8080
npm run dev
```

- Frontend: http://localhost:3000  
- Backend health: `curl http://localhost:8080/health`

### Lint / test / build

```bash
npm run lint
npm run test:resilience
npm run build --workspace=backend
npm run build --workspace=frontend
```

---

## Ship loop (what users actually get)

1. Describe the product in Workspace (site, SaaS, crypto dashboard, agent…).
2. Connect GitHub + Vercel early (preflight before a long build fails at ship).
3. Swarm builds → Workspace preview → push sticky repo → live domain.
4. Follow-ups update themes, auth, pages on the **same** repo — continuous polish.

Optional Supabase for auth/data in generated apps. Secrets stay in your vault.

---

## Research that is honest

- Preferred: **Xroga Live** — Grok-native live search (**web + X**) when keys are configured.  
- Fallback: Tavily → SearXNG.  
- If nothing returns, research is **skipped** — the UI does not fake a “researched” step.

---

## Docs & product surface

- Platform model table & build steps: `/docs/platform`  
- Pricing: `/pricing`  
- API overview: `/docs/api`  
- Homepage Black Hole section includes a **plan changer** so you can see token pools and core capacity for Spark → Singularity — not only the $19 baseline.

---

## Brand promise

**XROGA Black Hole V∞** — One model. Infinite updates.  
Event Horizon Update · July 2026

*Only Allah is Eternal | We are just seekers.*
