# Honest ship status

## Fully shipped (Xroga’s side complete)
| Kind | `fullyShipped` when | Still external |
|------|---------------------|----------------|
| **Web** | Live Vercel URL verified | — |
| **Chrome** | CWS upload + publish API succeeded | Google review / public listing |
| **Electron** | Real installer (`.exe` / `.AppImage` / `.dmg`) on Releases | Mac/MS Store listing; signing/notarization need your certs |
| **Expo** | EAS build finished with install/artifact URL | Apple/Google store approval after submit |

## Also tracked
| Flag | Meaning |
|------|---------|
| `handoffReady` | Free path usable (zip / source) even if store submit not done |
| `storeSubmitted` | CWS publish or EAS submit workflow started — **not** store approval |

## What Xroga automates (real APIs)
- Chrome: Google OAuth authorize (user’s client) or paste refresh token → CWS `upload` + `publish` + status check
- Electron: portable zip immediately + multi-OS Actions installers; sync `CSC_*` + Apple notarization secrets to GitHub Actions when provided
- Mobile: auto-link/create EAS project; sync Google Play JSON **and** App Store Connect API key into Expo via GraphQL; start build (+ submit when creds present); poll artifact URL; list recent EAS builds in Publish

## What Xroga cannot do (no fakes)
- Approve Chrome Web Store / App Store / Play listings
- Create first CWS listing metadata without dashboard (API limit)
- Create first Play app without Play Console (Google rule)
- Invent signing certificates or Apple/Google developer accounts

## User-paid
- CWS ~$5, Apple ~$99/yr, Play ~$25, EAS minutes, code-signing certs
