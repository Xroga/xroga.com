# Ship completeness — coding-agent loops

Branch: `cursor/complete-ship-loops-a9a2`

## Closed loops (agent finishes free path)

| Product | Free path Xroga completes | User-paid (documented) |
|---------|---------------------------|-------------------------|
| **Web** (static / Next) | Build → sticky GitHub → Vercel (+ optional Supabase) | — |
| **Chrome MV3** | Build → GitHub → `extension.zip` on Releases | CWS ~$5 |
| **Electron desktop** | Build → GitHub → tag / Actions release workflow | Code signing / stores |
| **Expo mobile** | Build → GitHub (+ preview page) | EAS / Apple / Google via **your** Expo token |

## Intentionally not productized
- Image / video studios, browser-automation farms
- Paying store fees or holding signing certs for users
- Managed always-on bot farm
- True Expo OAuth (user robot/access token only)

## Key wiring
- `compileValidate` skips Chrome / Electron / Expo (no false tsc block)
- Vercel deploy for non-web = preview story page only (incl. Expo)
- `nonWebShip.ts` — Chrome zip upload + Electron release trigger
- Ship blockers: Vercel required for web only
