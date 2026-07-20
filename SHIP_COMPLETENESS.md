# Honest ship status

## Fully shipped (web only)
| Kind | `fullyShipped` when |
|------|---------------------|
| Web (static/nextjs) | GitHub + live Vercel URL verified |

## Handoff ready (not store-published)
| Kind | `handoffReady` when | Still missing |
|------|---------------------|---------------|
| Chrome | GitHub + `extension.zip` on Releases | Chrome Web Store publish (manual) |
| Electron | GitHub + downloadable unsigned `.zip` | Code signing / Mac/MS Store |
| Expo | GitHub push (Expo Go / source) | App Store / Play; EAS submit needs Expo/EAS setup |

## User-paid (guided, not faked)
- CWS ~$5, Apple/Google, EAS minutes, code signing
- Pasting Apple/Google credentials in Xroga ≠ automatic store submission
- EAS buttons **dispatch workflows**; they do not guarantee store approval

## Quality
- Scaffold integrity restore if LLM empties entrypoints
- Structure validation blocks push for web
- Chrome / Electron / Expo **skip compile** — treat as scaffolds + artifact handoff
- Builder prompt forbids deleting critical scaffold files
