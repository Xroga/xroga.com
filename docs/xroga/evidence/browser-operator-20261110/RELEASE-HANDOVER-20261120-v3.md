# Browser Operator release handover v3 (2026-11-20), supersedes v2

Staging only. No Chrome Web Store publish, no production change. Independent security review, PR #997 re-attestation and production authorization are separate external gates and are NOT done.

## 1. Artifact (source-matched)

| Item | Value |
|---|---|
| Source | `Xroga/xroga.com` branch `claude/ops-integrated-20261112`, commit `91ecc81590c71af7fd8859bb271d7405a4ce117d`, working tree clean at build time |
| ZIP | `C:\xr-review-builds\xroga-browser-operator-staging-0.2.8-91ecc8159.zip` |
| SHA-256 | `FD621835B6B65C8504F497B3FF825DB759FCC036CA4E2F2F671C5742AC77036F` (also in `...zip.sha256`) |
| Manifest | `ARTIFACT-MANIFEST-91ecc8159.json`: source commit, build environment, backend revision, ZIP hash, path/size/SHA-256 of all 35 files |
| Bundle check | contains `run_script_console`, `find_skill`, `menu_path` and the attached-outline label |
| Installed copy | `C:\xr-review-builds\xroga-extension-staging-0ff582593`, mirrored from `dist`, hash-compared identical |
| Backend | `xroga-api-universal-staging` us-east4, tag `browser-op-1110` on `xroga-api-universal-staging-00146-wod`, image `sha256:19a547eb…59605b`; last backend source change `16c9d82f0` (client-only changes since) |

Commits after `91ecc8159` that touch only docs do not change the extension code.

## 2. Install, upgrade, rollback
* Install: `chrome://extensions`, Developer mode, Load unpacked (installed folder or unzipped ZIP). After replacing files press Reload on the card; the On/Off switch is not a reload.
* Upgrade smoke test (`live/upgrade-smoke.cjs`, real Chromium, persistent profile): previous build installed, value stored, folder replaced by this build, same profile relaunched. Same extension id, stored value kept, service worker alive, side panel loads. Not exercised: a version-number change (both 0.2.8), Web Store update, a signed-in session.
* Rollback: Load unpacked from `C:\xr-review-builds\xroga-extension-staging-0ff582593-before-a72abe` or the ZIP `xroga-browser-operator-staging-0.2.8-1d106c0f0.zip` (same key and id). Backend: move tag `browser-op-1110` to `xroga-api-universal-staging-00145-git`.

## 3. Principle enforced in code this stretch (owner directive: no artificial limits)
* The progress tracker never ends a run; an exhausted strategy ladder starts a fresh round with a "look again from scratch" instruction, and after three rounds asks whether something outside the run is the real blocker.
* The docs-first script gate and the bound-tab search refusal are advisories (a note, or the same call allowed on retry), not refusals.
* Ceilings raised: console program 6,000 to 200,000 characters, batch steps 40 to 120, batch operations 200 to 1,000, repeat 50 to 200.
* The system prompt states that skills, playbooks and named sites are help, not limits, and tells the model never to call a task unsupported for lack of a playbook. `find_skill` says the same.
* Remaining limits are authorization, approvals, safety and budget only.

## 4. Evidence by capability
Legend: U unit, C Chromium fixture, D real DeepSeek on a SIMULATED page, L real browser with real DeepSeek, T real third party.

| Capability | Result |
|---|---|
| Unfamiliar application with no matching skill | D 5/5: acted at once, no refusal, "Create invoice" clicked exactly once |
| Skill discovery | D 3/3 `find_skill` then `read_skill` on the first turn |
| `menu_path` (whole menu path in one call) | D 5/5 adopted, turn 2 or 3 in four runs; the earlier `openPath` parameter 0/4 |
| `run_script_console` | D 3/3 chosen once targets are refs; programs ran; 3/4 "All phases passed" in the latest 4 |
| Time to first useful action after the outline label | D p50 10.3 s to 3.9 s, p95 21.2 s to 5.6 s, 10 runs each |
| Strategy note reaches the run context | D 11/11 |
| Failure-diagnosis directive | D 0/11 fired: the model recovers from the layer's own error text; insurance only |
| Canvas `expect` (wrong menu) | U 3 tests; not observed live |
| Stale references | C STALE-1 3/3 (stale ref refused with `NODE_DETACHED`, nothing clicked, fresh snapshot then role/name click once) |
| Slow network | C NET-1 pass (short wait times out with no action; long wait then click once) |
| Controls without roles (10 kinds incl. shadow DOM, SVG) | C ZOO-1 10/10 |
| Layout variants, timeline, canvas, wrong menu, prefilled editor | C VAR-1 8/8 seeds, TL-1, CV-1..3 pass |
| Service-worker restart | C 11/11 runs whose kill was proven real (a marker in worker memory was gone) recovered and finished: 4 idle, 7 under 8 CPU burners. The earlier intermittent failures happened before the harness proved kills (most "kills" had not restarted the worker) and did not reproduce; their cause is unresolved. Resume in the owner's own browser is unverified. Offline and tab-close modes pass. |
| Real public form (httpbin) | L 1 run: pass, 21 s of work |
| TraceDraw | L 1 pass (about 4 min), 1 fail |
| Upgrade in place | C smoke pass |
| Unit suite | 1364 passed, 4 skipped (145 files). Three failures in one full run coincided with lingering Chromium processes and passed alone and in the next two full runs |

## 5. Regressions found and fixed by my own changes this stretch
A person-needed failure ended a run, which broke the handover flow (fixed `ee80c4516`); a prompt-sized calibration in an overflow test and a compaction test assumption (updated with measured reasons); the kill-test harness reported passes for runs whose worker was never restarted (now proves restarts).

## 6. Not done (engineering) and blocked (external)
Engineering: Resume check in the owner's browser after a restart; live-browser (not simulated) observation of canvas `expect` and the diagnosis directive; real-page p50/p95 and cost per verified outcome; a real video editor and second real canvas editor; Midscene, BrowserSkill, WebGenie, Stagehand, Browser Use and OpenBrowse source-level comparisons (only Page Agent has a behavior comparison); executable Ads, Meta and Shopify browser workflows (skills are method and documentation, availability-aware, not verified on real accounts); the model still re-verifies for several turns after submitting.
External: independent security review; PR #997 re-attestation; production authorization; owner accounts and a sandbox network policy for the official Google Ads, Meta and Shopify API workers (not stubbed).
