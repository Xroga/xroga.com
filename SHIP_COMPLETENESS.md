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

## Core loop (real end-to-end)
| Path | Reality |
|------|---------|
| Prompt → LLM → GitHub → Vercel → follow-up patches | **Real** (needs OAuth + AI keys) |
| User vault → provision → Vercel env | **Real**; sync failures block `fullyShipped` and surface in PostBuild / Integrations toasts |
| Research (Grok / Tavily / SearXNG) | **Real** or honest skip |
| Chrome / Electron / Expo ship automation | **Real**; store approval is external |
| Free AI proxy inside user apps | **Not real** (retired; BYOK on the user’s Vercel) |
| Legacy `/chat` + `/api/v1` estimate/catalog chat | **Retired (410)** — no follow-ups, no ship; Workspace uses `/api/swarm/execute` only |

## Product categories the swarm builds (scaffolds)
| Category | Scaffold | Typical prompt |
|----------|----------|----------------|
| Website / landing | `static` or `nextjs` | “Build a landing page for …” |
| Chatbot site | `nextjs` + `/api/chat` (BYOK) | “Build a chatbot landing page …” |
| SaaS / dashboard | `nextjs` | “Build a SaaS dashboard with auth …” |
| Mobile | `expo` | “Build an Expo Android/iOS app …” |
| Chrome extension | `chrome` | “Build a Chrome MV3 extension …” |
| Desktop | `electron` | “Build an Electron desktop app …” |
| Feature packs | crypto / agent overlays on Next | Detected from prompt when relevant |

## Build time (honest — no wall-clock SLA)
There is **no fixed “old vs new minutes” timer** in product code. Economics (`/api/phase1/economics`) sizes builds by **tokens/cost**, not clock time:
| Tier | Approx tokens | Approx API $ | Example |
|------|---------------|--------------|---------|
| Simple | ~20k | ~$0.11 | Simple web / landing |
| Medium | ~150k | ~$0.81 | Full-stack SaaS |
| Complex | ~600k | ~$3.24 | Game / crypto platform |

Wall-clock depends on model latency, research, GitHub push, and Vercel deploy. A chatbot landing is usually **simple→medium**. **Old** simpleChat/`/chat` did not reliably ship or handle follow-ups; **new** swarm path applies SEARCH/REPLACE patches on the sticky repo for follow-ups.

## Safety hardenings (ship correctness)
- Patch apply is **all-or-nothing** (primary + recovery + QA) — never half-apply SEARCH/REPLACE onto a sticky live repo
- Non-web products (Chrome / Electron / Expo) **never** upload to Vercel
- Production vault encryption **refuses** the insecure `xroga-dev-key` fallback
- Sticky `default_repo` applies **only on updates**; New Terminal / greenfield never auto-bind the last product; `needsRepoPick` opens the chatbar picker

## What we can finish in code vs what stays external

| Gap | Who can do it | Status on this branch |
|-----|---------------|------------------------|
| Custom domain attach + DNS verify UI | **Agent / code** (Vercel Domains API) | **Done** — Publish → Web → Custom domain |
| Multi-product Update / New product | **Agent / code** | **Done** (launch-ready merge) |
| First-run checklist | **Agent / code** | **Done** |
| Platform ready gate | **Agent / code** | **Done** — Integrations + Analytics |
| Ship analytics (not vanity UI shell) | **Agent / code** | **Done** — `/dashboard/analytics` from real runs |
| Post-deploy smoke (`/` + health) | **Agent / code** | **Done** — shipVerify |
| Vault → Vercel env sync honesty | **Agent / code** | **Done** earlier (blocks fullyShipped) |
| Supabase OAuth / DB password friction | **Partial** — clearer UX; scopes/password still user/org | Improved messaging only where present |
| Generated app quality / deep E2E | **Partial** — smoke + health, not full Playwright product QA | Smoke only |
| Free AI inside user apps | **Product + cost** — was retired; can rebuild metered proxy later | **Not rebuilt** (BYOK stays) |
| Guaranteed App Store / Play / CWS public | **Impossible in code** — review + fees + first listing | External |
| Electron signed installers | **User certs + Actions** — we sync secrets; cannot invent CSC | External + Publish forms |
| Store “live” approval | **External** | External |

## Launch-ready product checklist (in code)
| Area | Status |
|------|--------|
| Ship reliability | Run `success` requires ship usable + no blockers; PostBuild warns (not green) when incomplete |
| Multi-product UX | Chatbar **Update current** / **New product** intent pills |
| Onboarding | Workspace **First ship checklist** (GitHub → Vercel → AI key → ship) |
| Observability | `shipOutcome` persisted on run output + run trace meta; Chats history shows ship badge |

## What Xroga automates (real APIs)
- Chrome: Google OAuth authorize (user’s client) or paste refresh token → CWS `upload` + `publish` + status check
- Electron: portable zip immediately + multi-OS Actions installers; sync `CSC_*` + Apple notarization secrets to GitHub Actions when provided
- Mobile: auto-link/create EAS project; sync Google Play JSON **and** App Store Connect API key into Expo via GraphQL; start build (+ submit when creds present); poll **new** artifact URL (ignores stale builds); list recent EAS builds + project picker in Publish
- Post-ship UI: CWS dashboard / installer / EAS artifact CTAs when those outcomes exist

## What Xroga cannot do (no fakes)
- Approve Chrome Web Store / App Store / Play listings
- Create first CWS listing metadata without dashboard (API limit)
- Create first Play app without Play Console (Google rule)
- Invent signing certificates or Apple/Google developer accounts

## User-paid
- CWS ~$5, Apple ~$99/yr, Play ~$25, EAS minutes, code-signing certs
