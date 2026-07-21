# Honest ship status

## Fully shipped (Xroga’s side complete)
| Kind | `fullyShipped` when | Still external |
|------|---------------------|----------------|
| **Web** | Live Vercel URL verified | — |
| **Chrome** | CWS upload + publish API succeeded | Google review / public listing |
| **Electron** | Real installer (`.exe` / `.AppImage` / `.dmg`) on Releases | Mac/MS Store listing; signing needs your CSC cert |
| **Expo** | EAS build finished with install/artifact URL | Apple/Google store approval after submit |

## Also tracked
| Flag | Meaning |
|------|---------|
| `handoffReady` | Free path usable (zip / source) even if store submit not done |
| `storeSubmitted` | CWS publish or EAS submit workflow started — **not** store approval |

## What Xroga automates (real APIs)
- Chrome: package zip → CWS `upload` + `publish` when OAuth creds saved
- Electron: portable zip immediately + multi-OS Actions installers; sync `CSC_*` secrets when provided
- Mobile: auto-link/create EAS project, sync Google Play JSON into Expo, start build (+ submit if Play JSON present), poll artifact URL

## What Xroga cannot do (no fakes)
- Approve Chrome Web Store / App Store / Play listings
- Create first CWS listing metadata without dashboard (API limit)
- Create first Play app without Play Console (Google rule)
- Invent signing certificates or Apple/Google developer accounts

## User-paid
- CWS ~$5, Apple ~$99/yr, Play ~$25, EAS minutes, code-signing certs
