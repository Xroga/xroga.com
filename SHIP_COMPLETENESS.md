# Honest ship status

## Free-path “shipped” (enforced)
| Kind | Shipped when |
|------|----------------|
| Web | GitHub + live Vercel URL |
| Chrome | GitHub + `extension.zip` download URL |
| Electron | GitHub + **downloadable** desktop `.zip` on Releases (polls Actions up to ~7 min) |
| Expo | GitHub (Expo Go). If Expo token saved → auto EAS **build** (not store submit) |

## User-paid (guided, not faked)
- CWS ~$5, Apple/Google, EAS minutes, code signing
- Integrations UI: live connects only; Coming soon in a dropdown

## Quality
- Scaffold integrity restore if LLM empties entrypoints
- Structure validation blocks push
- Builder prompt forbids deleting critical scaffold files
