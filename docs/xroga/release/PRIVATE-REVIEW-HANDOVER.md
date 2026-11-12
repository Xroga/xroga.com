# Xroga Browser Operator: private review build, install and test guide

Not a public release. This guide is for the owner's hands-on testing of the private build against the **staging** backend. Production is untouched.

## 1. What you are installing

| Item | Value |
| --- | --- |
| Source | branch `claude/ops-plugin-actions-20261111` (PR #965) for the engine; `claude/ops-integrated-20261112` adds Codex's #971 activity UI |
| Backend | staging Cloud Run service `xroga-api-universal-staging`, tag `browser-op-1110` (image `direct2-1112`, commit 51b43b527, includes the strict zero-model-read rule) |
| Model | DeepSeek V4.1 Flash 1017 through Zurelay (the only model; no other LLM is used by any path) |
| Eligible accounts | only the owner account on the server allowlist |
| Package (staging-keyed, use this one) | `C:/xr-review-builds/xroga-browser-operator-staging-0.2.8-92f38c7b2.zip`, SHA-256 `c000caff7b6590590783f7a2af4bca9d0112d1e98d14e2f08be1911abae86d95`, built from `claude/ops-integrated-20261112` at `92f38c7b2` (#965 + Codex #971) |
| Other packages in the folder | `...-0.2.8-acea9973f.zip` and `...-c1a36b89a.zip` are production-mode builds with no pinned key; they will not pair with staging |

A package with no pinned key gets a random extension ID, and the backend only accepts the pinned test ID, so **use the staging-keyed package** (its name says `staging`). Pairing a package with a different ID fails by design.

## 2. Install (Chrome)

1. Extract the zip to a folder you will keep (do not delete it while testing).
2. Open `chrome://extensions`, turn on Developer mode, choose Load unpacked, select the folder that contains `manifest.json`.
3. Check that the extension ID shown equals the approved test ID (`ogebkgkppocnjeojdbkiokcpeaenonop`).
4. Open the Xroga side panel on any https page, choose Connect Xroga Workspace, sign in with the allowlisted account in the tab it opens. The panel then says "Signed in to Xroga".
5. Chrome shows its yellow "started debugging this browser" bar while a task runs. That is expected: Xroga drives the page through Chrome's debugger interface.

Update: replace the folder contents and press Reload on the extension card. Uninstall: Remove on the card (this deletes the extension's local data).

## 3. A 20-minute testing checklist

1. **Fast read**: "Open iana.org and tell me the heading". Expect an answer in a few seconds with the note "Answered directly from the page", and no model call.
2. **Ordinary task**: "Open example.com, click the link, tell me what the next page says". Expect a Black Hole header while working, real activity rows, a Stop button, then the answer.
3. **Form**: use any public form (for example a todo app) to add two items and confirm the list. Check the final answer names what was done.
4. **Research**: "What are the best SEO practices this year". Expect sources and links, not a refusal.
5. **Parallel work**: "Check the home pages of example.com, iana.org and wikipedia.org in parallel and give me the titles". Expect up to three workers, a result for each, never more than four tasks.
6. **Approval**: ask for something that changes an app you connected (only if you connected one). Expect an approval card naming the account and arguments; deny it once and confirm nothing changed.
7. **Missing connection**: ask to update a spreadsheet row without connecting any app. Expect a hand-over asking you to connect the app, then continuation after you press Done.
8. **Stop and resume**: start a longer task, press Stop, then continue it. Expect the same conversation and no repeated completed steps.
9. **Restart**: close Chrome mid-task, reopen, open the side panel. Expect the task listed as paused and resumable.
10. **Hidden tab**: run a task on a tab you then switch away from. Expect it to continue; the pointer appears when you switch back.
11. **Privacy**: Settings, Data, Delete everything. Expect conversations, workflow hints and timings gone.
12. **Account**: Sign out in the panel, then confirm a new task cannot start.

## 4. Reporting a problem

Send: the time, what you asked, what you expected, what happened; a screenshot of the side panel; the run's conversation exported from Settings, Data; and, if the task did not start or stopped, the output of `chrome://extensions`, Xroga, "Inspect views: service worker", Console (copy the red lines). Do not paste secrets. Cost and timing for a run are also stored locally as phase timings (no page text) and can be read from the service worker console: `(await chrome.storage.local.get('xroga_perf_v1')).xroga_perf_v1`.

## 5. Rollback and reinstall

- Extension: Remove it on `chrome://extensions`, extract the previous zip, Load unpacked again.
- Staging backend: `gcloud run services update-traffic` is not needed (the tag has 0% of traffic); to stop testing, remove your account from `XROGA_LOCAL_BROWSER_ALLOWED_USER_IDS` and the browser device is denied.
- Production: not involved.

## 6. Known limits (do not report as bugs)

No vision: the model cannot see screenshots, so canvas and image-only controls only work where the page exposes structure. No real third-party account (Sheets, ads, design, video tools) has been tested. A tab that Chrome hides runs about 4 s slower per ten clicks than a visible one (Chrome throttling). The security review of the Composio egress path and the zero-model completion rule is still pending, so this build is not for production.
