# Honest ship status

## Fully shipped (Xroga’s side complete)
| Kind | `fullyShipped` when | Still external |
|------|---------------------|----------------|
| **Web** | Live Vercel URL verified **and** vault→Vercel env sync did not fail | — |
| **Chrome** | CWS upload + publish API succeeded | Google review / public listing |
| **Electron** | Real installer (`.exe` / `.AppImage` / `.dmg`) on Releases | Mac/MS Store listing; signing/notarization need your certs |
| **Expo** | EAS build finished with install/artifact URL | Apple/Google store approval after submit |

## Also tracked
| Flag | Meaning |
|------|---------|
| `handoffReady` | Free path usable (zip / source) even if store submit not done |
| `storeSubmitted` | CWS publish or EAS submit workflow started — **not** store approval |

## Workspace AI — live end-to-end (100% accurate)

### What users see (live path only)
| Step | UI | Notes |
|------|-----|--------|
| Empty / start | `ProductStartChips` | Labels: **Website · Chatbot · SaaS · Mobile · Extension · Desktop** |
| While building | `SwarmPhasePanel` → `XrogaAgentProcessingPanel` | Black Hole V branding, role bar, **real** todos + activity SSE lines, elapsed “thinking” — no rotating fake polish |
| Gates | GitHub / Vercel / repo-pick modals | Fired when SSE sets `needsGitHub` / `needsVercel` / client needs repo pick |
| Done (build) | `FeatureOutputView` → **`TerminalBuildReport`** | Terminal-native report: asked/update, change bullets, expandable file diffs, QA lines, GitHub + live links, status lines |
| Done (update) | Same report + optional `UpdateFileTrail` | Surgical SEARCH/REPLACE on sticky repo |
| Preview | `ProjectPreviewDock` | Sandbox `srcDoc` and/or live Vercel URL |
| Light Q&A (not a product build) | Phase 1 text reply | Routed by `shouldRouteToPhase1` → `POST /api/phase1/chat` |

**Not shown in the live message log:** old feature-catalog UI (deleted), `LandingPageCard` / `PostBuildDashboard` (removed — were dead), `HackathonBriefCard` (component may exist; **never mounted** in swarm log).

### API + planning (real)
1. **Frontend build:** `streamSwarmExecute` → `POST /api/swarm/execute` (SSE: start → progress → delta → complete)
2. **Backend:** `runBuildPipeline` in `backend/src/ai/pipeline.ts`
3. **Stages (functions, not marketing-only):** optional `gatherResearch` → `convertUserRequest` → `runArchitectPlan` → builder (`chatCompletion` / stream) → scaffold merge → `reviewBuildOutput` (QA) → security scan → `pushBuildToGitHub` → web: `deployToAllPlatforms` / non-web: Chrome zip · Electron zip/Actions · Expo EAS when tokens exist
4. **SSE progress agents** include tags such as `router`, `research`, `converter`, `architect`, `builder`, `reviewer`, `qa`, `compiler`, `security`, `deploy` (plus vision when attachments)
5. **Start marketing line** on execute: “Architect → Builder → Reviewer → Security → Deploy → Verify” (user-facing summary of the loop above)
6. **Outbound providers:** OpenRouter / Moonshot / Zhipu / xAI (Grok); research Grok live → Tavily → SearXNG; GitHub API; Vercel API; optional Expo / CWS
7. **Follow-ups:** incremental **SEARCH/REPLACE** (all-or-nothing) on sticky `default_repo` for updates — not a new fake chat product

### Product categories (`detectScaffoldKind` + feature packs)
| User intent | Scaffold | Ship surface | Honest limit |
|-------------|----------|--------------|--------------|
| Landing / simple site | `static` (or `nextjs` if prompt needs backend) | GitHub → Vercel | — |
| Chatbot site | `nextjs` + `/api/chat` | GitHub → Vercel | Chat in **user app** needs **BYOK** (no free Xroga proxy) |
| SaaS / dashboard / auth | `nextjs` | GitHub → Vercel | Quality varies; not a guaranteed production SaaS |
| Crypto / DeFi dashboard | `nextjs` + crypto pack | GitHub → Vercel | Markets UI / stubs — **no custody, no trading** |
| Automation / agent shell | `nextjs` + agent pack | GitHub → Vercel | Runner scaffold, not a hosted forever-agent |
| Hackathon prompts | usually `nextjs` / `static` | same as above | **Prompt-aware todos/research only** — no dedicated hackathon scaffold; brief card **not** in UI |
| Mobile | `expo` | GitHub (+ EAS if Expo token) | Store approval external |
| Chrome extension | `chrome` | GitHub Releases zip (+ CWS optional) | Store listing / review external |
| Desktop | `electron` | GitHub zip / Actions installers | Signing + store listing external |

### Build time (honest — no wall-clock SLA)
Economics (`GET /api/phase1/economics`) sizes by **tokens/cost**, not minutes:
| Tier | Approx tokens | Approx API $ | Example |
|------|---------------|--------------|---------|
| Simple | ~20k | ~$0.11 | Simple web / landing |
| Medium | ~150k | ~$0.81 | Full-stack / chatbot site |
| Complex | ~600k | ~$3.24 | Game / crypto platform |

