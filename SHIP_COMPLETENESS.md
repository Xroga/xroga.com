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

## Safety hardenings (ship correctness)
- Patch apply is **all-or-nothing** (primary + recovery + QA) — never half-apply SEARCH/REPLACE onto a sticky live repo
- Non-web products (Chrome / Electron / Expo) **never** upload to Vercel
- Production vault encryption **refuses** the insecure `xroga-dev-key` fallback
- Sticky `default_repo` applies **only on updates**; New Terminal / greenfield never auto-bind the last product; `needsRepoPick` opens the chatbar picker

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
