# Browser Operator release handover (2026-11-20)

Owner review package. Staging only. No Chrome Web Store publish, no production change, no promotion. Independent security review and PR #997 re-attestation remain separate, unsigned release gates.

## 1. Artifact

| Item | Value |
|---|---|
| Source | branch `claude/ops-integrated-20261112` (draft PR #976), commit `f38b9e7cd8f22bd1fdb11b608e386cb0df43c2b7`, clean tree at build time |
| Private ZIP | `C:\xr-review-builds\xroga-browser-operator-staging-0.2.8-f38b9e7cd.zip` (1,136,343 bytes) |
| SHA-256 | `B351884C8384A36BC9E9542F500C88B6DD4848182B12EAEFDC23DCD0CCBBEEBD` (also in `...zip.sha256`) |
| Manifest | name "Xroga Browser Automation (Staging)", version 0.2.8, key present, host permission `https://*/*`, optional `notifications`, `downloads.open` |
| Installed copy | `C:\xr-review-builds\xroga-extension-staging-0ff582593`, mirrored from `dist` and hash-compared identical to it |
| Build | PowerShell, `npx wxt build` in `apps/xroga-browser-extension` with the staging WXT_* values (extension id `ogebkgkppocnjeojdbkiokcpeaenonop`, API origin `https://browser-op-1110---xroga-api-universal-staging-422lt7eujq-uk.a.run.app`, workspace `https://xrogaaicom-git-claude-live-run-943-20261110-xrogas-projects.vercel.app`, `WXT_PRODUCT_PERMISSIONS=1`) and `SWC_NATIVE_BINDING_CACHE` pointing at an owner-only folder (the default AppData cache ACL makes the SWC native module refuse to load) |

## 2. Compatible backend

* Cloud Run service `xroga-api-universal-staging`, region us-east4, project `project-c40d4821-e647-4fa2-92d`, tag `browser-op-1110` on revision `xroga-api-universal-staging-00146-wod` (created 2026-11-19 13:06 UTC, image digest `sha256:19a547eb1595e9a087251aa4806b29aac6ff05e1214d3d0b6620c066ee59605b`).
* The last backend source change is `16c9d82f0` (screenshots to the model, vision flag); the revision was created five minutes after it. Every extension change since is client side, so no backend redeploy is required for this ZIP.
* Workspace used for sign-in: the Vercel branch alias for `claude/live-run-943-20261110` (rebuilt today after the retention policy removed the deployment; marker commit `954bc8905`).

## 3. Install and reload

1. `chrome://extensions`, Developer mode, Load unpacked, choose the installed folder (or unzip the ZIP into an empty folder and choose that).
2. After replacing files, press Reload on the extension card. Do not use the On/Off switch as a reload.
3. Open the side panel, press Connect Xroga Workspace once (the workspace must be serving).

## 4. Rollback

* Extension: Load unpacked from `C:\xr-review-builds\xroga-extension-staging-0ff582593-before-a72abe` (the folder as it was before today's builds), or the earlier ZIP `xroga-browser-operator-staging-0.2.8-1d106c0f0.zip`. The extension id is unchanged because the key is the same.
* Backend: the previous staging revision `xroga-api-universal-staging-00145-git` can take the `browser-op-1110` tag back with `gcloud run services update-traffic ... --update-tags`. Nothing else depends on it.
* Workspace: no change to roll back.

## 5. Evidence matrix

Columns: implemented | unit | Chromium fixture | DeepSeek staging | real third party | independently reviewed | release.

| Capability | impl | unit | Chromium | DeepSeek staging | real 3rd party | indep. review | release |
|---|---|---|---|---|---|---|---|
| DOM/AX actions, fill_form, submit, readback | yes | yes | VAR-1 8/8 seeds | httpbin pizza form, 1 run, 21 s worked | httpbin.org | no | no |
| Tab adoption ("this open X tab"), adoption failure note | yes | yes | not in a fixture | form run adopted the tab | httpbin | no | no |
| Canvas click/drag/key/type, replace, body-focus keys | yes | yes | CV-1..3, TL-1 | TraceDraw trial 1 pass, trial 2 FAIL | TraceDraw | no | no |
| Evidence-based strategy selector + tracker order | yes | 11 + 5 tests | n/a | not observed live (no note visible in the panel) | n/a | no | no |
| Failure diagnosis (adapted from browser-agent), terminal stop | yes | 12 tests | n/a | not observed live | n/a | no | no |
| run_script_console + stale-Output guard | yes | 11 tests | not run in Chromium | model did not select it in 2 live runs | n/a | no | no |
| find_skill / read_skill, 12 bundled SKILL.md skills | yes | 9 tests | n/a | one live attempt interrupted by a service-worker restart: inconclusive | n/a | no | no |
| Service-worker restart recovery (Resume) | existing | existing | sw-kill fixtures | restart happened live; Resume not completed (window lost focus) | n/a | no | no |
| 58-repo ledger | yes | n/a | n/a | n/a | n/a | n/a | n/a |

## 6. Measured results (do not extrapolate)

| Workload | n | result | time |
|---|---|---|---|
| Public pizza form (httpbin) | 1 | pass, readback by the site echo | worked 21 s; about 80 s send to final text |
| TraceDraw A4 SVG | 2 | 1 pass (verifier exit 0), 1 fail (stopped at 8.5 min; stale Output, landscape flip, wrong menu) | about 4 min for the pass |
| Google Ads Help plan (skills) | 1 | interrupted by a service-worker restart | n/a |

No p50/p95, no cost per verified outcome and no before/after comparison exist yet. N is far too small to claim a rate.

## 7. Findings fixed during live testing

1. The product refuses localhost and IP tabs as start tabs by design (`browserTarget`), so live tests need public https pages.
2. The model does not choose `run_script_console` on its own; the stale-Output trap (a previous document's Output read as success) is now guarded in the tool.
3. Adoption failures were silent; the model is now told why.
4. Three unit test files sat outside `__tests__` and never ran; moved.
5. Unit test timeouts at 5 s appear under machine load (one test fails the same way on the committed baseline); they are load flakiness, not logic failures.

## 8. Real remaining blockers and gaps

* Independent security review and PR #997 re-attestation: external gates, not done.
* Official Google Ads, Meta and Shopify API workers: need the owner's authorized accounts and a sandbox network policy; the repository sandbox has no internet and no secrets, so these are BLOCKED, not stubbed.
* Not done: live observation of strategy notes, diagnosis directives and skill discovery; benchmark with enough runs; a real video editor and a second real canvas editor; slow-network and stale-ref fixture generation; upgrade/reinstall smoke test of the ZIP; Page Agent, agent-browser, Midscene, BrowserSkill and WebGenie source ports (studied only at metadata level, see `docs/xroga/OSS-REUSE-LEDGER.md`).