Wall-clock = model latency + research + GitHub + Vercel/EAS. Elapsed UI counter ≠ ETA.

**Stall / progress fix:** Workspace to-dos used different IDs than the backend pipeline, so the UI could freeze on “Analyze…” while OpenRouter was still working. Frontend now bridges `convert`→`analyze`, `architect`→`plan`, `build`→`code-gen`, etc. Simple static landings skip the LLM Architect (deterministic plan). Architect LLM waits are capped at 45s then continue to builder. Role chips get `negotiationPhase` from each agent. Banners tell you to press **Stop** (waiting is not billed; client does not silently kill paid calls).

### Env sync honesty
Vault → Vercel failures **block `fullyShipped`**, surface in **Integrations toasts**, and appear on the live **TerminalBuildReport** as `Env sync · failed` / `Blocker · …` status lines when present on the run output.

### Retired (not product AI)
| Surface | Status |
|---------|--------|
| Legacy `/chat` simpleChat + client `streamChatMessage` | Removed from frontend; backend retired **410** |
| `/api/v1/estimate` + action-cost / 98-feature catalog UI | Removed |
| Free live-AI proxy inside user apps | Retired; BYOK only |
| Video studio / legacy image gen in message output | Honest “removed” copy |
| Store approval guarantees | Impossible in code |

## Core loop (summary)
| Path | Reality |
|------|---------|
| Prompt → LLM → GitHub → Vercel → follow-up patches | **Real** (needs OAuth + AI keys) |
| User vault → provision → Vercel env | **Real**; failures block `fullyShipped` + Integrations toasts |
| Research (Grok / Tavily / SearXNG) | **Real** or honest skip |
| Chrome / Electron / Expo ship automation | **Real**; store approval is external |
| Free AI proxy inside user apps | **Not real** (retired; BYOK) |
| Legacy `/chat` + catalog/estimate | **Retired** — Workspace builds use `/api/swarm/execute` only |

## Safety hardenings (ship correctness)
- Patch apply is **all-or-nothing** (primary + recovery + QA) — never half-apply SEARCH/REPLACE onto a sticky live repo
- Non-web products (Chrome / Electron / Expo) **never** upload to Vercel
- Production vault encryption **refuses** the insecure `xroga-dev-key` fallback
- Sticky `default_repo` applies **only on updates**; New Terminal / greenfield never auto-bind the last product; `needsRepoPick` opens the chatbar picker

## What we can finish in code vs what stays external

| Gap | Who can do it | Status |
|-----|---------------|--------|
| Custom domain attach + DNS verify UI | **Agent / code** | **Done** — Publish → Web → Custom domain |
| Multi-product Update / New product | **Agent / code** | **Done** |
| First-run checklist | **Agent / code** | **Done** |
| Platform ready gate | **Agent / code** | **Done** — Analytics (+ operator surfaces); user Integrations hide operator-only “Platform ready” where UX branch applies |
| Ship analytics | **Agent / code** | **Done** — `/dashboard/analytics` from real runs |
| Post-deploy smoke (`/` + health) | **Agent / code** | **Done** — shipVerify |
| Vault → Vercel env sync honesty | **Agent / code** | **Done** |
| Supabase OAuth / DB password friction | **Partial** | User/org scopes remain |
| Generated app quality / deep E2E | **Partial** | Smoke + health, not full product Playwright QA |
| Free AI inside user apps | **Not rebuilt** | BYOK stays |
| Guaranteed App Store / Play / CWS public | **External** | Review + fees + first listing |
| Electron signed installers | **User certs + Actions** | Cannot invent CSC |
| Store “live” approval | **External** | External |

## Launch-ready product checklist (in code)
| Area | Status |
|------|--------|
| Ship reliability | Run `success` requires ship usable + no blockers; incomplete ships are not falsely “all green” |
| Multi-product UX | Chatbar **Update current** / **New product** intent pills |
| Onboarding | Workspace **First ship checklist** (GitHub → Vercel → AI key → ship) |
| Observability | `shipOutcome` on run output + run trace meta; Chats history shows ship badge |

## What Xroga automates (real APIs)
- Chrome: Google OAuth authorize (user’s client) or paste refresh token → CWS `upload` + `publish` + status check
- Electron: portable zip immediately + multi-OS Actions installers; sync `CSC_*` + Apple notarization secrets to GitHub Actions when provided
- Mobile: auto-link/create EAS project; sync Google Play JSON **and** App Store Connect API key into Expo via GraphQL; start build (+ submit when creds present); poll **new** artifact URL (ignores stale builds); list recent EAS builds + project picker in Publish
- Post-ship: CWS / installer / EAS artifact URLs when those outcomes exist (Publish + run output fields)

## What Xroga cannot do (no fakes)
- Approve Chrome Web Store / App Store / Play listings
- Create first CWS listing metadata without dashboard (API limit)
- Create first Play app without Play Console (Google rule)
- Invent signing certificates or Apple/Google developer accounts
- Guarantee a fixed build wall-clock time
- Host free LLM chat inside the user’s shipped app (BYOK)

## User-paid
- CWS ~$5, Apple ~$99/yr, Play ~$25, EAS minutes, code-signing certs
