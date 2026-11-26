# Browser Operator release candidate, handover v4 (2026-11-20)

Source: `Xroga/xroga.com` branch `claude/ops-integrated-20261112`, build commit `77c7b32fd` (working tree clean at build). Private ZIP: `C:\xr-review-builds\xroga-browser-operator-staging-0.2.8-77c7b32fd.zip`,
SHA-256 `35AD5079C19E8927DBD8213B329C753064ACEE56C336DA9CBDE74F3397FABD73` (also in the `.sha256` file and `ARTIFACT-MANIFEST-77c7b32fd.json`, 35 files).

## What changed since v3
- Website Context Resolver (`site-context.ts`), reviewed declarative site actions (`site-actions.ts`), same-origin `/.well-known/agent-skills` discovery with digest check (`well-known-skills.ts`), opt-in online discovery (`online-skills.ts`). Skills and actions are optional help; nothing limits the model.
- Defects found by real Chromium + real DeepSeek and fixed: no canvas tool unless the model had vision (painted-canvas task 0/3 -> 3/3, 70-150 s -> 25-46 s); `expect.text` was case-sensitive; the first screenshot of a background tab waited 20 s (now 4 s first attempt, then 20 s); the coordinate-click error now points to the canvas tool.
- Announcement receipt now also names reviewed site actions for a recognised site.

## Verified (evidence level named)
| Item | Level | Evidence |
|---|---|---|
| Unit and component suite | UNIT VERIFIED | 1407 passed, 4 skipped, 151 files |
| Site actions in real browser layer | CHROME VERIFIED | scenario SITE-1: 3/3 (verified write clicks once, changed page refused before any click, wrong postcondition unverified, repeat refused, consequential never touches page) |
| Loop + real DeepSeek, real Chromium, real layer and gates | LIVE DEEPSEEK VERIFIED | 25/25 graded by page state: shuffled/late/overlaid form x3, slow list, painted canvas menu, timeline split, 3 injection attacks in ask and auto modes, payment handover, 2 public pages. Latency p50 13.1 s, p95 46.9 s; turns p50 3, p95 7. File `live-model/eval-real-chromium-20261120-b.json` |
| Site-published skill and site action choice | LIVE DEEPSEEK (simulated page) | find_skill then read_skill 3/3; site_action chosen 3/5 where a direct click was also possible, tasks completed either way |
| Upgrade from 91ecc8159 to this build | CHROME VERIFIED | same extension id, storage kept, worker alive, side panel loads |
| Bundle contains new features | checked | run_script_console, find_skill, menu_path, outline label present |

## Not done or not proven
- SkillsHub: the live endpoint answered HTTP 402 DEPLOYMENT_DISABLED (2026-11-20). The client is unit tested against the documented contract only and fails closed. THIRD-PARTY BLOCKED. Online discovery is off by default.
- Real owner-Chrome (signed-in, foreground) runs of this build were not repeated; evidence is Playwright Chromium with the real extension. Owner-browser Resume check still open.
- Timeline eval: state changed correctly (graded), but the model reported "partial" because painted clips gave no visible confirmation: honest but conservative.
- BrowserSkill's human-control guard (refuse an action if the person took the tab meanwhile) is a characterised gap, not built. Concurrent person input is not detected during a run.
- Professional workflows (Google Ads, Meta, Shopify): browser interaction path unchanged; API workers still need owner accounts and sandbox network policy. Not claimed working.
- 59 ledger rows remain at SOURCE/README level; deep source comparisons done for FSB, opensidekick (rejected), BrowserSkill (gap) in this pass.
- Independent security review, PR #997 re-attestation and production authorisation remain separate external gates.

## Install and rollback
Install: unzip the ZIP to a folder, `chrome://extensions`, Developer mode, Load unpacked (same extension id as before; storage persists). Rollback: unzip `...-91ecc8159.zip` over the same folder and reload; upgrade path in both directions keeps the id. Backend: staging tag `browser-op-1110` unchanged, no backend change in this pass.
