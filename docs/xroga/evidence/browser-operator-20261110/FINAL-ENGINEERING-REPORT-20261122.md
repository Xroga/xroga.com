# Browser Operator: final engineering report (2026-11-22)

Xroga is universal in architecture, but coverage is measured task by task. A capability is not complete until its real behaviour is proven. Everything below is what was measured; "not run" means not run.

## Source
Branch `claude/ops-integrated-20261112` (PR #976, draft). Main merged in (60 commits). Detailed per-round evidence, commands and files: `RELEASE-HANDOVER-20261121-v8.md` and the `live-model/` folder. Latest source-matched ZIPs and hashes are in the build addenda of that file.

## Model capability (DeepSeek v4.1 flash 1017 through Zurelay)
- Provider accepts exactly `none`, `high`, `max` for this model (anything else: 400 naming those three; `low` and `medium` are silently answered as `high`, so they are not offered).
- Backend turn route now owns a per-effort policy (output room, spend ceiling, timeout), default `high`, rollback `XROGA_BROWSER_REASONING_DEFAULT`. The extension asks for `max` when the progress tracker calls a stall and relaxes after four turns of progress.
- Proven through the product chain on a no-traffic staging revision (real extension, enrolled device, 50 sampled turns at `high`, reasoning tokens recorded). The staging tag `browser-op-1110` now serves that image. `max` through the product chain was not exercised (no stall happened); `max` was run in the direct-provider comparison.
- Reasoning-text replay with tool results is not required by this gateway (200 with and without, one probe each at `high` and `max`); schema accepts it if that changes.
- Direct-provider A/B (none / high / max, 31 tasks per arm, timeouts counted as failures): passed 28 / 25 / 28; p50 wall about 31-45 s / 35-75 s / 39-59 s. High and max did not raise completion on this suite and cost 15-27% more time at p50. Shipped as default because the founder directive says so; one setting reverts it.
- Not tested: a prompt over 32k tokens, a reconnect in the middle of a `max` turn, billed cost per arm.

## Donor work (actual code, pinned SHAs, highest verified status)
| Donor | Ported into Xroga | Status |
|---|---|---|
| uiuing/browser-agent (MIT) `page/verify.ts` | `expect.count.delta`, whitespace-insensitive text check | CHROME_VERIFIED |
| fullselfbrowsing/FSB (MIT) trigger conditions | `wait` on what an element reads (equals, contains, regex, above, below, changed) | LIVE_DEEPSEEK_VERIFIED (no gain over the previous code) |
| esterhuizen/opensidekick (MIT) read_console, read_network | `diagnostics` tool and request status in every action receipt | LIVE_DEEPSEEK_VERIFIED |
| Tencent/BrowserSkill (MIT) cooperation-capture | one-to-one input attribution, zoom-corrected coordinates in the human-control guard | CHROME_VERIFIED (HUM-1, HUM-2) |
| alibaba/page-agent | none (real input needs no synthetic-event patches) | ALREADY_COVERED |
| browser-use/workflow-use (AGPL) | not read for code | REJECTED for code |
Other rows of the 72-repository ledger remain at their earlier statuses; no row was raised without code and a test.
Own fixes found by the new acceptance fixtures (not donor code): native date and time inputs shown once (calendar tasks 1/6 to 6/6), page-made (blob) downloads captured so a file can be handed to another site (0/5 to 4/4), SkillsHub refusal cooldown.

## Quality (real model, graded by the page's or server's own state)
Categories with at least two graded variants: fast read, forms (shuffled, delayed, overlays, zoom, RTL), research and multi-page, CRM, ads draft (search style and social style, nothing published), e-commerce variants, database admin, spreadsheet, email draft, code UI, wiki, calendar, native date inputs, painted-menu canvas, timeline, novel interface (right-to-left, shadow DOM, iframe Save), deceptive "Saved!" with a 404, cross-app file transfer, workspace the account does not belong to (refused 6/6), two-step sign-in (no code typed 6/6), boundary and injection pages. Per-run results with sample sizes are in the handover and `live-model/`. Known failing: TraceDraw (one recorded run, 47 turns), the timeline-split fixture (0 of 3 in the hard set), painted-menu seed 4 (timed out at 200 s in the none and max arms, and with high a second seed too). False success: the receipt now carries request status; no false success was observed in the graded runs. Duplicate writes: none observed (file transfer: exactly one post per run).

## Speed and cost
Simple product-chain tasks 34 s (5 turns); provider turn 3-8 s with an image. Hard-category suite new code 10/10 (p50 37.5 s) against 9/10 for the previous code (n=10). Billed cost per arm: not measured.

## Workers (real DeepSeek, independent three-step pages, one writer per tab)
| Pages | Workers | Single agent | Notes |
|---|---|---|---|
| 4 | 84-152 s (4 slots) | 127-167 s | default 3 slots was not faster |
| 8 | 208 s | 115 s | workers slower |
| 12 | 134 s | 174 s | 12 active at once, 12/12 |
| 20 | 89, 147, 210, 234 s | 175 s | 20 active at once, 20/20 four times; one run opened 26 worker windows for 20 tasks |
Conclusion: concurrency works up to 20, but is not reliably faster; the per-run ceiling stays 12 and the model chooses single-agent for ordinary jobs. No provider 429s were seen. Cancellation and one-writer-per-tab are covered by the existing worker tests and the `parallel-bench` check; a window closed mid-run fails only that worker.

## Blockers
Self-resolved: SkillsHub 402 (cooldown and fallback to local skills and general tools), blob downloads, date inputs, PR conflicts. Needs the owner: real Google Ads, Meta, Shopify and Drive accounts and a signed-in owner-Chrome run; the independent security review and PR #997 re-attestation; production authorisation and the production vision flag. Passwords and codes stay the person's step (the product never types them).

## Security
Human-control guard (one-to-one input attribution) passes HUM-1 and HUM-2; backend route tests refuse another account on session, run, turn, finish, resume, extend and probe; page-injection tasks keep the attack from completing; the blob hook stores nothing outside extension memory and sends nothing; effort and spend ceilings are set by the server, not the client. Not run: two signed-in users in parallel through Chrome, a skill with a correct digest that tells the agent to ignore its permissions, a worker killed in the middle of a real-model run.

## Release
Staging only. Source-matched ZIPs with SHA-256, manifests and upgrade tests are listed in the build addenda. Staging backend tag `browser-op-1110` serves the high/max image (rollback: retag to revision 00146-wod). Production is not live with any of this.
