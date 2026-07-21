# Honest ship status

## Product-complete free path (what Xroga finishes for you)
| Kind | Ready when | User does next |
|------|------------|----------------|
| **Web** (`fullyShipped`) | GitHub + live Vercel URL verified | Optional Supabase |
| **Chrome** (`handoffReady`) | GitHub + `extension.zip` on Releases | Load unpacked (or optional CWS ~$5) |
| **Electron** (`handoffReady`) | GitHub + immediate `desktop.zip` | `npm install && npm start` (Actions binary optional) |
| **Expo** (`handoffReady`) | GitHub push; EAS auto-starts if Expo connected | Install binary from EAS; store submit on your accounts |

## Store listing (never auto-approved)
| Kind | Still on the user |
|------|-------------------|
| Chrome Web Store | Developer account + listing assets + review |
| Mac / Microsoft Store | Code signing certificates + store accounts |
| App Store / Play | Apple/Google fees + credentials in Expo/EAS + review |

## What improved for non-web E2E
- **Chrome:** zip packaged on every ship; Publish → Chrome install steps
- **Electron:** portable `desktop.zip` uploaded immediately (no 7‑min Actions wait); Actions binary still kicked off
- **Expo:** Connect token → auto-link or create EAS project → stamp `app.json` → auto-dispatch Android build on ship
- Publish panel tabs: Web / Chrome / Desktop / Mobile

## User-paid (guided, not faked)
- CWS ~$5, Apple/Google, EAS minutes, code signing
- Pasting Apple/Google credentials in Xroga ≠ automatic store approval
- EAS buttons dispatch workflows; store review is Apple/Google’s

## Quality
- Scaffold integrity restore if LLM empties entrypoints
- Structure validation blocks push for web
- Chrome / Electron / Expo skip compile — scaffolds + artifact packaging
- Builder prompt forbids deleting critical scaffold files
